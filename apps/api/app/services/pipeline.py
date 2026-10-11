"""Plan-generation pipeline: request -> intent -> (clarify | build plan) -> SSE events.

Implemented here: request handling, LLM/fallback intent extraction, clarification, event
sequencing, final-plan validation, error mapping, timeout and cancellation safety.

NOT implemented (no code exists in the repo): place retrieval, ranking, routing and the
deterministic scheduler. They plug in through ``PlanBuilder``. With no builder configured the
stream ends with an explicit error event; it never emits fabricated places or itineraries.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable

from pydantic import ValidationError

from app.schemas.intent import Intent
from app.schemas.plans import (
    CompleteEvent,
    ErrorEvent,
    Plan,
    PlanRequest,
    PlanStreamEvent,
    StatusEvent,
    StepKey,
    StopEvent,
)
from app.services.llm.extractor import IntentExtractor

logger = logging.getLogger(__name__)

NO_BUILDER_MESSAGE = (
    "Itinerary generation is not available yet: place search and scheduling are not set up."
)
GENERIC_FAILURE = "We couldn't build a plan right now. Please try again."


class PlanningError(Exception):
    """A user-presentable reason a plan could not be built (no candidates, infeasible, ...)."""


class PlanBuilder(Protocol):
    async def build(self, intent: Intent, request: PlanRequest) -> Plan:
        """Deterministically build a feasible Plan from real, source-backed places.

        Hard constraints (budget, time, route validity) are enforced here, in code. Raise
        PlanningError for expected failures. May emit progress through ``progress``.
        """
        ...


@runtime_checkable
class StreamingPlanBuilder(Protocol):
    """Optional extension: a builder that reports progress while it works.

    Yields StatusEvent progress items, then exactly one Plan. Used instead of ``build`` when
    present; the PlanBuilder contract itself is unchanged.
    """

    def build_stream(
        self, intent: Intent, request: PlanRequest
    ) -> AsyncIterator[StatusEvent | Plan]: ...


def _status(step: StepKey, message: str) -> StatusEvent:
    return StatusEvent(step=step, message=message)


async def generate_plan_events(
    request: PlanRequest,
    extractor: IntentExtractor,
    builder: PlanBuilder | None,
    *,
    timeout_s: float = 120,
) -> AsyncIterator[PlanStreamEvent]:
    """Yield status*, then stop*, then exactly one terminal event (complete | error).

    Cancellation (client disconnect) propagates as CancelledError with no further events.
    """
    try:
        async with asyncio.timeout(timeout_s):
            async for ev in _run(request, extractor, builder):
                yield ev
    except TimeoutError:
        logger.warning("plan generation timed out")
        yield PlanStreamEvent(ErrorEvent(message="Plan generation took too long. Please retry."))
    except Exception:
        # Details go to the log only; never to the client (no prompts, keys, or internals).
        logger.exception("plan generation failed")
        yield PlanStreamEvent(ErrorEvent(message=GENERIC_FAILURE))


async def _run(
    request: PlanRequest, extractor: IntentExtractor, builder: PlanBuilder | None
) -> AsyncIterator[PlanStreamEvent]:
    yield PlanStreamEvent(_status("understanding", "Understanding your request..."))
    result = await extractor.extract(
        request.prompt, has_device_location=request.location is not None, city=request.city
    )
    intent = result.intent
    if intent.needs_clarification:
        yield PlanStreamEvent(ErrorEvent(message=" ".join(intent.clarifications)))
        return

    if builder is None:
        yield PlanStreamEvent(ErrorEvent(message=NO_BUILDER_MESSAGE))
        return

    yield PlanStreamEvent(_status("finding_places", "Finding places..."))
    try:
        built: Plan | None = None
        if isinstance(builder, StreamingPlanBuilder):
            async for item in builder.build_stream(intent, request):
                if isinstance(item, StatusEvent):
                    yield PlanStreamEvent(item)
                else:
                    built = item
        else:
            built = await builder.build(intent, request)
        if built is None:
            raise ValueError("builder produced no plan")
        plan = Plan.model_validate(built.model_dump())  # re-validate before anything is emitted
    except PlanningError as exc:
        yield PlanStreamEvent(ErrorEvent(message=str(exc) or GENERIC_FAILURE))
        return
    except (ValidationError, ValueError):
        logger.error("builder returned an invalid plan")
        yield PlanStreamEvent(ErrorEvent(message=GENERIC_FAILURE))
        return

    legs = {leg.to_stop_id: leg for leg in plan.legs}
    for stop in plan.stops:
        yield PlanStreamEvent(StopEvent(stop=stop, leg_from_previous=legs.get(stop.id)))
    # Integration point: persistence (none exists) and optional explain_plan() go here.
    yield PlanStreamEvent(CompleteEvent(plan=plan))


def encode_sse(event: PlanStreamEvent) -> str:
    """Wire format the web client parses: one `data: <json>` frame per event."""
    return f"data: {event.root.model_dump_json()}\n\n"
