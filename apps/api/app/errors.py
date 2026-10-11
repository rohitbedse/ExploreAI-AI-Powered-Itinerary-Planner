"""One error envelope (ErrorResponse) for every failure the API returns."""

from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.schemas.errors import ErrorItem, ErrorResponse

REQUEST_ID_HEADER = "X-Request-ID"


class AppError(Exception):
    """Raise from services/routers for an expected, client-visible failure."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def build_error(
    status_code: int,
    code: str,
    detail: str,
    request_id: str | None,
    errors: list[ErrorItem] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = ErrorResponse(detail=detail, code=code, request_id=request_id, errors=errors)
    out = {REQUEST_ID_HEADER: request_id} if request_id else {}
    out.update(headers or {})
    return JSONResponse(body.model_dump(exclude_none=True), status_code=status_code, headers=out)


def _rid(request: Request) -> str | None:
    rid = request.scope.get("request_id")
    return rid if isinstance(rid, str) else None


def _code_for(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).name.lower()
    except ValueError:
        return "http_error"


def _field(loc: tuple[Any, ...]) -> str:
    return ".".join(str(p) for p in loc) or "body"


async def _app_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    return build_error(exc.status_code, exc.code, exc.message, _rid(request))


async def _http_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    detail = exc.detail if isinstance(exc.detail, str) else HTTPStatus(exc.status_code).phrase
    headers = dict(exc.headers) if exc.headers else None
    return build_error(
        exc.status_code, _code_for(exc.status_code), detail, _rid(request), headers=headers
    )


async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    # Deliberately drop `input`/`ctx`: request bodies can hold passwords or free text.
    items = [
        ErrorItem(field=_field(tuple(e["loc"])), message=str(e["msg"]), type=str(e["type"]))
        for e in exc.errors()
    ]
    first = items[0]
    summary = f"Request validation failed: {first.field}: {first.message}"
    if len(items) > 1:
        summary += f" (+{len(items) - 1} more)"
    return build_error(422, "validation_error", summary, _rid(request), errors=items)


def unhandled_error_response(request_id: str | None) -> JSONResponse:
    return build_error(500, "internal_error", "Internal server error", request_id)


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
