"""Geocoding (Photon), place retrieval (Overpass) and routing (OSRM) against mocked transports."""

import json

import httpx
import pytest

from app.schemas.plans import GeoPoint
from app.services.planning.geocoding import (
    AmbiguousLocationError,
    LocationNotFoundError,
    PhotonGeocoder,
)
from app.services.planning.http import UpstreamError
from app.services.planning.places import (
    OverpassClient,
    Place,
    build_query,
    dedupe_places,
    normalize_element,
)
from app.services.planning.routing import (
    Endpoint,
    Hop,
    OsrmRouter,
    TravelService,
    estimate_hop,
    minutes,
)
from tests.planning_support import (
    KORAMANGALA,
    ORIGIN,
    el,
    make_transport,
    osrm_table_response,
    photon_feature,
    photon_payload,
)


@pytest.fixture(autouse=True)
def _no_backoff(monkeypatch: pytest.MonkeyPatch) -> None:
    async def instant(_: float) -> None:
        return None

    monkeypatch.setattr("app.services.planning.http.asyncio.sleep", instant)


def _client(transport: httpx.MockTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=transport)


def _geocoder(transport: httpx.MockTransport, retries: int = 1) -> PhotonGeocoder:
    return PhotonGeocoder(
        "https://photon.test", _client(transport), timeout_s=2, max_retries=retries
    )


def _overpass(transport: httpx.MockTransport, retries: int = 1) -> OverpassClient:
    return OverpassClient(
        "https://overpass.test/api/interpreter",
        _client(transport),
        timeout_s=2,
        max_retries=retries,
    )


# ------------------------------------------------------------------ geocoding
async def test_geocode_success_returns_coordinates() -> None:
    res = await _geocoder(make_transport()).geocode("Koramangala")
    assert res.location == ORIGIN and res.label.startswith("Koramangala")
    assert res.osm_id == "node/1"


async def test_geocode_no_results_is_not_found() -> None:
    with pytest.raises(LocationNotFoundError):
        await _geocoder(make_transport(photon=photon_payload())).geocode("Nowhereville")


async def test_geocode_skips_malformed_features() -> None:
    bad = photon_payload({"type": "Feature", "geometry": None, "properties": {}})
    with pytest.raises(LocationNotFoundError):
        await _geocoder(make_transport(photon=bad)).geocode("x")


async def test_geocode_ambiguous_same_name_far_apart() -> None:
    payload = photon_payload(
        photon_feature("Springfield", 39.8, -89.6, country="USA", state="Illinois"),
        photon_feature("Springfield", 37.2, -93.3, country="USA", state="Missouri"),
    )
    with pytest.raises(AmbiguousLocationError) as err:
        await _geocoder(make_transport(photon=payload)).geocode("Springfield")
    assert len(err.value.options) == 2


async def test_geocode_qualified_query_is_not_ambiguous() -> None:
    payload = photon_payload(
        photon_feature("Springfield", 39.8, -89.6),
        photon_feature("Springfield", 37.2, -93.3),
    )
    res = await _geocoder(make_transport(photon=payload)).geocode("Springfield, Illinois")
    assert res.location.lat == 39.8


async def test_geocode_sends_city_hint_and_user_agent() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(200, json=KORAMANGALA)

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler), headers={"User-Agent": "ExploreAI/test"}
    )
    geo = PhotonGeocoder("https://photon.test", client, timeout_s=2, max_retries=0)
    await geo.geocode("Koramangala", hint="Bengaluru")
    assert seen[0].url.params["q"] == "Koramangala, Bengaluru"
    assert seen[0].headers["user-agent"] == "ExploreAI/test"


@pytest.mark.parametrize("payload", [{"nope": 1}, [], "text"])
async def test_geocode_malformed_payload_is_upstream_error(payload: object) -> None:
    with pytest.raises(UpstreamError):
        await _geocoder(make_transport(photon=payload)).geocode("x")


async def test_geocode_retries_transient_then_gives_up_sanitised() -> None:
    calls: list[str] = []
    t = make_transport(photon=httpx.Response(503, text="secret internal detail"), calls=calls)
    with pytest.raises(UpstreamError) as err:
        await _geocoder(t, retries=2).geocode("x")
    assert len(calls) == 3
    assert "secret" not in str(err.value) and "photon.test" not in str(err.value)


