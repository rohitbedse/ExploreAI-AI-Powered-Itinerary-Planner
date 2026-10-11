import pytest
from pydantic import ValidationError

from app.schemas import (
    CompleteEvent,
    GeoPoint,
    LoginRequest,
    PlanRequest,
    PlanStreamEvent,
    PlanSummary,
    ReviseRequest,
    StatusEvent,
)


def test_stream_event_discriminates_on_type() -> None:
    ev = PlanStreamEvent.model_validate(
        {"type": "status", "step": "finding_places", "message": "Finding places..."}
    )
    assert isinstance(ev.root, StatusEvent)


def test_stream_event_rejects_unknown_type() -> None:
    with pytest.raises(ValidationError):
        PlanStreamEvent.model_validate({"type": "nope"})


def test_complete_event_requires_plan() -> None:
    with pytest.raises(ValidationError):
        CompleteEvent.model_validate({"type": "complete"})


def test_plan_request_bounds() -> None:
    with pytest.raises(ValidationError):
        PlanRequest(prompt="hi")
    with pytest.raises(ValidationError):
        PlanRequest(prompt="ok prompt", location={"lat": 123, "lon": 0})


def test_plan_request_strips_and_rejects_whitespace_only() -> None:
    assert PlanRequest(prompt="  cheap cafes  ").prompt == "cheap cafes"
    with pytest.raises(ValidationError):
        PlanRequest(prompt="     ")
    with pytest.raises(ValidationError):
        PlanRequest(prompt="x" * 1001)
    with pytest.raises(ValidationError):
        PlanRequest(prompt="valid prompt", city="   ")


def test_plan_request_minimal_and_full_payloads_still_valid() -> None:
    assert PlanRequest(prompt="relaxing walk").location is None
    full = PlanRequest.model_validate(
        {"prompt": "relaxing walk", "location": {"lat": 12.97, "lon": 77.59}, "city": "Bengaluru"}
    )
    assert full.location == GeoPoint(lat=12.97, lon=77.59)


@pytest.mark.parametrize(("lat", "lon"), [(90.1, 0), (-90.1, 0), (0, 180.1), (0, -180.1)])
def test_geopoint_rejects_out_of_range(lat: float, lon: float) -> None:
    with pytest.raises(ValidationError):
        GeoPoint(lat=lat, lon=lon)


def test_geopoint_accepts_boundaries() -> None:
    GeoPoint(lat=90, lon=180)
    GeoPoint(lat=-90, lon=-180)


def test_revise_request_conditional_requirements() -> None:
    with pytest.raises(ValidationError, match="instruction is required"):
        ReviseRequest(action="custom")
    with pytest.raises(ValidationError, match="stop_id is required"):
        ReviseRequest(action="swap_stop")
    assert ReviseRequest(action="cheaper").instruction is None
    assert ReviseRequest(action="custom", instruction="more parks").action == "custom"


def test_revise_request_rejects_unknown_action() -> None:
    with pytest.raises(ValidationError):
        ReviseRequest(action="teleport")


def test_plan_summary_constraints() -> None:
    assert PlanSummary(total_cost=0, total_duration_min=0, total_travel_min=0).currency == "INR"
    for bad in (
        {"total_cost": -1},
        {"total_duration_min": -1},
        {"total_travel_min": -1},
        {"currency": "inr"},
        {"currency": "RUPEES"},
    ):
        base = {"total_cost": 1, "total_duration_min": 1, "total_travel_min": 1} | bad
        with pytest.raises(ValidationError):
            PlanSummary.model_validate(base)


def test_login_request_validation() -> None:
    assert LoginRequest(email=" a@b.co ", password="longenough").email == "a@b.co"
    for bad in ({"email": "nope"}, {"email": "a b@c.d"}, {"password": "short"}):
        with pytest.raises(ValidationError):
            LoginRequest.model_validate({"email": "a@b.co", "password": "longenough"} | bad)
