"""Opening hours / prices, the scheduler, and the plan builder (all providers faked)."""

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest

from app.schemas.intent import Budget, Intent, Interest
from app.schemas.plans import GeoPoint, Plan, PlanRequest, StatusEvent
from app.services.pipeline import PlanningError
from app.services.planning.builder import (
    PROVIDER_DOWN,
    DeterministicPlanBuilder,
    apply_constraints,
    check_plan,
    match_categories,
)
from app.services.planning.facts import entry_price, is_open, parse_opening_hours
from app.services.planning.geocoding import (
    AmbiguousLocationError,
    GeocodeResult,
    LocationNotFoundError,
)
from app.services.planning.http import UpstreamError
from app.services.planning.places import Place
from app.services.planning.routing import Hop, TravelMatrix, TravelService
from app.services.planning.scheduler import Candidate, schedule
from tests.planning_support import NOW, ORIGIN, el, overpass_elements

FRI_10 = datetime(2026, 10, 9, 10, 0)  # a Friday


# ------------------------------------------------------------------ opening hours
@pytest.mark.parametrize(
    ("raw", "start", "dur", "expected"),
    [
        ("Mo-Su 09:00-18:00", FRI_10, 60, True),
        ("Mo-Su 09:00-18:00", FRI_10, 9 * 60, False),  # would run past closing
        ("Mo-Fr 09:00-17:00; Sa,Su off", FRI_10, 60, True),
        ("Mo-Fr 09:00-17:00", datetime(2026, 10, 10, 10, 0), 60, False),  # Saturday: closed
        ("Mo-Su 09:00-12:00,14:00-18:00", datetime(2026, 10, 9, 12, 30), 30, False),
        ("Mo-Su 09:00-12:00,14:00-18:00", datetime(2026, 10, 9, 14, 0), 30, True),
        ("22:00-02:00", datetime(2026, 10, 9, 23, 0), 120, True),  # past midnight
        ("24/7", datetime(2026, 10, 9, 3, 0), 600, True),
        ("Mo-Su 09:00-18:00; Fr off", FRI_10, 30, False),  # later rule overrides
    ],
)
def test_is_open_known_hours(raw: str, start: datetime, dur: int, expected: bool) -> None:
    assert is_open(raw, start, dur) is expected


@pytest.mark.parametrize(
    "raw",
    [None, "", "Mo-Fr 09:00-17:00; PH off", "sunrise-sunset", "by appointment", "Mo-Fr 9-17"],
)
def test_unparseable_or_missing_hours_are_unknown_not_closed(raw: str | None) -> None:
    assert is_open(raw, FRI_10, 30) is None


def test_parse_opening_hours_rejects_garbage() -> None:
    assert parse_opening_hours("Mo-Xx 10:00-11:00") is None


# ------------------------------------------------------------------ prices
@pytest.mark.parametrize(
    ("tags", "expected"),
    [
        ({"fee": "no"}, (0.0, True)),
        ({"charge": "150 INR"}, (150.0, True)),
        ({"charge": "INR 99.50", "fee": "yes"}, (99.5, True)),
        ({"fee": "yes"}, (None, False)),  # fee but no amount: unknown, not 0
        ({}, (None, False)),
        ({"charge": "50 INR; 100 INR"}, (None, False)),  # tiers: ambiguous
        ({"charge": "5 USD"}, (None, False)),  # other currency: not comparable
    ],
)
def test_entry_price_is_verified_or_unknown(tags: dict[str, str], expected: Any) -> None:
    assert entry_price(tags, "INR") == expected


# ------------------------------------------------------------------ scheduler
def _place(i: int, cat: str = "park", **tags: str) -> Place:
    return Place(
        osm_id=f"node/{i}",
        name=f"P{i}",
        location=GeoPoint(lat=12.0 + i / 1000, lon=77.0),
        category=cat,
        tags=tags,
    )


def _cand(
    i: int, *, price: float | None = None, rel: float = 1.0, visit: int = 30, **tags: str
) -> Candidate:
    return Candidate(_place(i, **tags), rel, visit, price, price is not None)


def _matrix(n: int, secs: int = 300) -> TravelMatrix:
    hops: list[list[Hop | None]] = [
        [Hop(0, 0) if i == j else Hop(400, secs) for j in range(n + 1)] for i in range(n + 1)
    ]
    return TravelMatrix(hops, "route")


