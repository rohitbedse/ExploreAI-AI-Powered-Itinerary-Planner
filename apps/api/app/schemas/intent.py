"""Structured intent extracted from a free-text request.

Internal contract between intent extraction and the (future) planner. It is not returned by any
route yet, so it is not part of the OpenAPI document or the generated TS types.

Rules baked into the model:
- Scalar fields (budget, duration, group size, transport, location) hold *explicitly stated*
  values only. ``None`` means "not stated", never 0 / unlimited / "here".
- Only ``interests`` may carry inferred entries, each tagged with its ``source``.
- ``missing`` and ``clarifications`` are derived by code, never taken from the LLM.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.schemas.plans import TravelMode

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]

MissingField = Literal["location", "duration", "budget"]
# Without these the planner cannot start. Budget is surfaced but never defaulted to "unlimited".
ESSENTIAL_FIELDS: frozenset[MissingField] = frozenset({"location", "duration"})

MAX_DURATION_MIN = 24 * 60
MAX_LIST_ITEMS = 10


class Budget(BaseModel):
    amount: float = Field(gt=0, le=10_000_000)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    # True when the amount is per person; None when the user did not say.
    per_person: bool | None = None


class Interest(BaseModel):
    label: ShortText
    source: Literal["explicit", "inferred"]

    @field_validator("label")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class RawIntent(BaseModel):
    """What the LLM (or the rule-based fallback) is allowed to say. Unknown keys are dropped."""

    model_config = ConfigDict(extra="ignore")

    budget: Budget | None = None
    duration_min: int | None = Field(default=None, ge=5, le=MAX_DURATION_MIN)
    group_size: int | None = Field(default=None, ge=1, le=50)
    interests: list[Interest] = Field(default_factory=list, max_length=MAX_LIST_ITEMS)
    # Place name the user typed ("Koramangala"). Never coordinates.
    location_text: ShortText | None = None
    # User said "nearby" / "near me" / "around here": relative to a position we may not have.
    near_user: bool = False
    transport: TravelMode | None = None
    # Explicit hard requirements in the user's words ("vegetarian", "wheelchair accessible").
    constraints: list[LongText] = Field(default_factory=list, max_length=MAX_LIST_ITEMS)
    # Statements in the request that disagree with each other.
    contradictions: list[LongText] = Field(default_factory=list, max_length=MAX_LIST_ITEMS)


class Intent(RawIntent):
    missing: list[MissingField] = Field(default_factory=list)
    clarifications: list[LongText] = Field(default_factory=list)

    @property
    def needs_clarification(self) -> bool:
        return bool(self.contradictions) or any(m in ESSENTIAL_FIELDS for m in self.missing)


_QUESTIONS: dict[MissingField, str] = {
    "location": "Where would you like to explore? Share your location or name an area.",
    "duration": "How much time do you have?",
    "budget": "What is your budget? (Without one, costs will not be limited by a budget.)",
}


def finalize_intent(
    raw: RawIntent, *, has_device_location: bool = False, city: str | None = None
) -> Intent:
    """Derive ``missing`` / ``clarifications`` deterministically from a validated RawIntent."""
    data = raw.model_copy(deep=True)
    if data.location_text is None and city and city.strip():
        data.location_text = city.strip()[:60]
    missing: list[MissingField] = []
    if data.location_text is None and not (data.near_user and has_device_location):
        missing.append("location")
    if data.duration_min is None:
        missing.append("duration")
    if data.budget is None:
        missing.append("budget")
    questions = [_QUESTIONS[m] for m in missing]
    questions += [f"These seem to conflict: {c}. Which did you mean?" for c in data.contradictions]
    return Intent(
        **data.model_dump(),
        missing=missing,
        clarifications=[q[:200] for q in questions],
    )


class IntentResult(BaseModel):
    intent: Intent
    # "fallback" = rule-based parse; lower recall, never uses an LLM.
    source: Literal["llm", "fallback"]
    provider: str | None = None
