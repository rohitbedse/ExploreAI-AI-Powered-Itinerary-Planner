"""Shared outbound-HTTP helper for the data providers (Photon, Overpass, OSRM).

Bounded retries with exponential backoff on transient failures only. Errors are sanitised: they
never carry URLs, query text, response bodies or provider messages (those go to the log at most
as a status code).
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BACKOFF_BASE_S = 0.5
_BACKOFF_MAX_S = 4.0

Sleep = Callable[[float], Awaitable[None]]


class UpstreamError(Exception):
    """A data provider failed (timeout, rate limit, 5xx, malformed body)."""

    def __init__(self, provider: str, reason: str, *, retryable: bool = False) -> None:
        super().__init__(f"{provider}: {reason}")
        self.provider = provider
        self.reason = reason
        self.retryable = retryable


async def fetch_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    provider: str,
    timeout_s: float,
    max_retries: int,
    params: dict[str, str] | None = None,
    data: dict[str, str] | None = None,
    sleep: Sleep | None = None,
) -> Any:
    last: UpstreamError | None = None
    for attempt in range(max_retries + 1):
        if attempt:
            await (sleep or asyncio.sleep)(
                min(_BACKOFF_BASE_S * 2 ** (attempt - 1), _BACKOFF_MAX_S)
            )
        started = time.monotonic()
        try:
            return await _once(client, method, url, provider, timeout_s, params, data)
        except UpstreamError as exc:
            last = exc
            logger.warning(
                "data provider call failed",
                extra={
                    "provider": provider,
                    "attempt": attempt + 1,
                    "reason": exc.reason,
                    "elapsed_ms": int((time.monotonic() - started) * 1000),
                },
            )
            if not exc.retryable:
                break
    assert last is not None
    raise last


async def _once(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    provider: str,
    timeout_s: float,
    params: dict[str, str] | None,
    data: dict[str, str] | None,
) -> Any:
    try:
        resp = await client.request(method, url, params=params, data=data, timeout=timeout_s)
    except httpx.TimeoutException:
        raise UpstreamError(provider, "timeout", retryable=True) from None
    except httpx.HTTPError:
        raise UpstreamError(provider, "network error", retryable=True) from None
    status = resp.status_code
    if status in (429, 502, 503, 504) or status >= 500:
        raise UpstreamError(provider, f"http {status}", retryable=True)
    if status != 200:
        raise UpstreamError(provider, f"http {status}")
    try:
        return resp.json()
    except ValueError:
        raise UpstreamError(provider, "malformed response") from None
