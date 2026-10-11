from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PLACEHOLDER_CONTACT = "you@example.com"


class Settings(BaseSettings):
    """All configuration comes from the environment. See /.env.example."""

    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"), extra="ignore", case_sensitive=False
    )

    app_env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    # "auto" = JSON lines in production, human-readable otherwise.
    log_format: Literal["auto", "json", "console"] = "auto"
    http_user_agent: str = f"ExploreAI/0.1 (+mailto:{_PLACEHOLDER_CONTACT})"
    cors_origins: str = "http://localhost:3000"

    database_url: str = "postgresql+asyncpg://exploreai:exploreai@localhost:5432/exploreai"
    redis_url: str = "redis://localhost:6379/0"
    cache_default_ttl_seconds: int = Field(default=86400, ge=0)

    # Only "gemini" is implemented; other names are skipped (logged) until added.
    llm_provider_chain: str = "gemini"
    llm_timeout_seconds: float = Field(default=30, gt=0, le=120)
    llm_max_retries: int = Field(default=2, ge=0, le=5)
    gemini_api_key: SecretStr | None = None
    # Model names are config; verify against current Gemini docs before relying on the default.
    gemini_model: str = "gemini-2.5-flash"

    pipeline_timeout_seconds: float = Field(default=120, gt=0, le=600)
    http_timeout_seconds: float = Field(default=15, gt=0, le=120)
    http_max_retries: int = Field(default=2, ge=0, le=5)

    # Deterministic planner. Disabled -> /plans/stream ends with the explicit "no builder" error.
    planner_enabled: bool = True
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    photon_url: str = "https://photon.komoot.io"
    # The public OSRM demo only serves the car profile, so it is the *driving* router. Walk and
    # bike routers are blank by default: those legs are then labelled straight-line estimates.
    osrm_url: str = "https://router.project-osrm.org"
    osrm_walk_url: str = ""
    osrm_walk_profile: str = "foot"
    osrm_bike_url: str = ""
    osrm_bike_profile: str = "bike"
    # Plans start "now" in this fixed UTC offset (no tz database dependency; no DST handling).
    # Opening hours are interpreted in the same offset. Default: India (+05:30).
    plan_utc_offset_minutes: int = Field(default=330, ge=-720, le=840)
    overpass_max_elements: int = Field(default=300, ge=10, le=2000)

    @field_validator("log_level", mode="before")
    @classmethod
    def _upper_log_level(cls, v: object) -> object:
        return v.strip().upper() if isinstance(v, str) else v

    @field_validator("log_format", "app_env", mode="before")
    @classmethod
    def _lower_enum(cls, v: object) -> object:
        return v.strip().lower() if isinstance(v, str) else v

    @field_validator("gemini_api_key", mode="before")
    @classmethod
    def _blank_key_is_none(cls, v: object) -> object:
        return None if isinstance(v, str) and not v.strip() else v

    @field_validator("http_user_agent")
    @classmethod
    def _user_agent_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("HTTP_USER_AGENT must not be empty")
        return v

    @model_validator(mode="after")
    def _check_deployment_safety(self) -> Self:
        origins = self.cors_origin_list
        if not origins:
            raise ValueError("CORS_ORIGINS must list at least one origin")
        if "*" in origins:
            # The API sends credentialed responses; browsers reject '*' with credentials.
            raise ValueError("CORS_ORIGINS must not contain '*' (credentials are enabled)")
        if self.app_env == "production" and _PLACEHOLDER_CONTACT in self.http_user_agent:
            raise ValueError(
                "HTTP_USER_AGENT must carry a real contact in production "
                "(Nominatim/Overpass usage policies)"
            )
        return self

    @property
    def llm_provider_names(self) -> list[str]:
        return [p.strip().lower() for p in self.llm_provider_chain.split(",") if p.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def effective_log_format(self) -> Literal["json", "console"]:
        if self.log_format == "auto":
            return "json" if self.app_env == "production" else "console"
        return self.log_format


@lru_cache
def get_settings() -> Settings:
    return Settings()
