"""Structured logging with a per-request correlation id (stdlib only)."""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from app.config import Settings

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# Attributes every LogRecord has; anything else was passed via `extra=` and is emitted.
_RESERVED = set(vars(logging.makeLogRecord({}))) | {"message", "asctime", "request_id"}


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def _extras(record: logging.LogRecord) -> dict[str, Any]:
    return {k: v for k, v in vars(record).items() if k not in _RESERVED}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
            **_extras(record),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class ConsoleFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        rid = getattr(record, "request_id", None) or "-"
        base = f"{self.formatTime(record, '%H:%M:%S')} {record.levelname:<7} [{rid}] "
        base += f"{record.name}: {record.getMessage()}"
        extras = " ".join(f"{k}={v}" for k, v in _extras(record).items())
        out = f"{base} {extras}".rstrip()
        if record.exc_info:
            out += "\n" + self.formatException(record.exc_info)
        return out


class _AppHandler(logging.StreamHandler):  # type: ignore[type-arg]
    """Marker subclass so configure_logging can replace only its own handler."""


def configure_logging(settings: Settings) -> None:
    """Idempotent: replaces the handler it installed earlier, leaves foreign handlers alone."""
    root = logging.getLogger()
    for h in list(root.handlers):
        if isinstance(h, _AppHandler):
            root.removeHandler(h)
    handler = _AppHandler(sys.stderr)
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(
        JsonFormatter() if settings.effective_log_format == "json" else ConsoleFormatter()
    )
    root.addHandler(handler)
    root.setLevel(settings.log_level)
    # uvicorn's own access log would duplicate our request log line.
    logging.getLogger("uvicorn.access").disabled = True