START = datetime(2026, 10, 9, 10, 0, tzinfo=UTC)


def test_schedule_respects_window_and_is_chronological() -> None:
    cands = [_cand(i) for i in range(1, 7)]
    s = schedule(cands, _matrix(6), start=START, window_min=120, budget_total=None)
    assert 1 <= len(s.visits) <= 3
    end = START + timedelta(minutes=120)
    cursor = START
    for v in s.visits:
        assert v.start >= cursor
        cursor = v.start + timedelta(minutes=v.candidate.visit_min)
    assert cursor <= end


def test_schedule_nothing_fits_reports_time_skips() -> None:
    s = schedule([_cand(1, visit=90)], _matrix(1), start=START, window_min=60, budget_total=None)
    assert s.visits == [] and s.skipped_time == 1


def test_known_prices_are_capped_by_budget_unknown_prices_are_not_rejected() -> None:
    cands = [_cand(1, price=300.0), _cand(2, price=300.0), _cand(3, price=None)]
    s = schedule(cands, _matrix(3), start=START, window_min=300, budget_total=400.0)
    chosen = {v.index for v in s.visits}
    assert 2 in chosen  # unknown price kept
    assert len(chosen & {0, 1}) == 1  # only one 300 fits in 400
    assert s.skipped_budget == 1


def test_group_size_multiplies_known_prices_against_budget() -> None:
    s = schedule(
        [_cand(1, price=300.0)], _matrix(1), start=START, window_min=120,
        budget_total=500.0, group_size=2,
    )  # fmt: skip
    assert s.visits == [] and s.skipped_budget == 1


def test_free_places_are_not_rejected_by_tiny_budget() -> None:
    s = schedule([_cand(1, price=0.0)], _matrix(1), start=START, window_min=120, budget_total=1.0)
    assert len(s.visits) == 1


def test_closed_venue_excluded_and_unknown_hours_flagged() -> None:
    closed = _cand(1, opening_hours="Mo-Su 18:00-20:00")
    unknown = _cand(2)
    s = schedule([closed, unknown], _matrix(2), start=START, window_min=240, budget_total=None)
    assert [v.index for v in s.visits] == [1]
    assert s.visits[0].hours_verified is False and s.skipped_closed == 1


def test_open_venue_is_marked_verified() -> None:
    s = schedule(
        [_cand(1, opening_hours="Mo-Su 08:00-20:00")], _matrix(1),
        start=START, window_min=120, budget_total=None,
    )  # fmt: skip
    assert s.visits[0].hours_verified is True


def test_unreachable_pair_is_never_used() -> None:
    m = _matrix(2)
    m.hops[0][1] = None
    s = schedule([_cand(1), _cand(2)], m, start=START, window_min=240, budget_total=None)
    assert 0 not in [v.index for v in s.visits] or s.visits[0].index != 0


def test_schedule_is_deterministic_and_prefers_relevance_then_diversity() -> None:
    cands = [_cand(1, rel=1.0), _cand(2, rel=1.0), _cand(3, rel=2.0)]
    a = schedule(cands, _matrix(3), start=START, window_min=240, budget_total=None)
    b = schedule(cands, _matrix(3), start=START, window_min=240, budget_total=None)
    assert [v.index for v in a.visits] == [v.index for v in b.visits]
    assert a.visits[0].index == 2


# ------------------------------------------------------------------ builder pieces
def _intent(**kw: Any) -> Intent:
    base: dict[str, Any] = {
        "duration_min": 180,
        "location_text": "Koramangala",
        "interests": [Interest(label="parks", source="explicit")],
    }
    return Intent(**(base | kw))


def test_interest_matching_unmatched_and_default() -> None:
    w, unmatched, default = match_categories(
        _intent(interests=[Interest(label="museums", source="explicit"),
                           Interest(label="skydiving", source="explicit")])
    )  # fmt: skip
    assert "museum" in w and unmatched == ["skydiving"] and not default
    w2, _, default2 = match_categories(_intent(interests=[]))
    assert default2 and "park" in w2
    w3, _, _ = match_categories(
        _intent(interests=[Interest(label="street food", source="inferred")])
    )
    assert w3["street_food"] == pytest.approx(0.6)


