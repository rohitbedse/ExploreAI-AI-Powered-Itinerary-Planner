"""DeterministicPlanBuilder: Intent -> geocode -> OSM places -> travel -> schedule -> Plan.

Python decides everything factual here. The LLM contributed only the Intent. Every stop is a real
OSM element; prices and opening hours are shown only when OSM states them (D8).
"""

import logging
import math
import re
import uuid
from collections import defaultdict
from collections.abc import AsyncIterator, Callable
from datetime import UTC, datetime, timedelta, timezone
from itertools import pairwise

from app.schemas.intent import Intent
from app.schemas.plans import (
    BudgetStatus,
    CostStatus,
    GeoPoint,
    Plan,
    PlanRequest,
    PlanStop,
    PlanSummary,
    StatusEvent,
    StepKey,
    TravelLeg,
    TravelMode,
)
from app.services.pipeline import PlanningError
from app.services.planning.facts import entry_price
from app.services.planning.geo import haversine_m
from app.services.planning.geocoding import (
    AmbiguousLocationError,
    Geocoder,
    LocationNotFoundError,
)
from app.services.planning.http import UpstreamError
from app.services.planning.places import CATEGORIES, DEFAULT_CATEGORIES, Place, PlaceSource
from app.services.planning.routing import TravelMatrix, TravelService, minutes
from app.services.planning.scheduler import Candidate, Schedule, Visit, schedule

logger = logging.getLogger(__name__)

DEFAULT_MODE: TravelMode = "walk"
DEFAULT_CURRENCY = "INR"
SEARCH_RADIUS_M: dict[TravelMode, int] = {
    "walk": 2500,
    "bike": 6000,
    "transit": 8000,
    "drive": 12000,
}
CANDIDATE_LIMIT = 12  # matrix size is this + 1 (origin); keeps routing calls small and polite
MAX_CATEGORIES = 8
_WEIGHT = {"explicit": 1.0, "inferred": 0.6}
Clock = Callable[[], datetime]

PROVIDER_DOWN = "Place data is temporarily unavailable. Please try again in a moment."


_ROOT_LEN = 5


def _stem(word: str) -> set[str]:
    """Exact form, plural-stripped form and, for longer words, a 5-letter root, so LLM labels
    like "relaxation" or "museums" still meet the keyword "relaxing" / "museum"."""
    out = {word, word.rstrip("s")} if len(word) > 3 else {word}
    if len(word) >= _ROOT_LEN:
        out.add(word[:_ROOT_LEN] + "*")
    return out


_KEYWORD_STEMS: dict[str, set[str]] = {
    slug: {s for kw in c.keywords for s in _stem(kw)} for slug, c in CATEGORIES.items()
}


def match_categories(intent: Intent) -> tuple[dict[str, float], list[str], bool]:
    """(category -> weight, unmatched interest labels, used_default_set).

    If no interest maps to a category, the default sightseeing mix is used (and reported)."""
    if not intent.interests:
        return {slug: 1.0 for slug in DEFAULT_CATEGORIES}, [], True
    weights: dict[str, float] = defaultdict(float)
    unmatched: list[str] = []
    for interest in intent.interests:
        words = re.findall(r"[a-z]+", interest.label.lower())
        stems = {s for w in words for s in _stem(w)} | {"".join(words)}
        hit = [slug for slug, kws in _KEYWORD_STEMS.items() if stems & kws]
        if not hit:
            unmatched.append(interest.label)
        for slug in hit:
            weights[slug] += _WEIGHT[interest.source]
    if not weights:
        return {slug: 1.0 for slug in DEFAULT_CATEGORIES}, unmatched, True
    return dict(weights), unmatched, False


def apply_constraints(
    places: list[Place], constraints: list[str]
) -> tuple[list[Place], list[str], list[str]]:
    """Enforce the constraints OSM data can verify. Returns (kept, verified, unsupported).

    A place that cannot be *verified* against a requested constraint is excluded; a constraint we
    have no data for is reported, never silently ignored.
    """
    kept = places
    verified: list[str] = []
    unsupported: list[str] = []
    for text in constraints:
        low = text.lower()
        if "vegan" in low and "vegetarian" not in low:
            kept = [p for p in kept if _passes_diet(p, ("diet:vegan",))]
            verified.append(text)
        elif "vegetarian" in low or "veg only" in low or "pure veg" in low:
            kept = [p for p in kept if _passes_diet(p, ("diet:vegetarian", "diet:vegan"))]
            verified.append(text)
        elif "wheelchair" in low or "accessible" in low:
            kept = [p for p in kept if p.tags.get("wheelchair") == "yes"]
            verified.append(text)
        else:
            unsupported.append(text)
    return kept, verified, unsupported


