import logging

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.errors import AppError
from app.main import create_app


def test_validation_error_shape_is_predictable(client: TestClient) -> None:
    res = client.post("/api/v1/plans/stream", json={"prompt": "hi", "location": {"lat": 123}})
    assert res.status_code == 422
    body = res.json()
    assert body["code"] == "validation_error"
    assert body["detail"].startswith("Request validation failed: body.prompt")
    assert "(+" in body["detail"]  # multiple problems are summarised
    fields = {e["field"] for e in body["errors"]}
    assert {"body.prompt", "body.location.lat", "body.location.lon"} <= fields
    assert all(set(e) == {"field", "message", "type"} for e in body["errors"])
    assert body["request_id"] == res.headers["X-Request-ID"]


def test_validation_error_never_echoes_input(client: TestClient) -> None:
    res = client.post("/api/v1/auth/login", json={"email": "not-an-email", "password": "short"})
    assert res.status_code == 422
    assert "not-an-email" not in res.text
    assert "short" not in res.text.replace("too_short", "").replace("String should", "")


def test_malformed_json_is_a_validation_error(client: TestClient) -> None:
    res = client.post(
        "/api/v1/plans/stream", content=b"{nope", headers={"content-type": "application/json"}
    )
    assert res.status_code == 422
    assert res.json()["code"] == "validation_error"


def test_unknown_route_uses_envelope(client: TestClient) -> None:
    res = client.get("/api/v1/nope")
    assert res.status_code == 404
    body = res.json()
    assert body["code"] == "not_found"
    assert body["detail"] == "Not Found"
    assert body["request_id"] == res.headers["X-Request-ID"]


def test_wrong_method_uses_envelope(client: TestClient) -> None:
    res = client.delete("/api/v1/health")
    assert res.status_code == 405
    assert res.json()["code"] == "method_not_allowed"
    assert "allow" in res.headers


def test_not_implemented_handlers_keep_501_and_string_detail(client: TestClient) -> None:
    res = client.get("/api/v1/plans/abc")
    assert res.status_code == 501
    body = res.json()
    assert body["detail"] == "Not implemented yet"  # web client reads `detail` as a string
    assert body["code"] == "not_implemented"


def test_app_error_and_http_exception_are_mapped() -> None:
    app = create_app()

    @app.get("/boom-app")
    async def boom_app() -> None:
        raise AppError(409, "conflict_thing", "Already exists")

    @app.get("/boom-http")
    async def boom_http() -> None:
        raise HTTPException(status_code=403, detail="nope")

    with TestClient(app) as c:
        a = c.get("/boom-app")
        h = c.get("/boom-http")
    assert (a.status_code, a.json()["code"], a.json()["detail"]) == (
        409,
        "conflict_thing",
        "Already exists",
    )
    assert (h.status_code, h.json()["code"]) == (403, "forbidden")


def test_unhandled_exception_returns_generic_500_with_request_id(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app = create_app()

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("secret internal detail")

    with TestClient(app, raise_server_exceptions=False) as c, caplog.at_level(logging.ERROR):
        res = c.get("/boom", headers={"X-Request-ID": "req-123"})
    assert res.status_code == 500
    assert res.json() == {
        "detail": "Internal server error",
        "code": "internal_error",
        "request_id": "req-123",
    }
    assert res.headers["X-Request-ID"] == "req-123"
    assert "secret internal detail" not in res.text
    # ...but the real cause is in the logs, correlated by id.
    record = next(r for r in caplog.records if r.getMessage() == "unhandled exception")
    assert record.exc_info is not None
    assert record.request_id == "req-123"  # type: ignore[attr-defined]