@pytest.mark.parametrize(
    ("label", "slug"),
    [("relaxation", "park"), ("animals", "family"), ("walking", "park"),
     ("indoor activities", "museum"), ("cultural sites", "museum"), ("good food", "restaurant")],
)  # fmt: skip
def test_interest_matching_tolerates_llm_wording(label: str, slug: str) -> None:
    w, unmatched, default = match_categories(
        _intent(interests=[Interest(label=label, source="explicit")])
    )
    assert slug in w and unmatched == [] and not default


def test_interest_matching_falls_back_to_default_mix_when_nothing_matches() -> None:
    w, unmatched, default = match_categories(
        _intent(interests=[Interest(label="skydiving", source="explicit")])
    )
    assert default and unmatched == ["skydiving"] and "park" in w


def test_constraints_filter_verifiable_ones_and_report_the_rest() -> None:
    veg = _place(1, "restaurant", **{"diet:vegetarian": "yes"})
    nonveg = _place(2, "restaurant")
    park = _place(3, "park")
    kept, verified, unsupported = apply_constraints(
        [veg, nonveg, park], ["vegetarian", "quiet atmosphere"]
    )
    assert {p.osm_id for p in kept} == {"node/1", "node/3"}
    assert verified == ["vegetarian"] and unsupported == ["quiet atmosphere"]
    wc, _, _ = apply_constraints(
        [_place(4, wheelchair="yes"), _place(5, wheelchair="limited"), _place(6)],
        ["wheelchair accessible"],
    )
    assert [p.osm_id for p in wc] == ["node/4"]


# ------------------------------------------------------------------ builder end to end (fakes)
class FakeGeocoder:
    def __init__(self, result: Any = None) -> None:
        self.result = result or GeocodeResult(label="Koramangala, Bengaluru", location=ORIGIN)
        self.queries: list[tuple[str, str | None]] = []

    async def geocode(self, text: str, *, hint: str | None = None) -> GeocodeResult:
        self.queries.append((text, hint))
        if isinstance(self.result, Exception):
            raise self.result
        assert isinstance(self.result, GeocodeResult)
        return self.result


class FakePlaces:
    def __init__(self, result: Any) -> None:
        self.result = result
        self.calls: list[tuple[int, list[str]]] = []

    async def search(self, center: GeoPoint, radius_m: int, categories: list[str]) -> list[Place]:
        self.calls.append((radius_m, categories))
        if isinstance(self.result, Exception):
            raise self.result
        return [p for p in self.result if p.category in categories]  # like Overpass


def _real_places(extra: list[dict[str, Any]] | None = None) -> list[Place]:
    from app.services.planning.places import CATEGORIES, normalize_element

    cats = list(CATEGORIES)
    out = [normalize_element(e, cats) for e in [*overpass_elements(), *(extra or [])]]
    return [p for p in out if p]


def _builder(
    places: Any, geocoder: Any = None, router: Any = None
) -> tuple[DeterministicPlanBuilder, FakePlaces, FakeGeocoder]:
    fp = FakePlaces(places)
    fg = geocoder or FakeGeocoder()
    return DeterministicPlanBuilder(fg, fp, TravelService(router), clock=lambda: NOW), fp, fg


REQ = PlanRequest(prompt="a relaxed afternoon")


async def _build(intent: Intent, places: Any = None, **kw: Any) -> Plan:
    b, _, _ = _builder(_real_places() if places is None else places, **kw)
    return await b.build(intent, REQ)


async def test_end_to_end_plan_is_source_backed_and_honest_about_unknowns() -> None:
    intent = _intent(
        interests=[Interest(label="parks", source="explicit"),
                   Interest(label="museums", source="explicit"),
                   Interest(label="cafe", source="explicit")],
    )  # fmt: skip
    plan = await _build(intent)
    assert len(plan.stops) >= 2
    names = {p.name for p in _real_places()}
    for s in plan.stops:
        assert s.name in names and s.osm_url == f"https://www.openstreetmap.org/{s.osm_id}"
    # Free (fee=no) is verified 0; cafes/parks without tags are unknown, never 0.
    by_name = {s.name: s for s in plan.stops}
    if "Fixture Museum" in by_name:
        assert (
            by_name["Fixture Museum"].cost == 0
            and by_name["Fixture Museum"].cost_source == "osm_tag"
        )
    for s in plan.stops:
        if s.name in {"Fixture Park", "Fixture Cafe", "Second Fixture Cafe"}:
            assert s.cost is None and s.cost_source == "unknown"
    assert plan.summary.unpriced_stops == sum(s.cost is None for s in plan.stops)
    assert plan.summary.cost_status in ("partial", "unknown", "known")
    assert plan.summary.total_cost == sum(s.cost or 0 for s in plan.stops)
    assert all(leg.source == "estimate" and leg.geometry == [] for leg in plan.legs)
    assert any("straight-line estimates" in n for n in plan.notes)
    check_plan(plan, plan.stops[0].start + timedelta(minutes=600), None)
    assert plan.stops[0].start.utcoffset() == timedelta(hours=5, minutes=30)


