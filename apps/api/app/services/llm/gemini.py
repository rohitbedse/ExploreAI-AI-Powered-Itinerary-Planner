"""Gemini REST provider (plain httpx, no SDK). JSON-mode with a response schema."""

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from pydantic import SecretStr

from app.services.llm.base import ProviderError
from app.services.llm.prompt import RESPONSE_SCHEMA

logger = logging.getLogger(__name__)

BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_BACKOFF_BASE_S = 0.5
_BACKOFF_MAX_S = 4.0

Sleep = Callable[[float], Awaitable[None]]


class GeminiProvider:
    name = "gemini"

    def __init__(
        self,
        api_key: SecretStr,
        model: str,
        *,
        client: httpx.AsyncClient,
        timeout_s: float,
        max_retries: int,
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        self._key = api_key
        self._model = model
        self._client = client
        self._timeout = timeout_s
        self._max_retries = max_retries
        self._sleep = sleep

    async def complete_json(
        self, system: str, user: str, schema: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": 0,
                "maxOutputTokens": 1024,
                "responseMimeType": "application/json",
                "responseSchema": schema or RESPONSE_SCHEMA,
            },
        }
        last: ProviderError | None = None
        for attempt in range(self._max_retries + 1):
            if attempt:
                await self._sleep(min(_BACKOFF_BASE_S * 2 ** (attempt - 1), _BACKOFF_MAX_S))
            started = time.monotonic()
            try:
                return await self._once(body)
            except ProviderError as exc:
                last = exc
                logger.warning(
                    "llm provider call failed",
                    extra={
                        "provider": self.name,
                        "attempt": attempt + 1,
                        "reason": exc.reason,
                        "elapsed_ms": int((time.monotonic() - started) * 1000),
                    },
                )
                if not exc.retryable:
                    break
        assert last is not None
        raise last

    async def _once(self, body: dict[str, Any]) -> dict[str, Any]:
        # Key goes in a header, never the URL, so request logging cannot leak it.
        try:
            resp = await self._client.post(
                f"{BASE_URL}/models/{self._model}:generateContent",
                json=body,
                headers={"x-goog-api-key": self._key.get_secret_value()},
                timeout=self._timeout,
            )
        except httpx.TimeoutException:
            raise ProviderError("timeout", retryable=True) from None
        except httpx.HTTPError:
            raise ProviderError("network error", retryable=True) from None

        status = resp.status_code
        if status == 429 or status >= 500:
            raise ProviderError(f"http {status}", retryable=True)
        if status != 200:
            raise ProviderError(f"http {status}", retryable=False)

        try:
            payload = resp.json()
            text = payload["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(text)
        except (ValueError, KeyError, IndexError, TypeError):
            # Malformed output is not transient; the extractor decides about a repair attempt.
            raise ProviderError("malformed response", retryable=False) from None
        if not isinstance(parsed, dict):
            raise ProviderError("response is not a JSON object", retryable=False)
        return parsed
