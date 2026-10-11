"""Public API contract. The web app's TS types are generated from these models."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator

StepKey = Literal["understanding", "finding_places", "scoring", "checking_routes", "writing"]
TravelMode = Literal["walk", "bike", "transit", "drive"]
ReviseAction = Literal["cheaper", "less_walking", "add_activity", "swap_stop", "custom"]
# Where a stop's price comes from. "unknown" is NOT free: cost is then None.
CostSource = Literal["osm_tag", "estimate", "unknown"]
# known = every stop priced, partial = some priced (total is a lower bound), unknown = none.
CostStatus = Literal["known", "partial", "unknown"]
# not_set = user gave no budget; within/over = decided from fully priced stops;
# unverified = a budget exists but unpriced stops make "within budget" unprovable.
BudgetStatus = Literal["not_set", "within", "over", "unverified"]
TravelSource = Literal["route", "estimate"]


class GeoPoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class PlanRequest(BaseModel):
    # Whitespace is stripped first, so "   " fails min_length instead of passing.
    model_config = ConfigDict(str_strip_whitespace=True)

    prompt: str = Field(min_length=3, max_length=1000)
    location: GeoPoint | None = None
    city: str | None = Field(default=None, min_length=1, max_length=100)


class PlanStop(BaseModel):
    id: str
    name: str
    category: str
    location: GeoPoint
    start: datetime
    duration_min: int = Field(ge=0)
    # None = price unknown (never 0). cost_source says whether a number is verified or guessed.
    cost: float | None = Field(default=None, ge=0)
    cost_source: CostSource = "unknown"
    rating: float | None = Field(default=None, ge=0, le=5)
    why: str
    osm_id: str | None = None
    osm_url: str | None = None
    # True only when OSM opening_hours was parsed and the visit fits inside it.
    opening_hours_verified: bool = False

    @model_validator(mode="after")
    def _cost_matches_source(self) -> "PlanStop":
        if self.cost is None:
            self.cost_source = "unknown"
        elif self.cost_source == "unknown":
            if "cost_source" in self.model_fields_set:
                raise ValueError("a numeric cost needs a cost_source other than 'unknown'")
            self.cost_source = "estimate"  # legacy payload with a bare number: not verified
        return self


class TravelLeg(BaseModel):
    from_stop_id: str
    to_stop_id: str
    mode: TravelMode
    distance_m: int = Field(ge=0)
    duration_min: int = Field(ge=0)
    # "route" = from a routing engine; "estimate" = straight-line distance / assumed speed.
    source: TravelSource = "estimate"
    # [lon, lat] pairs, ready for a MapLibre LineString.
    geometry: list[tuple[float, float]] = Field(default_factory=list)


class PlanSummary(BaseModel):
    # Sum of the stops whose price is known; a lower bound unless cost_status == "known".
    total_cost: float = Field(ge=0)
    cost_status: CostStatus = "unknown"
    unpriced_stops: int = Field(default=0, ge=0)
    budget_status: BudgetStatus = "not_set"
    budget_note: str | None = None
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    total_duration_min: int = Field(ge=0)
    total_travel_min: int = Field(ge=0)


class Plan(BaseModel):
    id: str
    title: str
    prompt: str
    stops: list[PlanStop]
    legs: list[TravelLeg]
    summary: PlanSummary
    # Caveats the user should see (assumptions, unverified hours, estimated travel).
    notes: list[str] = Field(default_factory=list)
    created_at: datetime
    saved: bool = False


class ReviseRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    action: ReviseAction
    instruction: str | None = Field(default=None, min_length=1, max_length=500)
    stop_id: str | None = Field(default=None, min_length=1, max_length=100)

    @model_validator(mode="after")
    def _action_has_required_fields(self) -> "ReviseRequest":
        if self.action == "custom" and self.instruction is None:
            raise ValueError("instruction is required when action is 'custom'")
        if self.action == "swap_stop" and self.stop_id is None:
            raise ValueError("stop_id is required when action is 'swap_stop'")
        return self


class SavedPlanItem(BaseModel):
    id: str
    title: str
    created_at: datetime
    summary: PlanSummary


class LoginRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+$")
    password: str = Field(min_length=8, max_length=128)


class User(BaseModel):
    id: str
    email: str


# --- SSE events: each is sent as `data: <json>` and discriminated by `type`.
class StatusEvent(BaseModel):
    type: Literal["status"] = "status"
    step: StepKey
    message: str


class StopEvent(BaseModel):
    type: Literal["stop"] = "stop"
    stop: PlanStop
    leg_from_previous: TravelLeg | None = None


class CompleteEvent(BaseModel):
    type: Literal["complete"] = "complete"
    plan: Plan


class ErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


class PlanStreamEvent(
    RootModel[
        Annotated[
            StatusEvent | StopEvent | CompleteEvent | ErrorEvent,
            Field(discriminator="type"),
        ]
    ]
):
    """One server-sent event of a plan or revision stream."""
