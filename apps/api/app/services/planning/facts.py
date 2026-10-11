"""Facts read from OSM tags: opening hours and entry price. Unknown stays unknown.

``is_open`` returns None whenever the tag is missing or uses syntax this parser does not fully
understand (public holidays, sunrise/sunset, week numbers, ...). Callers must treat None as
"unverified", never as open and never as closed.
"""

import re
from datetime import datetime

_DAYS = ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")
_WEEK = 7 * 1440
_TIME = r"(?:[01]\d|2[0-4]):[0-5]\d"
_RANGE = re.compile(rf"^({_TIME})-({_TIME})$")
_DAY_SPEC = re.compile(r"^(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?$")

Intervals = dict[int, list[tuple[int, int]]]  # weekday -> [(start_min, end_min)], end may be > 1440


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _days(spec: str) -> list[int] | None:
    out: list[int] = []
    for part in spec.split(","):
        if not _DAY_SPEC.match(part):
            return None
        a, _, b = part.partition("-")
        i = _DAYS.index(a)
        j = _DAYS.index(b) if b else i
        out += [(i + k) % 7 for k in range((j - i) % 7 + 1)]
    return out


def parse_opening_hours(raw: str) -> Intervals | None:
    """Subset of the OSM opening_hours grammar. None when anything is not understood."""
    raw = raw.strip()
    if raw == "24/7":
        return {d: [(0, 1440)] for d in range(7)}
    result: Intervals | None = None
    for rule in (r.strip() for r in raw.split(";")):
        if not rule:
            continue
        tokens = rule.split(None, 1)
        days: list[int] | None
        if _DAY_SPEC.match(tokens[0].split(",")[0]):
            days = _days(tokens[0])
            rest = tokens[1].strip() if len(tokens) > 1 else ""
        else:
            days, rest = list(range(7)), rule
        if days is None or not rest:
            return None
        if result is None:
            result = {}
        if rest.lower() in ("off", "closed"):
            for d in days:
                result[d] = []
            continue
        spans: list[tuple[int, int]] = []
        for chunk in rest.replace(" ", "").split(","):
            m = _RANGE.match(chunk)
            if not m:
                return None
            s, e = _minutes(m.group(1)), _minutes(m.group(2))
            if e <= s:
                e += 1440  # runs past midnight
            spans.append((s, e))
        for d in days:
            result[d] = spans
    return result


def is_open(raw: str | None, start: datetime, duration_min: int) -> bool | None:
    """True/False if the whole visit is inside/outside the hours; None if unknown.

    ``start`` must already be in the venue's local time.
    """
    if not raw:
        return None
    table = parse_opening_hours(raw)
    if table is None:
        return None
    t0 = start.weekday() * 1440 + start.hour * 60 + start.minute
    t1 = t0 + duration_min
    for day, spans in table.items():
        for s, e in spans:
            for shift in (-_WEEK, 0, _WEEK):
                a, b = day * 1440 + s + shift, day * 1440 + e + shift
                if a <= t0 and t1 <= b:
                    return True
    return False


_PRICE_AFTER = re.compile(r"(\d+(?:[.,]\d+)?)\s*([A-Z]{3})\b")
_PRICE_BEFORE = re.compile(r"\b([A-Z]{3})\s*(\d+(?:[.,]\d+)?)")


def entry_price(tags: dict[str, str], currency: str) -> tuple[float | None, bool]:
    """(price, verified). ``fee=no`` is a verified 0; one ``charge`` in ``currency`` is verified.

    Anything else (``fee=yes`` with no amount, several tiers, another currency, no tag) returns
    (None, False): the price is unknown, not zero.
    """
    fee = tags.get("fee", "").strip().lower()
    charge = tags.get("charge", "")
    if charge:
        found = [(m.group(2), m.group(1)) for m in _PRICE_AFTER.finditer(charge)]
        found += [(m.group(1), m.group(2)) for m in _PRICE_BEFORE.finditer(charge)]
        if len(found) == 1 and found[0][0] == currency:
            return float(found[0][1].replace(",", ".")), True
        return None, False
    if fee == "no":
        return 0.0, True
    return None, False
