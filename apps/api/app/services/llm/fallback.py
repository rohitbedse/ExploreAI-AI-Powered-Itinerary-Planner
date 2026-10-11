"""Deterministic, no-network intent parser. Used when no LLM provider is configured or usable.

Conservative by design: it only reports what the text literally says; anything else stays None.
"""

import re

from app.schemas.intent import Budget, Interest, RawIntent

_NUM_WORDS = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
}
_NUM = r"(\d+(?:\.\d+)?|" + "|".join(_NUM_WORDS) + r")"
_AMOUNT = r"(\d[\d,]*(?:\.\d+)?)\s*(k\b)?"

_CURRENCY_PREFIX = re.compile(
    rf"(₹|\brs\.?|\binr\b|\$|\busd\b|€|\beur\b)\s*{_AMOUNT}", re.IGNORECASE
)
_CURRENCY_SUFFIX = re.compile(
    rf"{_AMOUNT}\s*(₹|\brupees?\b|\brs\b\.?|\binr\b|\busd\b|\bdollars?\b|\beur\b|\beuros?\b)",
    re.IGNORECASE,
)
_CURRENCY_CODE = {
    "₹": "INR", "rs": "INR", "rs.": "INR", "inr": "INR", "rupee": "INR", "rupees": "INR",
    "$": "USD", "usd": "USD", "dollar": "USD", "dollars": "USD",
    "€": "EUR", "eur": "EUR", "euro": "EUR", "euros": "EUR",
}  # fmt: skip

_HOURS = re.compile(
    rf"\b{_NUM}\s*(?:hours?|hrs?|h)\b(?:\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?)\b)?", re.IGNORECASE
)
_MINUTES = re.compile(rf"\b{_NUM}\s*(?:minutes?|mins?)\b", re.IGNORECASE)

_INTEREST_KEYWORDS = {
    "relax": "relaxing",
    "calm": "relaxing",
    "quiet": "quiet places",
    "food": "food",
    "eat": "food",
    "cafe": "cafes",
    "coffee": "cafes",
    "museum": "museums",
    "art": "art",
    "history": "history",
    "park": "parks",
    "garden": "parks",
    "nature": "nature",
    "shopping": "shopping",
    "temple": "temples",
    "music": "music",
    "nightlife": "nightlife",
    "view": "viewpoints",
    "walk": "walking",
}
_TRANSPORT = {
    "walk": r"\b(?:on foot|walking distance|walk(?:ing)? only|by walk)\b",
    "bike": r"\b(?:bike|bicycle|cycling|cycle)\b",
    "transit": r"\b(?:bus|metro|train|public transport|transit)\b",
    "drive": r"\b(?:drive|driving|by car|car|cab|taxi)\b",
}


def _num(raw: str) -> float:
    return float(_NUM_WORDS.get(raw.lower(), 0) or raw)


def _budget(text: str) -> Budget | None:
    m = _CURRENCY_PREFIX.search(text)
    if m:
        cur, amt, k = m.group(1), m.group(2), m.group(3)
    else:
        m = _CURRENCY_SUFFIX.search(text)
        if not m:
            return None
        amt, k, cur = m.group(1), m.group(2), m.group(3)
    try:
        amount = float(amt.replace(",", "")) * (1000 if k else 1)
    except ValueError:
        return None
    if amount <= 0:
        return None
    code = _CURRENCY_CODE.get(cur.lower().rstrip("."), "INR")
    return Budget(amount=amount, currency=code)


def _duration(text: str) -> int | None:
    low = text.lower()
    if re.search(r"\bhalf[- ]?(?:a[- ])?day\b", low):
        return 240
    if re.search(r"\b(?:full|whole)[- ]day\b|\ball day\b", low):
        return 480
    if re.search(r"\bcouple of hours\b", low):
        return 120
    if re.search(r"\ba few hours\b", low):
        return 180
    if re.search(r"\b(?:an|one)[- ]hour\b", low):
        return 60
    h = _HOURS.search(text)
    if h:
        total = _num(h.group(1)) * 60 + (int(h.group(2)) if h.group(2) else 0)
        return int(total) if total >= 5 else None
    m = _MINUTES.search(text)
    if m:
        total = _num(m.group(1))
        return int(total) if total >= 5 else None
    return None


def _group(text: str) -> int | None:
    low = text.lower()
    if re.search(r"\b(?:alone|solo|by myself|on my own)\b", low):
        return 1
    if re.search(r"\b(?:couple|me and my (?:wife|husband|partner|girlfriend|boyfriend))\b", low):
        return 2
    m = re.search(rf"\b(?:with|and)\s+{_NUM}\s+(?:friends|people|colleagues|kids|of us)\b", low)
    if m:
        return int(_num(m.group(1))) + (0 if "of us" in m.group(0) else 1)
    m = re.search(rf"\b(?:group of|party of|{_NUM}\s+(?:of us|people|persons|pax))\b", low)
    if m:
        n = re.search(_NUM, low[m.start() :])
        return int(_num(n.group(1))) if n else None
    return None


def parse_intent_rules(prompt: str) -> RawIntent:
    low = prompt.lower()
    interests: list[Interest] = []
    seen: set[str] = set()
    for key, label in _INTEREST_KEYWORDS.items():
        if key in low and label not in seen:
            seen.add(label)
            interests.append(Interest(label=label, source="explicit"))

    transport = next((k for k, pat in _TRANSPORT.items() if re.search(pat, low)), None)
    near_user = bool(re.search(r"\b(?:nearby|near me|around here|close by|near here)\b", low))
    loc = re.search(r"\b(?:in|at|around)\s+((?:[A-Z][\w'-]+)(?:\s+[A-Z][\w'-]+){0,3})", prompt)

    group = _group(prompt)
    return RawIntent.model_validate(
        {
            "budget": _budget(prompt),
            "duration_min": _duration(prompt),
            "group_size": group if group is None or 1 <= group <= 50 else None,
            "interests": [i.model_dump() for i in interests[:10]],
            "location_text": loc.group(1) if loc else None,
            "near_user": near_user,
            "transport": transport,
        }
    )
