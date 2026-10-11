"""Deterministic scheduler: picks and orders stops under hard constraints. Pure, no I/O, no LLM.

Hard constraints enforced here (a stop that violates one is never chosen):
- the whole itinerary (travel + visits) fits the time window;
- a stop with *known* opening hours must be open for the entire visit; unknown hours are allowed
  and flagged ``hours_verified=False``;
- the sum of *known* prices never exceeds the budget; unknown prices are not counted and not
  rejected (the plan reports them as unverified);
- an unreachable pair (router said so) is never travelled.

Same inputs always give the same schedule (ties break on OSM id).
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.services.planning.facts import is_open
from app.services.planning.places import Place
from app.services.planning.routing import Hop, TravelMatrix, minutes

MAX_STOPS = 8
MIN_VISIT_SLOT_MIN = 45  # used only to cap the stop count for a window
_TRAVEL_PENALTY_PER_MIN = 1 / 20  # 20 travel-minutes cost one relevance point
_REPEAT_CATEGORY_PENALTY = 0.4


@dataclass(frozen=True)
class Candidate:
    place: Place
    relevance: float
    visit_min: int
    price: float | None  # per person; None = unknown (never 0)
    price_verified: bool


@dataclass(frozen=True)
class Visit:
    candidate: Candidate
    index: int  # index into the candidate list (matrix row = index + 1)
    start: datetime
    travel: Hop  # from the previous stop (or the origin for the first)
    hours_verified: bool


@dataclass(frozen=True)
class Schedule:
    visits: list[Visit]
    skipped_closed: int
    skipped_budget: int
    skipped_unreachable: int
    skipped_time: int


def schedule(
    candidates: list[Candidate],
    matrix: TravelMatrix,
    *,
    start: datetime,
    window_min: int,
    budget_total: float | None,
    group_size: int = 1,
    local_offset: timedelta = timedelta(0),
) -> Schedule:
    """Greedy best-utility insertion. ``matrix`` rows/cols: 0 = origin, i+1 = candidates[i]."""
    end = start + timedelta(minutes=window_min)
    max_stops = max(1, min(MAX_STOPS, window_min // MIN_VISIT_SLOT_MIN))
    remaining = set(range(len(candidates)))
    visits: list[Visit] = []
    here, now = 0, start
    spent = 0.0
    seen_closed: set[int] = set()
    seen_budget: set[int] = set()
    seen_unreach: set[int] = set()
    seen_time: set[int] = set()

    while remaining and len(visits) < max_stops:
        best: tuple[tuple[float, str], int, Hop, bool] | None = None
        for i in sorted(remaining):
            cand = candidates[i]
            hop = matrix.hops[here][i + 1]
            if hop is None:
                seen_unreach.add(i)
                continue
            arrive = now + timedelta(minutes=minutes(hop))
            if arrive + timedelta(minutes=cand.visit_min) > end:
                seen_time.add(i)
                continue
            verdict = is_open(
                cand.place.tags.get("opening_hours"), arrive + local_offset, cand.visit_min
            )
            if verdict is False:
                seen_closed.add(i)
                continue
            if (
                budget_total is not None
                and cand.price is not None
                and spent + cand.price * group_size > budget_total + 1e-9
            ):
                seen_budget.add(i)
                continue
            repeats = sum(v.candidate.place.category == cand.place.category for v in visits)
            utility = (
                cand.relevance
                - minutes(hop) * _TRAVEL_PENALTY_PER_MIN
                - repeats * _REPEAT_CATEGORY_PENALTY
            )
            rank = (-round(utility, 9), cand.place.osm_id)
            if best is None or rank < best[0]:
                best = (rank, i, hop, verdict is True)
        if best is None:
            break
        _, i, hop, verified = best
        cand = candidates[i]
        arrive = now + timedelta(minutes=minutes(hop))
        visits.append(Visit(cand, i, arrive, hop, verified))
        if cand.price is not None:
            spent += cand.price * group_size
        now = arrive + timedelta(minutes=cand.visit_min)
        here = i + 1
        remaining.discard(i)

    chosen = {v.index for v in visits}
    return Schedule(
        visits=visits,
        skipped_closed=len(seen_closed - chosen),
        skipped_budget=len(seen_budget - chosen),
        skipped_unreachable=len(seen_unreach - chosen),
        skipped_time=len(seen_time - chosen),
    )
