from fastapi import APIRouter, Request, Response

from app import __version__
from app.config import get_settings
from app.schemas.health import HealthResponse, ReadinessResponse
from app.services import readiness

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse, operation_id="getHealth")
async def get_health() -> HealthResponse:
    """Liveness: the process is up. Never touches dependencies."""
    return HealthResponse(status="ok", version=__version__, environment=get_settings().app_env)


@router.get(
    "/ready",
    response_model=ReadinessResponse,
    response_model_exclude_none=True,
    operation_id="getReadiness",
    responses={503: {"model": ReadinessResponse, "description": "Not ready to serve traffic."}},
)
async def get_readiness(request: Request, response: Response) -> ReadinessResponse:
    """Readiness: 200 when every registered check passes, 503 otherwise."""
    state = request.app.state
    result = await readiness.evaluate(
        getattr(state, "accepting_traffic", False), getattr(state, "readiness_checks", {})
    )
    if result.status != "ready":
        response.status_code = 503
    return result
