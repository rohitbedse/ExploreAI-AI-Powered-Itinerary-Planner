"""Readiness: is this instance able to serve traffic right now?

Liveness (`/health`) only says the process is up. Readiness runs registered checks.
Today the app has no hard runtime dependencies (no DB/Redis/LLM client is wired in), so the
only built-in check is the lifecycle flag. Later stages register their own checks (e.g. a DB
ping) via `app.state.readiness_checks` instead of touching the router.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from app.schemas.health import ReadinessCheck, ReadinessResponse

log = logging.getLogger(__name__)

CheckFn = Callable[[], Awaitable[None]]
"""Raise to signal failure; return normally for success."""

CHECK_TIMEOUT_SECONDS = 2.0


async def run_check(name: str, fn: CheckFn) -> ReadinessCheck:
    try:
        await asyncio.wait_for(fn(), timeout=CHECK_TIMEOUT_SECONDS)
    except TimeoutError:
        return ReadinessCheck(name=name, ok=False, detail="timed out")
    except Exception as exc:
        log.warning("readiness check failed", extra={"check": name, "error": repr(exc)})
        # Do not leak internals (hosts, credentials) through a public endpoint.
        return ReadinessCheck(name=name, ok=False, detail="check failed")
    return ReadinessCheck(name=name, ok=True)


async def evaluate(accepting_traffic: bool, checks: dict[str, CheckFn]) -> ReadinessResponse:
    results = [
        ReadinessCheck(
            name="lifecycle",
            ok=accepting_traffic,
            detail=None if accepting_traffic else "starting up or shutting down",
        )
    ]
    results += [await run_check(name, fn) for name, fn in checks.items()]
    ok = all(r.ok for r in results)
    return ReadinessResponse(status="ready" if ok else "not_ready", checks=results)
