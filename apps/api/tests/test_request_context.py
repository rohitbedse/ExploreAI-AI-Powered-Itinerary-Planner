import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.logging_config import JsonFormatter, configure_logging, request_id_var


def test_request_id_is_generated(client: TestClient) -> None:
    a = client.get("/api/v1/health").headers["X-Request-ID"]
    b = client.get("/api/v1/health").headers["X-Request-ID"]
    assert len(a) == 32
    assert a != b


def test_safe_incoming_request_id_is_propagated(client: TestClient) -> None:
    res = client.get("/api/v1/health", headers={"X-Request-ID": "abc-123_X.y"})
    assert res.headers["X-Request-ID"] == "abc-123_X.y"


@pytest.mark.parametrize("bad", ["has space", "a" * 65, "semi;colon", "new\tline"])
def test_unsafe_incoming_request_id_is_replaced(client: TestClient, bad: str) -> None:
    res = client.get("/api/v1/health", headers={"X-Request-ID": bad})
    assert res.headers["X-Request-ID"] != bad
    assert len(res.headers["X-Request-ID"]) == 32


def test_request_id_exposed_to_browsers_via_cors(client: TestClient) -> None:
    res = client.get("/api/v1/health", headers={"Origin": "http://localhost:3000"})
    assert res.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "x-request-id" in res.headers["access-control-expose-headers"].lower()


def test_dev_cors_allows_any_loopback_port(client: TestClient) -> None:
    # `next dev` moves to :3001 when :3000 is busy; that must not read as "can't reach the planner".
    for origin in ("http://localhost:3001", "http://127.0.0.1:3000"):
        res = client.get("/api/v1/health", headers={"Origin": origin})
        assert res.headers["access-control-allow-origin"] == origin
    res = client.get("/api/v1/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in res.headers


def test_production_cors_is_only_the_configured_list(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings
    from app.main import create_app

    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("HTTP_USER_AGENT", "ExploreAI/1.0 (+mailto:ops@real-domain.dev)")
    get_settings.cache_clear()
    with TestClient(create_app()) as c:
        res = c.get("/api/v1/health", headers={"Origin": "http://localhost:3001"})
        assert "access-control-allow-origin" not in res.headers


def test_request_is_logged_with_id_and_status(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.request"):
        client.get("/api/v1/health", headers={"X-Request-ID": "log-me"})
    rec = next(r for r in caplog.records if r.name == "app.request")
    assert (rec.method, rec.path, rec.status) == ("GET", "/api/v1/health", 200)  # type: ignore[attr-defined]
    assert rec.duration_ms >= 0  # type: ignore[attr-defined]


def test_request_id_context_is_reset_after_request(client: TestClient) -> None:
    client.get("/api/v1/health")
    assert request_id_var.get() is None


def test_json_formatter_emits_structured_fields() -> None:
    rec = logging.LogRecord("x.y", logging.INFO, __file__, 1, "hello %s", ("w",), None)
    rec.request_id = "rid-1"
    rec.status = 200
    out = json.loads(JsonFormatter().format(rec))
    assert out["message"] == "hello w"
    assert out["level"] == "INFO"
    assert out["request_id"] == "rid-1"
    assert out["status"] == 200
    assert out["ts"].endswith("+00:00")


def test_configure_logging_is_idempotent() -> None:
    root = logging.getLogger()
    before = len(root.handlers)
    configure_logging(Settings())
    configure_logging(Settings())
    after_twice = len(root.handlers)
    configure_logging(Settings(log_level="DEBUG"))
    assert len(root.handlers) == after_twice
    assert after_twice <= before + 1
    assert root.level == logging.DEBUG
    configure_logging(Settings())
