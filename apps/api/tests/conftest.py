from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import create_app


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Tests must not depend on a developer's .env or shell environment."""
    for key in (
        "APP_ENV",
        "LOG_LEVEL",
        "LOG_FORMAT",
        "HTTP_USER_AGENT",
        "CORS_ORIGINS",
        "HTTP_TIMEOUT_SECONDS",
        "HTTP_MAX_RETRIES",
        "LLM_PROVIDER_CHAIN",
        "LLM_TIMEOUT_SECONDS",
        "LLM_MAX_RETRIES",
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "OVERPASS_URL",
        "PHOTON_URL",
        "OSRM_URL",
        "OSRM_WALK_URL",
        "OSRM_BIKE_URL",
        "PLAN_UTC_OFFSET_MINUTES",
    ):
        monkeypatch.delenv(key, raising=False)
    # Never let a test reach the real OSM services through the lifespan-built planner.
    monkeypatch.setenv("PLANNER_ENABLED", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def client() -> Iterator[TestClient]:
    # The context manager runs the lifespan, which flips readiness on.
    with TestClient(create_app(), raise_server_exceptions=False) as c:
        yield c