async def test_geocode_timeout_is_upstream_error() -> None:
    def boom(_: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    geo = PhotonGeocoder(
        "https://photon.test",
        _client(httpx.MockTransport(boom)),
        timeout_s=1,
        max_retries=0,
    )
    with pytest.raises(UpstreamError, match="timeout"):
        await geo.geocode("x")


# ------------------------------------------------------------------ places
def test_normalize_keeps_osm_identity_and_category() -> None:
    p = normalize_element(el("way", 5, "Big Park", 1.0, 2.0, {"leisure": "park"}), ["park"])
    assert p is not None
    assert (p.osm_id, p.category, p.source) == ("way/5", "park", "OpenStreetMap")
    assert p.osm_url == "https://www.openstreetmap.org/way/5"
    assert "OpenStreetMap" in p.attribution


@pytest.mark.parametrize(
    "element",
    [
        el("node", 1, None, 1.0, 2.0, {"leisure": "park"}),  # unnamed: never invent a name
        el("node", 2, "X", 1.0, 2.0, {"shop": "bakery"}),  # not a requested category
        el("node", 3, "X", 95.0, 2.0, {"leisure": "park"}),  # invalid latitude
        {"type": "way", "id": 4, "tags": {"name": "X", "leisure": "park"}},  # no center
        {"type": "node", "id": "5", "lat": 1, "lon": 2, "tags": {"name": "X"}},
        "garbage",
    ],
)
def test_normalize_rejects_unusable_elements(element: object) -> None:
    assert normalize_element(element, ["park"]) is None


def _place(osm_id: str, name: str, lat: float, lon: float, **tags: str) -> Place:
    return Place(
        osm_id=osm_id, name=name, location=GeoPoint(lat=lat, lon=lon), category="park", tags=tags
    )


def test_dedupe_same_id_and_nearby_same_name_but_not_distinct_venues() -> None:
    a = _place("node/1", "City Park", 12.0, 77.0)
    same_id = _place("node/1", "City Park", 12.0, 77.0, opening_hours="Mo-Su 09:00-17:00")
    twin = _place("way/2", "city park", 12.0003, 77.0, website="x")  # ~33 m away
    far_namesake = _place("node/3", "City Park", 12.1, 77.0)
    other = _place("node/4", "River Park", 12.0, 77.0)
    out = dedupe_places([a, same_id, twin, far_namesake, other])
    assert [p.osm_id for p in out] == ["node/1", "node/3", "node/4"]
    assert out[0].tags == {"opening_hours": "Mo-Su 09:00-17:00"}  # richer duplicate wins


def test_query_contains_only_table_values_and_radius() -> None:
    q = build_query(ORIGIN, 2500, ["museum", "cafe"], 300)
    assert '["tourism"="museum"]' in q and '["amenity"="cafe"]' in q
    assert "around" not in q and q.rstrip().endswith("qt 300;")
    # bbox ~2.5 km each way around the centre, (south,west,north,east)
    assert "(12.912" in q and ",77.60" in q


async def test_overpass_search_normalises_and_dedupes() -> None:
    elements = [
        el("node", 1, "Twin Park", 12.9360, 77.6250, {"leisure": "park"}),
        el("way", 2, "Twin Park", 12.9361, 77.6250, {"leisure": "park", "fee": "no"}),
        el("node", 3, None, 12.9360, 77.6250, {"leisure": "park"}),
    ]
    out = await _overpass(make_transport(elements=elements)).search(ORIGIN, 1000, ["park"])
    assert [p.osm_id for p in out] == ["way/2"]


async def test_overpass_empty_result_is_empty_list_not_error() -> None:
    assert await _overpass(make_transport(elements=[])).search(ORIGIN, 1000, ["park"]) == []


async def test_overpass_rate_limit_retries_then_fails_cleanly() -> None:
    calls: list[str] = []
    t = make_transport(overpass_status=429, calls=calls)
    with pytest.raises(UpstreamError):
        await _overpass(t, retries=2).search(ORIGIN, 1000, ["park"])
    assert len(calls) == 3


async def test_overpass_retry_recovers() -> None:
    state = {"n": 0}

    def handler(_: httpx.Request) -> httpx.Response:
        state["n"] += 1
        if state["n"] == 1:
            return httpx.Response(504)
        return httpx.Response(
            200, json={"elements": [el("node", 1, "P", 12.936, 77.625, {"leisure": "park"})]}
        )

    out = await _overpass(httpx.MockTransport(handler)).search(ORIGIN, 1000, ["park"])
    assert len(out) == 1 and state["n"] == 2


@pytest.mark.parametrize(
    "body",
    [b"<html>too busy</html>", b'{"unexpected": true}', b'{"elements": "no"}'],
)
async def test_overpass_malformed_body_is_upstream_error(body: bytes) -> None:
    with pytest.raises(UpstreamError):
        await _overpass(make_transport(overpass_body=body)).search(ORIGIN, 1000, ["park"])


async def test_overpass_runtime_error_remark_is_failure_not_empty() -> None:
    body = json.dumps({"elements": [], "remark": "runtime error: Query timed out"}).encode()
    with pytest.raises(UpstreamError):
        await _overpass(make_transport(overpass_body=body)).search(ORIGIN, 1000, ["park"])


# ------------------------------------------------------------------ routing
A, B = GeoPoint(lat=12.0, lon=77.0), GeoPoint(lat=12.005, lon=77.0)


def _router(handler: object, mode: str = "walk") -> OsrmRouter:
    return OsrmRouter(
        {mode: Endpoint("https://osrm.test", "foot")},  # type: ignore[dict-item]
        _client(httpx.MockTransport(handler)),  # type: ignore[arg-type]
        timeout_s=2,
        max_retries=0,
    )


async def test_matrix_without_router_is_labelled_estimate() -> None:
    m = await TravelService(None).matrix([A, B], "walk")
    assert m.source == "estimate" and m.hops[0][1] is not None and m.hops[0][0] == Hop(0, 0)


async def test_matrix_for_unsupported_mode_is_estimate_even_with_router() -> None:
    r = _router(lambda _: osrm_table_response(2))
    assert (await TravelService(r).matrix([A, B], "bike")).source == "estimate"


async def test_matrix_from_router_is_labelled_route() -> None:
    r = _router(lambda _: osrm_table_response(2, seconds=600, metres=700))
    m = await TravelService(r).matrix([A, B], "walk")
    assert m.source == "route" and m.hops[0][1] == Hop(700, 600)


async def test_router_failure_falls_back_to_estimate_not_fake_route() -> None:
    r = _router(lambda _: httpx.Response(500))
    m = await TravelService(r).matrix([A, B], "walk")
    assert m.source == "estimate"


async def test_router_malformed_table_falls_back() -> None:
    r = _router(lambda _: httpx.Response(200, json={"code": "Ok", "durations": [[0]]}))
    assert (await TravelService(r).matrix([A, B], "walk")).source == "estimate"


async def test_unreachable_pair_stays_unreachable() -> None:
    body = {"code": "Ok", "durations": [[0, None], [5, 0]], "distances": [[0, None], [5, 0]]}
    r = _router(lambda _: httpx.Response(200, json=body))
    m = await TravelService(r).matrix([A, B], "walk")
    assert m.source == "route" and m.hops[0][1] is None and m.hops[1][0] == Hop(5, 5)


async def test_leg_geometry_from_route_and_graceful_when_route_call_fails() -> None:
    def ok(req: httpx.Request) -> httpx.Response:
        if "/table/" in req.url.path:
            return osrm_table_response(2, seconds=600, metres=700)
        coords = [[77.0, 12.0], [77.0, 12.005]]
        route = {"distance": 700, "duration": 600, "geometry": {"coordinates": coords}}
        return httpx.Response(200, json={"code": "Ok", "routes": [route]})

    svc = TravelService(_router(ok))
    m = await svc.matrix([A, B], "walk")
    leg = await svc.leg("a", "b", A, B, "walk", m, 0, 1)
    assert leg.source == "route" and leg.geometry == [(77.0, 12.0), (77.0, 12.005)]
    assert (leg.distance_m, leg.duration_min) == (700, 10)

    def table_only(req: httpx.Request) -> httpx.Response:
        if "/table/" in req.url.path:
            return osrm_table_response(2)
        return httpx.Response(500)

    svc2 = TravelService(_router(table_only))
    m2 = await svc2.matrix([A, B], "walk")
    leg2 = await svc2.leg("a", "b", A, B, "walk", m2, 0, 1)
    assert leg2.source == "route" and leg2.geometry == []


def test_estimates_scale_with_mode_and_never_zero_for_real_moves() -> None:
    walk, drive = estimate_hop(A, B, "walk"), estimate_hop(A, B, "drive")
    assert walk.duration_s > 0 and minutes(walk) >= 1
    assert estimate_hop(A, A, "walk") == Hop(0, 0) and minutes(Hop(0, 0)) == 0
    assert walk.distance_m == drive.distance_m and drive.duration_s < walk.duration_s


async def test_overpass_drops_elements_outside_the_radius_corner_of_the_bbox() -> None:
    near = el("node", 1, "Near Park", ORIGIN.lat + 0.001, ORIGIN.lon, {"leisure": "park"})
    corner = el(
        "node", 2, "Corner Park", ORIGIN.lat + 0.0225, ORIGIN.lon + 0.0225, {"leisure": "park"}
    )
    out = await _overpass(make_transport(elements=[near, corner])).search(ORIGIN, 2500, ["park"])
    assert [p.name for p in out] == ["Near Park"]
