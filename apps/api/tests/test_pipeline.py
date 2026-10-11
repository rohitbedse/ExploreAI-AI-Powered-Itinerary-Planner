import asyncio
import json
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.intent import Intent
from app.schemas.plans import (
    GeoPoint,
    Plan,
    PlanRequest,
    PlanStop,
    PlanSummary,
    TravelLeg,
)
from app.services.llm.base import ProviderError
from app.services.llm.extractor import IntentExtractor
from app.services.pipeline import (
    GENERIC_FAILURE,
    NO_BUILDER_MESSAGE,
    PlanningError,
    generate_plan_events,
)

GOOD: dict[str, Any] = {
    "budget": {"amount": 500, "currency": "INR"},
    "duration_min": 180,
    "group_size": 1,
    "interests": [{"label": "relaxing", "source": "explicit"}],
    "near_user": True,
    "constraints": [],
    "contradictions": [],
}
LOC = {"lat": 12.9, "lon": 77.6}


class FakeProvider:
    name = "fake"

    def __init__(self, out: Any) -> None:
        self.out = out

    async def complete_json(
        self, system: str, user: str, schema: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        if isinstance(self.out, Exception):
            raise self.out
        return self.out  # type: ignore[no-any-return]


def _plan() -> Plan:
    """Test data for a *mock* builder only; production code never constructs plans like this."""
    t = datetime(2026, 10, 9, 10, 0, tzinfo=UTC)
    p = GeoPoint(**LOC)
    return Plan(
        id="p",
        title="t",
        prompt="x",
        stops=[
            PlanStop(id="a", name="A", category="park", location=p, start=t,
                     duration_min=30, cost=0, why="w"),
            PlanStop(id="b", name="B", category="cafe", location=p, start=t,
                     duration_min=30, cost=50, why="w"),
        ],
        legs=[TravelLeg(from_stop_id="a", to_stop_id="b", mode="walk", distance_m=100,
                        duration_min=2)],
        summary=PlanSummary(total_cost=50, total_duration_min=62, total_travel_min=2),
        created_at=t,
    )  # fmt: skip


class Builder:
    def __init__(self, result: Any) -> None:
        self.result = result

    async def build(self, intent: Intent, request: PlanRequest) -> Plan:
        if isinstance(self.result, Exception):
            raise self.result
        return self.result  # type: ignore[no-any-return]


async def _collect(
    prompt: str, provider: Any, builder: Any, *, location: bool = True, limit_s: float = 5
) -> list[dict[str, Any]]:
    req = PlanRequest(prompt=prompt, location=GeoPoint(**LOC) if location else None)
    ex = IntentExtractor([provider] if provider else [])
    return [
        e.root.model_dump(mode="json")
        async for e in generate_plan_events(req, ex, builder, timeout_s=limit_s)
    ]


def _types(evs: list[dict[str, Any]]) -> list[str]:
    return [e["type"] for e in evs]


async def test_success_event_order_and_single_terminal() -> None:
    evs = await _collect("relax nearby", FakeProvider(GOOD), Builder(_plan()))
    assert _types(evs) == ["status", "status", "stop", "stop", "complete"]
    assert [e["step"] for e in evs[:2]] == ["understanding", "finding_places"]
    assert evs[2]["leg_from_previous"] is None
    assert evs[3]["leg_from_previous"]["from_stop_id"] == "a"
    assert sum(t in ("complete", "error") for t in _types(evs)) == 1
    assert evs[-1]["plan"]["id"] == "p"


async def test_missing_essentials_asks_for_clarification_and_stops() -> None:
    evs = await _collect(
        "something fun",
        FakeProvider({**GOOD, "duration_min": None}),
        Builder(_plan()),
        location=False,
    )
    assert _types(evs) == ["status", "error"]
    assert "time" in evs[-1]["message"] and "location" in evs[-1]["message"].lower()


async def test_no_builder_is_an_honest_error_never_a_fake_plan() -> None:
    evs = await _collect("relax nearby", FakeProvider(GOOD), None)
    assert _types(evs) == ["status", "error"] and evs[-1]["message"] == NO_BUILDER_MESSAGE


@pytest.mark.parametrize("msg", ["No places found nearby.", "Not feasible within 90 minutes."])
async def test_planning_errors_surface_as_error_event(msg: str) -> None:
    evs = await _collect("xxx", FakeProvider(GOOD), Builder(PlanningError(msg)))
    assert _types(evs) == ["status", "status", "error"] and evs[-1]["message"] == msg


async def test_unexpected_builder_failure_is_generic_and_leaks_nothing() -> None:
    evs = await _collect("xxx", FakeProvider(GOOD), Builder(RuntimeError("db password=hunter2")))
    assert evs[-1] == {"type": "error", "message": GENERIC_FAILURE}


async def test_invalid_plan_is_never_emitted() -> None:
    bad = _plan().model_copy(
        update={
            "summary": PlanSummary.model_construct(
                total_cost=-1, currency="INR", total_duration_min=1, total_travel_min=1
            )
        }
    )
    evs = await _collect("xxx", FakeProvider(GOOD), Builder(bad))
    assert "stop" not in _types(evs) and "complete" not in _types(evs)
    assert evs[-1]["type"] == "error"


@pytest.mark.parametrize(
    "out", [ProviderError("timeout", retryable=True), {"duration_min": "soon"}, {"junk": 1}]
)
async def test_llm_failures_degrade_to_rules_not_crash(out: Any) -> None:
    evs = await _collect("I have 2 hours nearby", FakeProvider(out), Builder(_plan()))
    assert evs[-1]["type"] == "complete"  # rule-based parse found duration + near_user


async def test_llm_failure_and_unparseable_prompt_asks_for_clarification() -> None:
    evs = await _collect(
        "hmm", FakeProvider(ProviderError("timeout", retryable=True)), Builder(_plan()),
        location=False,
    )  # fmt: skip
    assert evs[-1]["type"] == "error" and "time" in evs[-1]["message"]


async def test_pipeline_timeout_emits_single_error() -> None:
    class Slow:
        async def build(self, intent: Intent, request: PlanRequest) -> Plan:
            await asyncio.sleep(5)
            return _plan()

    evs = await _collect("xxx", FakeProvider(GOOD), Slow(), limit_s=0.05)
    assert evs[-1]["type"] == "error" and "too long" in evs[-1]["message"]
    assert sum(t in ("complete", "error") for t in _types(evs)) == 1


async def test_cancellation_stops_without_further_events() -> None:
    started = asyncio.Event()

    class Hang:
        async def build(self, intent: Intent, request: PlanRequest) -> Plan:
            started.set()
            await asyncio.sleep(30)
            return _plan()

    got: list[Any] = []

    async def consume() -> None:
        ex = IntentExtractor([FakeProvider(GOOD)])
        req = PlanRequest(prompt="xxx", location=GeoPoint(**LOC))
        async for e in generate_plan_events(req, ex, Hang()):
            got.append(e)

    task = asyncio.create_task(consume())
    await asyncio.wait_for(started.wait(), 2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert all(e.root.type == "status" for e in got)


# ---------------------------------------------------------------- HTTP / wire format
def _frames(body: str) -> list[dict[str, Any]]:
    out = []
    for block in body.strip().split("\n\n"):
        assert block.startswith("data: ") and "\n" not in block
        out.append(json.loads(block[6:]))
    return out


def _app(provider: Any, builder: Any) -> TestClient:
    app = create_app()
    app.state.intent_extractor = IntentExtractor([provider] if provider else [])
    app.state.plan_builder = builder
    return TestClient(app, raise_server_exceptions=False)


def test_http_stream_success_wire_format() -> None:
    with _app(FakeProvider(GOOD), Builder(_plan())) as c:
        res = c.post("/api/v1/plans/stream", json={"prompt": "relax nearby", "location": LOC})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")
    assert res.headers["cache-control"] == "no-cache"
    evs = _frames(res.text)
    assert _types(evs) == ["status", "status", "stop", "stop", "complete"]


def test_http_default_app_without_builder_ends_in_error_event() -> None:
    with TestClient(create_app(), raise_server_exceptions=False) as c:  # no keys -> fallback
        res = c.post("/api/v1/plans/stream", json={"prompt": "2 hours nearby", "location": LOC})
    evs = _frames(res.text)
    assert evs[-1] == {"type": "error", "message": NO_BUILDER_MESSAGE}


def test_http_validation_error_still_uses_envelope() -> None:
    with _app(None, None) as c:
        res = c.post("/api/v1/plans/stream", json={"prompt": ""})
    assert res.status_code == 422 and res.json()["code"] == "validation_error"