async def test_unknown_prices_make_budget_unverified_never_within() -> None:
    intent = _intent(budget=Budget(amount=500))
    plan = await _build(
        intent,
        [p for p in _real_places() if p.category in ("park", "cafe") and "fee" not in p.tags],
    )
    s = plan.summary
    assert s.cost_status == "unknown" and s.total_cost == 0 and s.unpriced_stops == len(plan.stops)
    assert s.budget_status == "unverified" and "cannot be confirmed" in (s.budget_note or "")


async def test_all_priced_within_budget_is_verified_within() -> None:
    places = [p for p in _real_places() if p.tags.get("fee") == "no" or "charge" in p.tags]
    intent = _intent(
        budget=Budget(amount=500),
        interests=[Interest(label="museum", source="explicit"),
                   Interest(label="garden", source="explicit")],
    )  # fmt: skip
    plan = await _build(intent, places)
    assert plan.summary.cost_status == "known" and plan.summary.budget_status == "within"


async def test_known_prices_over_budget_are_excluded_not_exceeded() -> None:
    gallery = [p for p in _real_places() if p.name == "Fixture Gallery"]
    intent = _intent(
        budget=Budget(amount=100), interests=[Interest(label="art", source="explicit")]
    )
    with pytest.raises(PlanningError, match="budget"):
        await _build(intent, gallery)


async def test_per_person_budget_scales_with_group() -> None:
    gallery = [p for p in _real_places() if p.name == "Fixture Gallery"]
    art = [Interest(label="art", source="explicit")]
    ok = _intent(budget=Budget(amount=200, per_person=True), group_size=2, interests=art)
    plan = await _build(ok, gallery)
    assert plan.summary.total_cost == 300 and plan.summary.budget_status == "within"
    too_small = _intent(budget=Budget(amount=200, per_person=False), group_size=2, interests=art)
    with pytest.raises(PlanningError):
        await _build(too_small, gallery)


async def test_geocode_failures_become_clear_planning_errors() -> None:
    for exc, text in [
        (LocationNotFoundError("Atlantis"), "couldn't find"),
        (AmbiguousLocationError("Springfield", ["A", "B"]), "several places"),
        (UpstreamError("photon", "timeout"), "temporarily unavailable"),
    ]:
        b, places, _ = _builder(_real_places(), geocoder=FakeGeocoder(exc))
        with pytest.raises(PlanningError, match=text) as err:
            await b.build(_intent(), REQ)
        assert "photon" not in str(err.value) and places.calls == []  # never searched elsewhere


async def test_never_substitutes_a_location() -> None:
    b, places, geo = _builder(_real_places())
    with pytest.raises(PlanningError, match="Where would you like"):
        await b.build(_intent(location_text=None, near_user=False), REQ)
    with pytest.raises(PlanningError, match="Where would you like"):
        await b.build(_intent(location_text=None, near_user=True), REQ)  # no device location
    assert geo.queries == [] and places.calls == []


async def test_device_location_used_only_when_near_user_and_shared() -> None:
    b, places, geo = _builder(_real_places())
    req = PlanRequest(prompt="nearby", location=ORIGIN)
    plan = await b.build(_intent(location_text=None, near_user=True), req)
    assert plan.stops and geo.queries == [] and places.calls


async def test_city_hint_is_passed_only_when_different_from_text() -> None:
    b, _, geo = _builder(_real_places())
    await b.build(_intent(), PlanRequest(prompt="x y z", city="Bengaluru"))
    await b.build(_intent(), PlanRequest(prompt="x y z", city="koramangala"))
    assert geo.queries == [("Koramangala", "Bengaluru"), ("Koramangala", None)]