def _passes_diet(place: Place, keys: tuple[str, ...]) -> bool:
    if not CATEGORIES[place.category].food:
        return True  # a museum has no diet; the constraint only binds food places
    return any(place.tags.get(k) in ("yes", "only") for k in keys)


def pick_candidates(
    places: list[Place], weights: dict[str, float], origin: GeoPoint, limit: int
) -> list[Place]:
    """Round-robin across categories (heaviest first), nearest first inside each, so one
    category cannot crowd out the rest."""
    by_cat: dict[str, list[Place]] = defaultdict(list)
    for p in sorted(places, key=lambda p: (haversine_m(origin, p.location), p.osm_id)):
        by_cat[p.category].append(p)
    order = sorted(by_cat, key=lambda c: (-weights.get(c, 0), c))
    out: list[Place] = []
    while len(out) < limit and any(by_cat.values()):
        for cat in order:
            if by_cat[cat] and len(out) < limit:
                out.append(by_cat[cat].pop(0))
    return out


def _round_up(t: datetime, step_min: int = 15) -> datetime:
    t = t.replace(second=0, microsecond=0)
    extra = (-t.minute) % step_min
    return t + timedelta(minutes=extra)


def _fmt_duration(total_min: int) -> str:
    h, m = divmod(total_min, 60)
    return f"{h} h {m} min" if h and m else f"{h} h" if h else f"{m} min"


