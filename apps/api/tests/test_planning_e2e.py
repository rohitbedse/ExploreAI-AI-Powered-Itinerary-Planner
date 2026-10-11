"""Request -> intent -> geocode -> Overpass -> OSRM -> schedule -> SSE, with only the HTTP layer
mocked (real Photon/Overpass/OSRM clients and the real builder run). No network."""

import json
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.schemas.plans import Plan, PlanStreamEvent
from app.services.llm.extractor import IntentExtractor
from app.services.planning.builder import PROVIDER_DOWN, DeterministicPlanBuilder
from app.services.planning.factory import build_plan_builder
from app.services.planning.geocoding import PhotonGeocoder
from app.services.planning.places import OverpassClient
from app.services.planning.routing import TravelService
from tests.planning_support import (
    NOW,
    make_transport,
    photon_payload,
)

INTENT: dict[str, Any] = {
    "duration_min": 180,
    "location_text": "Koramangala",
    "interests": [
        {"label": "parks", "source": "explicit"},
        {"label": "museums", "source": "explicit"},
        {"label": "cafe", "source": "explicit"},
    ],
    "budget": {"amount": 500, "currency": "INR"},
}


class FakeProvider:
    name = "fake"

    async def complete_json(
        self, system: str, user: str, schema: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return INTENT


def _client(transport: httpx.MockTransport) -> TestClient:
    http = httpx.AsyncClient(transport=transport)
    builder = DeterministicPlanBuilder(
        PhotonGeocoder("https://photon.test", http, timeout_s=2, max_retries=0),
        OverpassClient("https://overpass.test/i", http, timeout_s=2, max_retries=0),
        TravelService(None),
        clock=lambda: NOW,
    )
    app = create_app()
    app.state.intent_extractor = IntentExtractor([FakeProvider()])
    app.state.plan_builder = builder
    return TestClient(app, raise_server_exceptions=False)


def _post(c: TestClient) -> list[dict[str, Any]]:
    res = c.post("/api/v1/plans/stream", json={"prompt": "3 hours in Koramangala, parks"})
    assert res.status_code == 200
    return [json.loads(b[6:]) for b in res.text.strip().split("\n\n")]


def test_http_stream_produces_a_real_validated_itinerary() -> None:
    with _client(make_transport()) as c:
        evs = _post(c)
    types = [e["type"] for e in evs]
    assert types[0] == "status" and types[-1] == "complete"
    assert sum(t in ("complete", "error") for t in types) == 1
    first_stop = types.index("stop")
    assert set(types[:first_stop]) == {"status"} and set(types[first_stop:-1]) == {"stop"}
    steps = [e["step"] for e in evs if e["type"] == "status"]
    assert steps == [
        "understanding", "finding_places", "finding_places", "finding_places",
        "scoring", "checking_routes", "writing",
    ]  # fmt: skip
    plan = Plan.model_validate(evs[-1]["plan"])
    assert [e["stop"]["id"] for e in evs if e["type"] == "stop"] == [s.id for s in plan.stops]
    assert all(s.osm_id and s.osm_url for s in plan.stops)
    PlanStreamEvent.model_validate(evs[-1])  # wire shape matches the public contract
    # budget was given; some stops are unpriced, so it must not be claimed as verified
    if plan.summary.unpriced_stops:
        assert plan.summary.budget_status == "unverified"


def test_http_overpass_failure_is_one_clean_error_event() -> None:
    with _client(make_transport(overpass_status=503)) as c:
        evs = _post(c)
    assert evs[-1] == {"type": "error", "message": PROVIDER_DOWN}
    assert not any(e["type"] in ("stop", "complete") for e in evs)


def test_http_unknown_location_is_a_clear_error_and_no_search_happens() -> None:
    calls: list[str] = []
    with _client(make_transport(photon=photon_payload(), calls=calls)) as c:
        evs = _post(c)
    assert evs[-1]["type"] == "error" and "couldn't find" in evs[-1]["message"]
    assert not any("overpass" in h for h in calls)


def test_http_no_places_found_is_an_error_not_a_fake_plan() -> None:
    with _client(make_transport(elements=[])) as c:
        evs = _post(c)
    assert evs[-1]["type"] == "error" and "No matching places" in evs[-1]["message"]
    assert not any(e["type"] == "stop" for e in evs)


def test_http_garbage_from_providers_never_leaks() -> None:
    t = make_transport(overpass_body=b"<html>traceback password=hunter2</html>")
    with _client(t) as c:
        evs = _post(c)
    assert evs[-1]["type"] == "error" and "hunter2" not in json.dumps(evs)


def test_factory_wires_the_builder_without_network() -> None:
    settings = Settings(_env_file=None, osrm_walk_url="https://walk.test")
    b = build_plan_builder(settings, httpx.AsyncClient(transport=make_transport()))
    assert isinstance(b, DeterministicPlanBuilder)


def test_lifespan_installs_builder_only_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    with TestClient(create_app()) as c:  # conftest sets PLANNER_ENABLED=false
        assert c.app.state.plan_builder is None  # type: ignore[attr-defined]
    monkeypatch.setenv("PLANNER_ENABLED", "true")
    from app.config import get_settings

    get_settings.cache_clear()
    with TestClient(create_app()) as c:
        assert isinstance(c.app.state.plan_builder, DeterministicPlanBuilder)  # type: ignore[attr-defined]
