from fastapi.testclient import TestClient

from app import __version__
from app.main import app, create_app


def test_health_ok(client: TestClient) -> None:
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "version": __version__, "environment": "development"}


def test_health_environment_comes_from_settings(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setenv("APP_ENV", "test")
    with TestClient(create_app()) as c:
        assert c.get("/api/v1/health").json()["environment"] == "test"


def test_ready_when_started(client: TestClient) -> None:
    res = client.get("/api/v1/ready")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ready"
    assert body["checks"] == [{"name": "lifecycle", "ok": True}]


def test_not_ready_before_startup_completes() -> None:
    # No `with`: lifespan has not run, so the app must not claim readiness.
    c = TestClient(create_app())
    res = c.get("/api/v1/ready")
    assert res.status_code == 503
    assert res.json()["status"] == "not_ready"
    assert res.json()["checks"][0]["ok"] is False


def test_not_ready_when_a_registered_check_fails_without_leaking_details() -> None:
    async def broken() -> None:
        raise RuntimeError("password=hunter2 host=db.internal")

    app_ = create_app()
    app_.state.readiness_checks = {"database": broken}
    with TestClient(app_) as c:
        res = c.get("/api/v1/ready")
    assert res.status_code == 503
    assert {"name": "database", "ok": False, "detail": "check failed"} in res.json()["checks"]
    assert "hunter2" not in res.text


def test_ready_check_that_hangs_times_out(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    import asyncio

    from app.services import readiness

    monkeypatch.setattr(readiness, "CHECK_TIMEOUT_SECONDS", 0.05)

    async def hang() -> None:
        await asyncio.sleep(5)

    app_ = create_app()
    app_.state.readiness_checks = {"slow": hang}
    with TestClient(app_) as c:
        res = c.get("/api/v1/ready")
    assert res.status_code == 503
    assert {"name": "slow", "ok": False, "detail": "timed out"} in res.json()["checks"]


def test_openapi_exposes_operations() -> None:
    spec = app.openapi()
    assert spec["paths"]["/api/v1/health"]["get"]["operationId"] == "getHealth"
    assert spec["paths"]["/api/v1/ready"]["get"]["operationId"] == "getReadiness"
    assert spec["info"]["version"] == __version__


def test_openapi_documents_error_envelope() -> None:
    spec = app.openapi()
    op = spec["paths"]["/api/v1/plans/stream"]["post"]
    assert op["responses"]["422"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ErrorResponse"
    }
    assert "HTTPValidationError" not in spec["components"]["schemas"]


def test_openapi_operation_ids_are_unique() -> None:
    ids = [
        op["operationId"]
        for path in app.openapi()["paths"].values()
        for op in path.values()
        if "operationId" in op
    ]
    assert len(ids) == len(set(ids))
