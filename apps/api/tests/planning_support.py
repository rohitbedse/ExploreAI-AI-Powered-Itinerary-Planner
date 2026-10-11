"""Shared fixtures for the planning tests. Synthetic provider payloads; no network, ever.

The payloads imitate the documented shapes of Photon (GeoJSON), Overpass (``elements``) and OSRM
(``table`` / ``route``). They are hand-written, NOT recordings of live responses.
"""

import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import httpx

from app.schemas.plans import GeoPoint

ORIGIN = GeoPoint(lat=12.9352, lon=77.6245)
# Friday 2026-10-09 10:00 in IST (+05:30).
NOW = datetime(2026, 10, 9, 4, 30, tzinfo=UTC)


def photon_feature(
    name: str, lat: float, lon: float, *, country: str = "India", state: str = "Karnataka"
) -> dict[str, Any]:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "name": name,
            "city": "Bengaluru",
            "state": state,
            "country": country,
            "osm_type": "N",
            "osm_id": 1,
        },
    }


def photon_payload(*features: dict[str, Any]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": list(features)}


KORAMANGALA = photon_payload(photon_feature("Koramangala", ORIGIN.lat, ORIGIN.lon))


def el(
    kind: str,
    ident: int,
    name: str | None,
    lat: float,
    lon: float,
    tags: dict[str, str],
) -> dict[str, Any]:
    all_tags = dict(tags)
    if name:
        all_tags["name"] = name
    out: dict[str, Any] = {"type": kind, "id": ident, "tags": all_tags}
    if kind == "node":
        out.update(lat=lat, lon=lon)
    else:
        out["center"] = {"lat": lat, "lon": lon}
    return out


def overpass_elements() -> list[dict[str, Any]]:
    """Two parks, a museum (free), a gallery (priced), two cafes, one unnamed element."""
    return [
        el("node", 101, "Fixture Park", 12.9360, 77.6250, {"leisure": "park"}),
        el("way", 102, "Fixture Garden", 12.9370, 77.6260, {"leisure": "garden", "fee": "no"}),
        el(
            "node",
            103,
            "Fixture Museum",
            12.9380,
            77.6270,
            {"tourism": "museum", "fee": "no", "opening_hours": "Mo-Su 09:00-18:00"},
        ),
        el(
            "node",
            104,
            "Fixture Gallery",
            12.9340,
            77.6230,
            {"tourism": "gallery", "charge": "150 INR", "opening_hours": "Mo-Su 09:00-18:00"},
        ),
        el("node", 105, "Fixture Cafe", 12.9355, 77.6240, {"amenity": "cafe"}),
        el("node", 106, "Second Fixture Cafe", 12.9345, 77.6255, {"amenity": "cafe"}),
        el("node", 107, None, 12.9350, 77.6246, {"amenity": "cafe"}),
    ]


def make_transport(
    *,
    photon: Any = KORAMANGALA,
    elements: list[dict[str, Any]] | None = None,
    overpass_status: int = 200,
    overpass_body: Any = None,
    osrm: Callable[[httpx.Request], httpx.Response] | None = None,
    calls: list[str] | None = None,
) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if calls is not None:
            calls.append(host)
        if "photon" in host:
            if isinstance(photon, httpx.Response):
                return photon
            return httpx.Response(200, json=photon)
        if "overpass" in host:
            if overpass_status != 200:
                return httpx.Response(overpass_status, text="busy")
            if overpass_body is not None:
                return httpx.Response(200, content=overpass_body)
            return httpx.Response(
                200, json={"elements": overpass_elements() if elements is None else elements}
            )
        if "osrm" in host and osrm is not None:
            return osrm(request)
        return httpx.Response(500, text="unexpected host in test")

    return httpx.MockTransport(handler)


def osrm_table_response(n: int, *, seconds: int = 300, metres: int = 400) -> httpx.Response:
    row = [[0 if i == j else seconds for j in range(n)] for i in range(n)]
    dist = [[0 if i == j else metres for j in range(n)] for i in range(n)]
    return httpx.Response(
        200, content=json.dumps({"code": "Ok", "durations": row, "distances": dist})
    )
