import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.errors import REQUEST_ID_HEADER, register_error_handlers
from app.logging_config import configure_logging
from app.middleware import RequestContextMiddleware
from app.routers import health, plans
from app.schemas.errors import ErrorResponse
from app.services.llm.extractor import IntentExtractor, build_providers
from app.services.planning.factory import build_plan_builder

log = logging.getLogger(__name__)

# Documented on every operation so the generated OpenAPI/TS types describe real error bodies.
_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "Request validation failed."},
    500: {"model": ErrorResponse, "description": "Unexpected server error."},
}


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    app.state.accepting_traffic = True
    log.info("startup complete", extra={"version": __version__})
    async with httpx.AsyncClient(headers={"User-Agent": get_settings().http_user_agent}) as http:
        # Tests may pre-set these; only build real ones when absent.
        if not hasattr(app.state, "intent_extractor"):
            app.state.intent_extractor = IntentExtractor(build_providers(get_settings(), http))
        if getattr(app.state, "plan_builder", None) is None and get_settings().planner_enabled:
            app.state.plan_builder = build_plan_builder(get_settings(), http)
        try:
            yield
        finally:
            app.state.accepting_traffic = False
            log.info("shutting down")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)
    app = FastAPI(
        title="ExploreAI API",
        version=__version__,
        description="Itinerary generation from real OpenStreetMap places.",
        lifespan=_lifespan,
    )
    app.state.accepting_traffic = False  # flipped on by the lifespan
    app.state.readiness_checks = {}
    app.state.plan_builder = None  # built in the lifespan unless PLANNER_ENABLED=false
    app.state.pipeline_timeout_s = settings.pipeline_timeout_seconds
    # Order matters: the last middleware added is outermost, so request ids wrap CORS responses.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        # `next dev` silently moves to :3001+ when :3000 is busy, and people open 127.0.0.1; in
        # development accept any loopback port. Production uses CORS_ORIGINS only.
        allow_origin_regex=(
            r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"
            if settings.app_env == "development"
            else None
        ),
        allow_credentials=True,  # session cookie for auth
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[REQUEST_ID_HEADER],
    )
    app.add_middleware(RequestContextMiddleware)
    register_error_handlers(app)
    app.include_router(health.router, prefix="/api/v1", responses=_ERROR_RESPONSES)
    app.include_router(plans.router, prefix="/api/v1", responses=_ERROR_RESPONSES)
    return app


app = create_app()
