"""Resolve a user-typed place name to coordinates with Photon (decision D5).

Rules: never guess. No match -> LocationNotFoundError. Several distant places with the same name
and no qualifier from the user -> AmbiguousLocationError (the caller asks the user to be more
specific). Nothing here ever falls back to a "current location".
"""

import logging
import re
from typing import Any, Protocol

import httpx
from pydantic import BaseModel, ValidationError

from app.schemas.plans import GeoPoint
from app.services.planning.geo import haversine_m
from app.services.planning.http import UpstreamError, fetch_json

logger = logging.getLogger(__name__)

AMBIGUITY_RADIUS_M = 50_000
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class GeocodeResult(BaseModel):
    label: str
    location: GeoPoint
    osm_id: str | None = None


class LocationNotFoundError(Exception):
    def __init__(self, query: str) -> None:
        super().__init__("location not found")
        self.query = query


class AmbiguousLocationError(Exception):
    def __init__(self, query: str, options: list[str]) -> None:
        super().__init__("ambiguous location")
        self.query = query
        self.options = options


class Geocoder(Protocol):
    async def geocode(self, text: str, *, hint: str | None = None) -> GeocodeResult:
        """Resolve ``text`` (optionally narrowed by a ``hint`` such as a city).

        Raises LocationNotFoundError, AmbiguousLocationError or UpstreamError.
        """
        ...


def _clean(v: object) -> str:
    return _CONTROL.sub(" ", v).strip()[:120] if isinstance(v, str) else ""


def _label(props: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in ("name", "city", "state", "country"):
        val = _clean(props.get(key))
        if val and val not in parts:
            parts.append(val)
    return ", ".join(parts)


def _parse_feature(feat: Any) -> tuple[GeocodeResult, str] | None:
    """Return (result, bare name) or None for a malformed feature."""
    try:
        props = feat["properties"]
        lon, lat = feat["geometry"]["coordinates"][:2]
        point = GeoPoint(lat=lat, lon=lon)
    except (KeyError, TypeError, ValueError, ValidationError):
        return None
    name = _clean(props.get("name")) if isinstance(props, dict) else ""
    if not name:
        return None
    osm_id: str | None = None
    kind = {"N": "node", "W": "way", "R": "relation"}.get(str(props.get("osm_type")))
    if kind and isinstance(props.get("osm_id"), int):
        osm_id = f"{kind}/{props['osm_id']}"
    return GeocodeResult(label=_label(props), location=point, osm_id=osm_id), name


class PhotonGeocoder:
    def __init__(
        self,
        base_url: str,
        client: httpx.AsyncClient,
        *,
        timeout_s: float,
        max_retries: int,
        limit: int = 5,
    ) -> None:
        self._url = base_url.rstrip("/") + "/api"
        self._client = client
        self._timeout = timeout_s
        self._retries = max_retries
        self._limit = limit

    async def geocode(self, text: str, *, hint: str | None = None) -> GeocodeResult:
        text = text.strip()
        hint = (hint or "").strip()
        query = f"{text}, {hint}" if hint and hint.lower() not in text.lower() else text
        payload = await fetch_json(
            self._client,
            "GET",
            self._url,
            provider="photon",
            timeout_s=self._timeout,
            max_retries=self._retries,
            params={"q": query, "limit": str(self._limit)},
        )
        features = payload.get("features") if isinstance(payload, dict) else None
        if not isinstance(features, list):
            raise UpstreamError("photon", "malformed response")
        parsed = [p for f in features if (p := _parse_feature(f))]
        if not parsed:
            raise LocationNotFoundError(text)
        top, top_name = parsed[0]
        qualified = "," in query  # user already narrowed it down ("Paris, France" / city hint)
        if not qualified:
            far = [
                r.label
                for r, name in parsed[1:]
                if name.casefold() == top_name.casefold()
                and haversine_m(top.location, r.location) > AMBIGUITY_RADIUS_M
            ]
            if far:
                raise AmbiguousLocationError(text, [top.label, *far][:4])
        return top