async def test_no_places_and_provider_failure_are_distinct_clean_errors() -> None:
    with pytest.raises(PlanningError, match="No matching places"):
        await _build(_intent(), [])
    with pytest.raises(PlanningError) as err:
        await _build(_intent(), UpstreamError("overpass", "http 429"))
    assert str(err.value) == PROVIDER_DOWN


async def test_insufficient_time_is_reported_as_infeasible() -> None:
    with pytest.raises(PlanningError, match="feasible itinerary"):
        await _build(_intent(duration_min=15))


async def test_unmapped_interest_is_reported_not_faked() -> None:
    odd = [Interest(label="skydiving", source="explicit")]
    only_odd = await _build(_intent(interests=odd))
    assert any("skydiving" in n for n in only_odd.notes)
    assert any("general mix" in n for n in only_odd.notes)
    mixed = [
        Interest(label="skydiving", source="explicit"),
        Interest(label="parks", source="explicit"),
    ]
    plan = await _build(_intent(interests=mixed))
    assert any("skydiving" in n for n in plan.notes)


async def test_unverifiable_constraints_exclude_or_disclose() -> None:
    cafes = [Interest(label="coffee", source="explicit")]
    with pytest.raises(PlanningError, match="requirements"):
        await _build(_intent(interests=cafes, constraints=["vegetarian"]))
    plan = await _build(_intent(constraints=["good wifi"]))
    assert any("good wifi" in n and "not applied" in n for n in plan.notes)


async def test_closed_venue_is_skipped_and_hours_flagged_when_unknown() -> None:
    closed = el("node", 201, "Evening Museum", 12.9353, 77.6246,
                {"tourism": "museum", "opening_hours": "Mo-Su 19:00-21:00"})  # fmt: skip
    plan = await _build(
        _intent(interests=[Interest(label="museum", source="explicit")]),
        [p for p in _real_places([closed]) if p.category == "museum"],
    )
    assert "Evening Museum" not in {s.name for s in plan.stops}
    assert all(s.opening_hours_verified for s in plan.stops)  # Fixture Museum is open 9-18


async def test_status_stream_then_single_plan_with_routed_legs() -> None:
    def osrm(req: httpx.Request) -> httpx.Response:
        from tests.planning_support import osrm_table_response

        if "/table/" in req.url.path:
            n = len(req.url.path.rsplit("/", 1)[-1].split(";"))
            return osrm_table_response(n)
        route = {"distance": 400, "duration": 300,
                 "geometry": {"coordinates": [[77.62, 12.93], [77.63, 12.94]]}}  # fmt: skip
        return httpx.Response(200, json={"code": "Ok", "routes": [route]})

    from app.services.planning.routing import Endpoint, OsrmRouter

    router = OsrmRouter(
        {"walk": Endpoint("https://osrm.test", "foot")},
        httpx.AsyncClient(transport=httpx.MockTransport(osrm)),
        timeout_s=2,
        max_retries=0,
    )
    b, _, _ = _builder(_real_places(), router=router)
    intent = _intent(
        interests=[
            Interest(label="parks", source="explicit"),
            Interest(label="museums", source="explicit"),
        ]
    )
    items = [i async for i in b.build_stream(intent, REQ)]
    assert [i.step for i in items[:-1] if isinstance(i, StatusEvent)] == [
        "finding_places", "finding_places", "scoring", "checking_routes", "writing",
    ]  # fmt: skip
    plan = items[-1]
    assert isinstance(plan, Plan) and sum(isinstance(i, Plan) for i in items) == 1
    assert plan.legs and all(leg.source == "route" and len(leg.geometry) == 2 for leg in plan.legs)
    assert not any("straight-line" in n for n in plan.notes)


def test_check_plan_rejects_overrun_and_overlap() -> None:
    import asyncio

    plan = asyncio.run(_build(_intent()))
    first = plan.stops[0].start
    with pytest.raises(ValueError, match="window"):
        check_plan(plan, first, None)
    bad = plan.model_copy(update={"stops": list(reversed(plan.stops))})
    if len(plan.stops) > 1:
        with pytest.raises(ValueError):
            check_plan(bad, first + timedelta(days=1), None)
