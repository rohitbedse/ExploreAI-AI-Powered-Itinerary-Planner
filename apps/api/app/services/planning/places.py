"""Place retrieval from OpenStreetMap via Overpass: query, validate, normalise, deduplicate.

Everything returned is a real OSM element with its OSM id; unnamed elements are dropped (a name is
never invented) and there is no fallback data. A failing provider raises UpstreamError.
"""

import asyncio
import logging
import math
import re
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError

from app.schemas.plans import GeoPoint
from app.services.planning.geo import haversine_m
from app.services.planning.http import UpstreamError, fetch_json

logger = logging.getLogger(__name__)

ATTRIBUTION = "© OpenStreetMap contributors (ODbL)"
DEDUPE_RADIUS_M = 75
# Overpass usage policy: keep concurrency low.
_MAX_CONCURRENT = 2


@dataclass(frozen=True)
class Category:
    slug: str
    selectors: tuple[tuple[str, str], ...]  # OSM (key, value) pairs; any match qualifies
    visit_min: int  # assumed visit length: an assumption, labelled as such to the user
    keywords: frozenset[str]  # interest words that select this category
    food: bool = False


def _c(slug: str, sel: str, visit: int, kws: str, *, food: bool = False) -> Category:
    pairs = tuple((k, v) for k, _, v in (p.partition("=") for p in sel.split()))
    return Category(slug, pairs, visit, frozenset(kws.split()), food)


CATEGORIES: dict[str, Category] = {
    c.slug: c
    for c in (
        _c("museum", "tourism=museum", 75, "museum museums history culture heritage exhibit"),
        _c("gallery", "tourism=gallery", 45, "art gallery galleries culture exhibition"),
        _c("attraction", "tourism=attraction", 45, "sightseeing landmark attraction tourist"),
        _c("viewpoint", "tourism=viewpoint", 25, "view viewpoint scenic sunset skyline"),
        _c(
            "historic",
            "historic=monument historic=castle historic=fort historic=memorial "
            "historic=archaeological_site historic=ruins",
            40,
            "history historic heritage fort monument ruins architecture",
        ),
        _c(
            "worship",
            "amenity=place_of_worship",
            30,
            "temple church mosque spiritual religion religious architecture",
        ),
        _c(
            "park",
            "leisure=park leisure=garden",
            45,
            "park garden nature green outdoors relaxing walk calm quiet",
        ),
        _c("nature", "natural=beach leisure=nature_reserve", 60, "nature beach hiking outdoors"),
        _c("cafe", "amenity=cafe", 45, "cafe coffee tea brunch chill relaxing", food=True),
        _c(
            "restaurant",
            "amenity=restaurant",
            60,
            "food restaurant dining dinner lunch eat",
            food=True,
        ),
        _c(
            "street_food",
            "amenity=fast_food amenity=food_court",
            30,
            "street snacks snack food fast",
            food=True,
        ),
        _c("dessert", "amenity=ice_cream", 20, "dessert icecream sweets", food=True),
        _c(
            "nightlife",
            "amenity=bar amenity=pub amenity=biergarten",
            60,
            "nightlife bar bars pub drinks",
        ),
        _c("market", "amenity=marketplace", 40, "market markets shopping local bazaar"),
        _c("shopping", "shop=mall", 60, "shopping mall shop"),
        _c("books", "shop=books amenity=library", 40, "books bookstore library reading quiet"),
        _c(
            "entertainment",
            "amenity=theatre amenity=cinema",
            120,
            "movie movies cinema theatre show",
        ),
        _c(
            "family",
            "tourism=zoo tourism=aquarium tourism=theme_park",
            120,
            "zoo aquarium kids family",
        ),
    )
}
DEFAULT_CATEGORIES = ("attraction", "museum", "viewpoint", "park", "historic", "gallery", "cafe")

# OSM tags worth keeping on a Place (everything else is dropped).
KEPT_TAGS = (
    "opening_hours",
    "fee",
    "charge",
    "wheelchair",
    "diet:vegetarian",
    "diet:vegan",
    "cuisine",
    "website",
)
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class Place(BaseModel):
    model_config = ConfigDict(frozen=True)

    osm_id: str  # "node/123", "way/45", "relation/6"
    name: str
    location: GeoPoint
    category: str  # a CATEGORIES slug
    tags: dict[str, str]
    source: str = "OpenStreetMap"
    attribution: str = ATTRIBUTION

    @property
    def osm_url(self) -> str:
        return f"https://www.openstreetmap.org/{self.osm_id}"


class PlaceSource(Protocol):
    async def search(self, center: GeoPoint, radius_m: int, categories: list[str]) -> list[Place]:
        """Real places within ``radius_m`` of ``center``. [] = nothing found (not an error)."""
        ...


