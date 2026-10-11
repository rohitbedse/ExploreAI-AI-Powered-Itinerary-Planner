"""Plan and auth routes. Contract only: handlers return 501 until the pipeline lands."""

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any, NoReturn

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.schemas import (
    LoginRequest,
    Plan,
    PlanRequest,
    PlanStreamEvent,
    ReviseRequest,
    SavedPlanItem,
    User,
)
from app.services.llm.extractor import IntentExtractor
from app.services.pipeline import encode_sse, generate_plan_events

router = APIRouter()
log = logging.getLogger(__name__)

_SSE: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "Server-sent events; each `data:` line is a PlanStreamEvent JSON object.",
        "model": PlanStreamEvent,
        "content": {"text/event-stream": {}},
    }
}


def _not_implemented() -> NoReturn:
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.post("/plans/stream", tags=["plans"], operation_id="streamPlan", responses=_SSE)
async def stream_plan(body: PlanRequest, request: Request) -> StreamingResponse:
    extractor: IntentExtractor = request.app.state.intent_extractor
    builder = getattr(request.app.state, "plan_builder", None)
    timeout_s: float = request.app.state.pipeline_timeout_s

    async def frames() -> AsyncIterator[str]:
        try:
            async for event in generate_plan_events(body, extractor, builder, timeout_s=timeout_s):
                yield encode_sse(event)
        except asyncio.CancelledError:
            log.info("client disconnected; plan stream cancelled")
            raise

    return StreamingResponse(
        frames(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/plans/saved", tags=["plans"], operation_id="listSavedPlans")
async def list_saved_plans() -> list[SavedPlanItem]:
    _not_implemented()


@router.get("/plans/{plan_id}", tags=["plans"], operation_id="getPlan")
async def get_plan(plan_id: str) -> Plan:
    _not_implemented()


@router.post(
    "/plans/{plan_id}/revise/stream", tags=["plans"], operation_id="streamRevision", responses=_SSE
)
async def stream_revision(plan_id: str, body: ReviseRequest) -> None:
    _not_implemented()


@router.post("/plans/{plan_id}/save", tags=["plans"], operation_id="savePlan")
async def save_plan(plan_id: str) -> Plan:
    _not_implemented()


@router.post("/auth/login", tags=["auth"], operation_id="login")
async def login(body: LoginRequest) -> User:
    """On success the API sets an httpOnly session cookie (no token in JS)."""
    _not_implemented()


@router.post("/auth/logout", tags=["auth"], operation_id="logout", status_code=204)
async def logout() -> None:
    _not_implemented()


@router.get("/auth/me", tags=["auth"], operation_id="getMe")
async def get_me() -> User:
    _not_implemented()
