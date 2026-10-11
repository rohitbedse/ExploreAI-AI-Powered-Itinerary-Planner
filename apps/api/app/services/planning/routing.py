"""Travel time and distance between stops.

Two sources, always labelled on the result:
- ``route``: a real routing-engine answer (OSRM table/route API).
- ``estimate``: straight-line distance x detour factor / assumed speed. Used only when no router
  is configured for the transport mode or the router fails. Estimates are never presented as
  routes; they carry no geometry.

A routed pair the engine reports as unreachable stays unreachable (None); it is not estimated.
"""

import logging
import math
from dataclasses import dataclass
from typing import Any, Literal, Protocol

import httpx

from app.schemas.plans import GeoPoint, TravelLeg, TravelMode
from app.services.planning.geo import haversine_m
from app.services.planning.http import UpstreamError, fetch_json

logger = logging.getLogger(__name__)

Source = Literal["route", "estimate"]

# Estimation assumptions (km/h, detour multiplier over straight line, fixed overhead minutes).
_SPEED_KMH: dict[TravelMode, float] = {"walk": 4.8, "bike": 14.0, "transit": 20.0, "drive": 25.0}
_DETOUR = 1.3
_OVERHEAD_MIN: dict[TravelMode, float] = {"walk": 0, "bike": 1, "transit": 10, "drive": 3}


@dataclass(frozen=True)
class Hop:
    distance_m: int
    duration_s: int


@dataclass(frozen=True)
class TravelMatrix:
    """hops[i][j] = travel from points[i] to points[j]; None = unreachable."""

    hops: list[list[Hop | None]]
    source: Source


@dataclass(frozen=True)
class Endpoint:
    base_url: str
    profile: str


def estimate_hop(a: GeoPoint, b: GeoPoint, mode: TravelMode) -> Hop:
    dist = haversine_m(a, b) * _DETOUR
    secs = dist / (_SPEED_KMH[mode] / 3.6) + _OVERHEAD_MIN[mode] * 60 * (1 if dist > 0 else 0)
    return Hop(distance_m=round(dist), duration_s=round(secs))


def minutes(hop: Hop) -> int:
    """Whole minutes, rounded up; a real move is never 0 min."""
    return max(1, math.ceil(hop.duration_s / 60)) if hop.distance_m > 0 else 0


class Router(Protocol):
    def supports(self, mode: TravelMode) -> bool: ...

    async def table(self, points: list[GeoPoint], mode: TravelMode) -> list[list[Hop | None]]:
        """Full matrix from the routing engine; raises UpstreamError."""
        ...

    async def route(
        self, a: GeoPoint, b: GeoPoint, mode: TravelMode
    ) -> tuple[Hop, list[tuple[float, float]]]:
        """One route with [lon, lat] geometry; raises UpstreamError."""
        ...


def _coords(points: list[GeoPoint]) -> str:
    return ";".join(f"{p.lon:.6f},{p.lat:.6f}" for p in points)


def _num(v: Any) -> float | None:
    return float(v) if isinstance(v, int | float) and not isinstance(v, bool) and v >= 0 else None


class OsrmRouter:
    def __init__(
        self,
        endpoints: dict[TravelMode, Endpoint],
        client: httpx.AsyncClient,
        *,
        timeout_s: float,
        max_retries: int,
    ) -> None:
        self._endpoints = endpoints
        self._client = client
        self._timeout = timeout_s
        self._retries = max_retries

    def supports(self, mode: TravelMode) -> bool:
        return mode in self._endpoints

    def _url(self, service: str, mode: TravelMode, coords: str) -> str:
        ep = self._endpoints[mode]
        return f"{ep.base_url.rstrip('/')}/{service}/v1/{ep.profile}/{coords}"

    async def table(self, points: list[GeoPoint], mode: TravelMode) -> list[list[Hop | None]]:
        data = await fetch_json(
            self._client,
            "GET",
            self._url("table", mode, _coords(points)),
            provider="osrm",
            timeout_s=self._timeout,
            max_retries=self._retries,
            params={"annotations": "duration,distance"},
        )
        n = len(points)
        try:
            if data["code"] != "Ok":
                raise UpstreamError("osrm", "no table")
            dur, dist = data["durations"], data["distances"]
            if len(dur) != n or len(dist) != n:
                raise ValueError
            matrix: list[list[Hop | None]] = []
            for i in range(n):
                if len(dur[i]) != n or len(dist[i]) != n:
                    raise ValueError
                row: list[Hop | None] = []
                for j in range(n):
                    d, m = _num(dur[i][j]), _num(dist[i][j])
                    row.append(None if d is None or m is None else Hop(round(m), round(d)))
                matrix.append(row)
            return matrix
        except (KeyError, TypeError, ValueError):
            raise UpstreamError("osrm", "malformed response") from None

    async def route(
        self, a: GeoPoint, b: GeoPoint, mode: TravelMode
    ) -> tuple[Hop, list[tuple[float, float]]]:
        data = await fetch_json(
            self._client,
            "GET",
            self._url("route", mode, _coords([a, b])),
            provider="osrm",
            timeout_s=self._timeout,
            max_retries=self._retries,
            params={"overview": "full", "geometries": "geojson"},
        )
        try:
            if data["code"] != "Ok":
                raise UpstreamError("osrm", "no route")
            r = data["routes"][0]
            dist, dur = _num(r["distance"]), _num(r["duration"])
            if dist is None or dur is None:
                raise ValueError
            geom = [(float(x), float(y)) for x, y in r["geometry"]["coordinates"]]
            if len(geom) < 2:
                raise ValueError
            return Hop(round(dist), round(dur)), geom
        except (KeyError, IndexError, TypeError, ValueError):
            raise UpstreamError("osrm", "malformed response") from None


class TravelService:
    """Matrix + leg construction with explicit route/estimate labelling."""

    def __init__(self, router: Router | None) -> None:
        self._router = router

    async def matrix(self, points: list[GeoPoint], mode: TravelMode) -> TravelMatrix:
        if self._router is not None and self._router.supports(mode):
            try:
                return TravelMatrix(await self._router.table(points, mode), "route")
            except UpstreamError:
                logger.warning("routing table failed; using labelled estimates")
        hops: list[list[Hop | None]] = [
            [Hop(0, 0) if i == j else estimate_hop(a, b, mode) for j, b in enumerate(points)]
            for i, a in enumerate(points)
        ]
        return TravelMatrix(hops, "estimate")

    async def leg(
        self,
        from_id: str,
        to_id: str,
        a: GeoPoint,
        b: GeoPoint,
        mode: TravelMode,
        matrix: TravelMatrix,
        ia: int,
        ib: int,
    ) -> TravelLeg:
        """Leg for one chosen hop. With a router, tries for real geometry; if that fails the
        leg keeps its matrix numbers (still source=route) and has no geometry."""
        hop = matrix.hops[ia][ib]
        assert hop is not None  # the scheduler never picks an unreachable pair
        geometry: list[tuple[float, float]] = []
        if matrix.source == "route" and self._router is not None:
            try:
                # Timing stays the matrix value the schedule was built on; only geometry is new.
                _, geometry = await self._router.route(a, b, mode)
            except UpstreamError:
                logger.warning("route geometry unavailable; leg has no geometry")
        return TravelLeg(
            from_stop_id=from_id,
            to_stop_id=to_id,
            mode=mode,
            distance_m=hop.distance_m,
            duration_min=minutes(hop),
            source=matrix.source,
            geometry=geometry,
        )
