import pytest
from pydantic import ValidationError

from app.config import Settings, get_settings


def make(**kw: object) -> Settings:
    # _env_file=None: never read a developer's real .env in unit tests.
    return Settings(_env_file=None, **kw)  # type: ignore[arg-type]


def test_defaults() -> None:
    s = make()
    assert s.app_env == "development"
    assert s.log_level == "INFO"
    assert s.cors_origin_list == ["http://localhost:3000"]
    assert s.http_timeout_seconds == 15
    assert s.http_max_retries == 2
    assert s.effective_log_format == "console"


def test_environment_variables_override_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("HTTP_TIMEOUT_SECONDS", "7.5")
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example ,")
    s = make()
    assert s.app_env == "test"
    assert s.http_timeout_seconds == 7.5
    assert s.cors_origin_list == ["https://a.example", "https://b.example"]


def test_enum_values_are_normalised(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_LEVEL", " debug ")
    monkeypatch.setenv("APP_ENV", "TEST")
    s = make()
    assert (s.log_level, s.app_env) == ("DEBUG", "test")


def test_unknown_env_vars_are_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    assert make().app_env == "development"


@pytest.mark.parametrize(
    "kw",
    [
        {"log_level": "LOUD"},
        {"app_env": "staging"},
        {"http_timeout_seconds": 0},
        {"http_timeout_seconds": 500},
        {"http_max_retries": -1},
        {"http_max_retries": 50},
        {"http_user_agent": "   "},
        {"cors_origins": " , "},
        {"cors_origins": "*"},
        {"cache_default_ttl_seconds": -1},
    ],
)
def test_invalid_values_fail_fast(kw: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        make(**kw)


def test_production_rejects_placeholder_contact() -> None:
    with pytest.raises(ValidationError, match="real contact"):
        make(app_env="production")
    ok = make(app_env="production", http_user_agent="ExploreAI/0.1 (+mailto:ops@real.org)")
    assert ok.effective_log_format == "json"


def test_development_allows_placeholder_contact() -> None:
    assert make(app_env="development").http_user_agent.startswith("ExploreAI/")


def test_explicit_log_format_wins() -> None:
    assert make(log_format="json").effective_log_format == "json"
    assert (
        make(
            app_env="production", http_user_agent="x (+a@b.org)", log_format="console"
        ).effective_log_format
        == "console"
    )


def test_get_settings_is_cached(monkeypatch: pytest.MonkeyPatch) -> None:
    a = get_settings()
    monkeypatch.setenv("APP_ENV", "test")
    assert get_settings() is a  # cached until cache_clear()
    get_settings.cache_clear()
    assert get_settings().app_env == "test"