class DeterministicPlanBuilder:
    def __init__(
        self,
        geocoder: Geocoder,
        places: PlaceSource,
        travel: TravelService,
        *,
        utc_offset_min: int = 330,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._geocoder = geocoder
        self._places = places
        self._travel = travel
        self._tz = timezone(timedelta(minutes=utc_offset_min))
        self._clock = clock

    # -- PlanBuilder protocol ---------------------------------------------------------------
    async def build(self, intent: Intent, request: PlanRequest) -> Plan:
        async for item in self.build_stream(intent, request):
            if isinstance(item, Plan):
                return item
        raise RuntimeError("builder produced no plan")

    # -- StreamingPlanBuilder protocol ------------------------------------------------------
    async def build_stream(
        self, intent: Intent, request: PlanRequest
    ) -> AsyncIterator[StatusEvent | Plan]:
        def status(step: StepKey, msg: str) -> StatusEvent:
            return StatusEvent(step=step, message=msg)

        if intent.duration_min is None:
            raise PlanningError("How much time do you have?")
        window = intent.duration_min
        mode: TravelMode = intent.transport or DEFAULT_MODE
        notes: list[str] = []
        if intent.transport is None:
            notes.append("No travel mode was given, so travel is assumed to be on foot.")

        # 1. Origin: only what the user typed or shared; never an assumed location.
        if intent.location_text:
            yield status("finding_places", f"Locating {intent.location_text}...")
            origin, label = await self._resolve(intent.location_text, request.city)
        elif intent.near_user and request.location is not None:
            origin, label = request.location, "your location"
        else:
            raise PlanningError(
                "Where would you like to explore? Share your location or name an area."
            )

        # 2. Real places from OpenStreetMap.
        weights, unmatched, used_default = match_categories(intent)
        if unmatched:
            notes.append("Not searched (no matching place type yet): " + ", ".join(unmatched) + ".")
        if used_default and unmatched:
            notes.append("None of your interests matched a place type, so this is a general mix.")
        elif used_default:
            notes.append("No specific interests were given, so this is a general sightseeing mix.")
        categories = sorted(weights, key=lambda c: (-weights[c], c))[:MAX_CATEGORIES]
        radius = SEARCH_RADIUS_M[mode]
        yield status("finding_places", f"Searching OpenStreetMap near {label}...")
        try:
            found = await self._places.search(origin, radius, categories)
        except UpstreamError:
            raise PlanningError(PROVIDER_DOWN) from None
        if not found:
            raise PlanningError(
                f"No matching places found within {radius / 1000:g} km of {label}. "
                "Try a different area or interest."
            )

        # 3. Hard constraints OSM can verify, then ranking.
        yield status("scoring", f"Ranking {len(found)} places...")
        usable, _verified, unsupported = apply_constraints(found, intent.constraints)
        if unsupported:
            notes.append(
                "Could not be checked against map data (not applied): "
                + "; ".join(unsupported)
                + "."
            )
        if not usable:
            raise PlanningError(
                "None of the nearby places could be confirmed to meet your requirements "
                f"({'; '.join(intent.constraints)}). Map data often lacks this detail."
            )
        shortlist = pick_candidates(usable, weights, origin, CANDIDATE_LIMIT)
        currency = intent.budget.currency if intent.budget else DEFAULT_CURRENCY
        candidates = [self._candidate(p, weights, currency) for p in shortlist]

        # 4. Travel times (real routes where possible, labelled estimates otherwise).
        yield status("checking_routes", "Checking travel times...")
        points = [origin, *(c.place.location for c in candidates)]
        matrix = await self._travel.matrix(points, mode)
        if matrix.source == "estimate":
            notes.append(
                "Travel times are straight-line estimates, not routed; real trips may take longer."
            )

        # 5. Deterministic scheduling under budget / time / opening-hours constraints.
        group = intent.group_size or 1
        budget_total = self._budget_total(intent, group, notes)
        start = _round_up(self._clock().astimezone(self._tz))
        sched = schedule(
            candidates,
            matrix,
            start=start,
            window_min=window,
            budget_total=budget_total,
            group_size=group,
            local_offset=timedelta(0),  # `start` is already local wall-clock time
        )
        if not sched.visits:
            raise PlanningError(self._infeasible_message(sched, window, intent))

        # 6. Assemble and validate.
        yield status("writing", "Putting your itinerary together...")
        plan = await self._assemble(
            intent, request, sched, matrix, mode, label, group, budget_total, currency, notes
        )
        check_plan(plan, start + timedelta(minutes=window), budget_total)
        yield plan

    # -- helpers ------------------------------------------------------------------------------
    async def _resolve(self, text: str, city: str | None) -> tuple[GeoPoint, str]:
        # `city` is only a hint when it differs from the text (finalize_intent copies it over).
        hint = city if city and city.strip().lower() != text.strip().lower() else None
        try:
            res = await self._geocoder.geocode(text, hint=hint)
        except LocationNotFoundError:
            raise PlanningError(
                f"I couldn't find “{text}”. Check the spelling or add the city."
            ) from None
        except AmbiguousLocationError as exc:
            opts = "; ".join(exc.options)
            raise PlanningError(
                f"“{text}” matches several places ({opts}). Please add the city or country."
            ) from None
        except UpstreamError:
            raise PlanningError(
                "Location search is temporarily unavailable. Please try again in a moment."
            ) from None
        return res.location, res.label or text

    @staticmethod
    def _candidate(place: Place, weights: dict[str, float], currency: str) -> Candidate:
        price, verified = entry_price(place.tags, currency)
        return Candidate(
            place=place,
            relevance=weights.get(place.category, 0.5),
            visit_min=CATEGORIES[place.category].visit_min,
            price=price,
            price_verified=verified,
        )

    @staticmethod
    def _budget_total(intent: Intent, group: int, notes: list[str]) -> float | None:
        if intent.budget is None:
            return None
        if intent.budget.per_person is True:
            return intent.budget.amount * group
        if group > 1:
            notes.append(f"Your budget is treated as a total for the group of {group}.")
        return intent.budget.amount

    @staticmethod
    def _infeasible_message(s: Schedule, window: int, intent: Intent) -> str:
        reasons: list[str] = []
        if s.skipped_time:
            reasons.append(f"nothing fits in {_fmt_duration(window)} once travel time is included")
        if s.skipped_closed:
            reasons.append(f"{s.skipped_closed} place(s) are closed at the time you would arrive")
        if s.skipped_budget and intent.budget:
            reasons.append("the known entry prices exceed your budget")
        if s.skipped_unreachable:
            reasons.append("no route was found to some places")
        why = "; ".join(reasons) or "no candidate could be scheduled"
        return f"I couldn't build a feasible itinerary: {why}."

    async def _assemble(
        self,
        intent: Intent,
        request: PlanRequest,
        sched: Schedule,
        matrix: TravelMatrix,
        mode: TravelMode,
        label: str,
        group: int,
        budget_total: float | None,
        currency: str,
        notes: list[str],
    ) -> Plan:
        labels = [i.label for i in intent.interests]
        stops: list[PlanStop] = []
        for v in sched.visits:
            stops.append(self._stop(v, labels))
        legs: list[TravelLeg] = []
        pairs = list(zip(sched.visits, stops, strict=True))
        for (prev, a), (cur, b) in pairwise(pairs):
            legs.append(
                await self._travel.leg(
                    a.id,
                    b.id,
                    a.location,
                    b.location,
                    mode,
                    matrix,
                    prev.index + 1,
                    cur.index + 1,
                )
            )
        # Money: only known prices are summed; unknown is counted, never treated as 0.
        priced = [s.cost for s in stops if s.cost is not None]
        unpriced = len(stops) - len(priced)
        total = round(sum(priced) * group, 2)
        cost_status: CostStatus = "known" if not unpriced else "partial" if priced else "unknown"
        budget_status, budget_note = self._budget_verdict(
            intent, total, unpriced, budget_total, currency
        )
        if unpriced:
            notes.append(f"{unpriced} of {len(stops)} stop(s) have no published price in map data.")
        if group > 1 and priced:
            notes.append(f"Known entry prices are multiplied by the group size ({group}).")
        unverified_hours = sum(not s.opening_hours_verified for s in stops)
        if unverified_hours:
            notes.append(
                f"Opening hours could not be verified for {unverified_hours} of {len(stops)} "
                "stop(s); check before you go."
            )
        notes.append("Visit lengths are typical assumptions per place type, not venue data.")
        if len(stops) < 2 and intent.duration_min and intent.duration_min >= 120:
            notes.append("Few matching places fit your constraints, so the plan is short.")

        first = sched.visits[0]
        where = label.split(",")[0]
        notes.append(f"The first stop is about {minutes(first.travel)} min from {where}.")
        end = sched.visits[-1].start + timedelta(minutes=sched.visits[-1].candidate.visit_min)
        summary = PlanSummary(
            total_cost=total,
            currency=currency,
            cost_status=cost_status,
            unpriced_stops=unpriced,
            budget_status=budget_status,
            budget_note=budget_note,
            total_duration_min=round((end - first.start).total_seconds() / 60),
            total_travel_min=sum(leg.duration_min for leg in legs),
        )
        return Plan(
            id=uuid.uuid4().hex,
            title=f"{_fmt_duration(intent.duration_min or 0)} around {label.split(',')[0]}",
            prompt=request.prompt,
            stops=stops,
            legs=legs,
            summary=summary,
            notes=notes,
            created_at=self._clock(),
        )

    @staticmethod
    def _stop(v: Visit, labels: list[str]) -> PlanStop:
        p, c = v.candidate.place, v.candidate
        hit = next(
            (lb for lb in labels if lb.rstrip("s") in f"{p.category} {p.name}".lower()), None
        )
        kind = p.category.replace("_", " ")
        why = f"A {kind} matching your interest in {hit}." if hit else f"A {kind} near your route."
        return PlanStop(
            id=p.osm_id.replace("/", "-"),
            name=p.name,
            category=kind,
            location=p.location,
            start=v.start,
            duration_min=c.visit_min,
            cost=c.price,
            cost_source="osm_tag" if c.price is not None and c.price_verified else "unknown",
            why=why,
            osm_id=p.osm_id,
            osm_url=p.osm_url,
            opening_hours_verified=v.hours_verified,
        )

    @staticmethod
    def _budget_verdict(
        intent: Intent, total: float, unpriced: int, budget_total: float | None, currency: str
    ) -> tuple[BudgetStatus, str | None]:
        if intent.budget is None or budget_total is None:
            return "not_set", None
        if total > budget_total + 1e-9:
            return "over", f"Known costs ({total:g} {currency}) exceed the budget."
        if unpriced:
            return "unverified", (
                f"Staying within {budget_total:g} {currency} cannot be confirmed: "
                f"{unpriced} stop(s) "
                f"have no published price. Known costs so far: {total:g} {currency}."
            )
        return "within", f"All stops have published prices totalling {total:g} {currency}."


def check_plan(plan: Plan, window_end: datetime, budget_total: float | None) -> None:
    """Final deterministic validation. A failure is a bug here, never a user error."""
    if not plan.stops:
        raise ValueError("plan has no stops")
    ids = [s.id for s in plan.stops]
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate stop ids")
    cursor = plan.stops[0].start
    for s in plan.stops:
        if s.start < cursor:
            raise ValueError("stops overlap or are out of order")
        if s.osm_id is None or s.osm_url is None:
            raise ValueError("stop without OSM source")
        if s.cost is None and s.cost_source != "unknown":
            raise ValueError("cost source without cost")
        cursor = s.start + timedelta(minutes=s.duration_min)
    if cursor > window_end:
        raise ValueError("plan exceeds the time window")
    expected = [(a.id, b.id) for a, b in zip(plan.stops, plan.stops[1:], strict=False)]
    if [(leg.from_stop_id, leg.to_stop_id) for leg in plan.legs] != expected:
        raise ValueError("legs do not connect consecutive stops")
    if plan.summary.budget_status == "over":
        raise ValueError("plan exceeds the budget")
    if budget_total is not None and plan.summary.total_cost > budget_total + 1e-9:
        raise ValueError("known costs exceed the budget")
    if math.isnan(plan.summary.total_cost):
        raise ValueError("invalid total")
