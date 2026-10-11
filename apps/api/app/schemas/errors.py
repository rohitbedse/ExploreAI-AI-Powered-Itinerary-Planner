"""Error envelope returned for every non-2xx response."""

from pydantic import BaseModel, Field


class ErrorItem(BaseModel):
    """One field-level problem. Never echoes the offending input value."""

    field: str = Field(description="Dotted location, e.g. 'body.location.lat'.")
    message: str
    type: str = Field(description="Machine-readable validation error type.")


class ErrorResponse(BaseModel):
    # `detail` stays a plain string so clients that read FastAPI's `{detail: string}` keep working.
    detail: str = Field(description="Human-readable summary.")
    code: str = Field(description="Stable machine-readable code, e.g. 'validation_error'.")
    request_id: str | None = Field(default=None, description="Matches the X-Request-ID header.")
    errors: list[ErrorItem] | None = None