def _bbox(center: GeoPoint, radius_m: int) -> str:
    """(south,west,north,east). A bounding box is far cheaper for Overpass than ``around``; the
    exact radius is enforced afterwards in Python."""
    dlat = radius_m / 111_320
    dlon = radius_m / (111_320 * max(0.05, math.cos(math.radians(center.lat))))
    s, n = max(-90.0, center.lat - dlat), min(90.0, center.lat + dlat)
    w, e = max(-180.0, center.lon - dlon), min(180.0, center.lon + dlon)
    return f"({s:.6f},{w:.6f},{n:.6f},{e:.6f})"


def build_query(center: GeoPoint, radius_m: int, categories: list[str], limit: int) -> str:
    """Overpass QL. Only values from the CATEGORIES table and floats are interpolated."""
    box = _bbox(center, radius_m)
    clauses: list[str] = []
    for slug in categories:
        for key, value in CATEGORIES[slug].selectors:
            clauses.append(f'nwr["{key}"="{value}"]["name"]{box};')
    body = "\n  ".join(clauses)
    return f"[out:json][timeout:25];\n(\n  {body}\n);\nout center tags qt {int(limit)};"


def _category_of(tags: dict[str, str], categories: list[str]) -> str | None:
    for slug in categories:
        if any(tags.get(k) == v for k, v in CATEGORIES[slug].selectors):
            return slug
    return None


def _clean_name(raw: str) -> str:
    return re.sub(r"\s+", " ", _CONTROL.sub(" ", raw)).strip()[:120]


def normalize_element(el: Any, categories: list[str]) -> Place | None:
    """Validate one Overpass element. None = unusable (never repaired or guessed)."""
    if not isinstance(el, dict):
        return None
    kind, ident, tags = el.get("type"), el.get("id"), el.get("tags")
    if kind not in ("node", "way", "relation") or not isinstance(ident, int):
        return None
    if not isinstance(tags, dict):
        return None
    tags = {str(k): str(v) for k, v in tags.items()}
    raw_name = tags.get("name") or tags.get("name:en") or ""
    name = _clean_name(raw_name)
    category = _category_of(tags, categories)
    if not name or category is None:
        return None
    pos: Any = el if kind == "node" else el.get("center")
    try:
        point = GeoPoint(lat=pos["lat"], lon=pos["lon"])
    except (KeyError, TypeError, ValidationError):
        return None
    kept = {k: _CONTROL.sub(" ", tags[k])[:200] for k in KEPT_TAGS if k in tags}
    return Place(osm_id=f"{kind}/{ident}", name=name, location=point, category=category, tags=kept)


def dedupe_places(places: list[Place]) -> list[Place]:
    """Drop repeats of the same venue: identical OSM id, or same name (case-insensitive) within
    ``DEDUPE_RADIUS_M``. The entry with more kept tags wins; ties keep the first. Order stable."""
    out: list[Place] = []
    for p in places:
        dup = next(
            (
                i
                for i, q in enumerate(out)
                if q.osm_id == p.osm_id
                or (
                    q.name.casefold() == p.name.casefold()
                    and haversine_m(q.location, p.location) <= DEDUPE_RADIUS_M
                )
            ),
            None,
        )
        if dup is None:
            out.append(p)
        elif len(p.tags) > len(out[dup].tags):
            out[dup] = p
    return out


class OverpassClient:
    def __init__(
        self,
        url: str,
        client: httpx.AsyncClient,
        *,
        timeout_s: float,
        max_retries: int,
        max_elements: int = 300,
    ) -> None:
        self._url = url
        self._client = client
        self._timeout = timeout_s
        self._retries = max_retries
        self._max = max_elements
        self._gate = asyncio.Semaphore(_MAX_CONCURRENT)

    async def search(self, center: GeoPoint, radius_m: int, categories: list[str]) -> list[Place]:
        if not categories:
            return []
        query = build_query(center, radius_m, categories, self._max)
        async with self._gate:
            payload = await fetch_json(
                self._client,
                "POST",
                self._url,
                provider="overpass",
                # Overpass' own timeout is 25 s; allow the HTTP layer a little longer.
                timeout_s=max(self._timeout, 30.0),
                max_retries=self._retries,
                data={"data": query},
            )
        if not isinstance(payload, dict) or not isinstance(payload.get("elements"), list):
            raise UpstreamError("overpass", "malformed response")
        remark = payload.get("remark")
        if isinstance(remark, str) and not payload["elements"] and "error" in remark.lower():
            # Overpass reports query timeouts / out-of-memory as 200 + a remark and no elements.
            raise UpstreamError("overpass", "query failed", retryable=True)
        places = [
            p
            for el in payload["elements"]
            if (p := normalize_element(el, categories))
            and haversine_m(center, p.location) <= radius_m
        ]
        dropped = len(payload["elements"]) - len(places)
        unique = dedupe_places(places)
        logger.info(
            "overpass search",
            extra={"elements": len(payload["elements"]), "dropped": dropped, "unique": len(unique)},
        )
        return unique
