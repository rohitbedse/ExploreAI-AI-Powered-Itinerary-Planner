"""Intent extraction: LLM provider chain -> validate -> (one repair) -> rule-based fallback.

``extract`` never raises for provider/model problems: the worst case is a ``source="fallback"``
result. Prompts and keys are never logged.
"""

import logging
from collections.abc import Sequence
from typing import Literal

import httpx
from pydantic import ValidationError

from app.config import Settings
from app.schemas.intent import IntentResult, RawIntent, finalize_intent
from app.services.llm.base import JsonProvider, ProviderError
from app.services.llm.fallback import parse_intent_rules
from app.services.llm.gemini import GeminiProvider
from app.services.llm.prompt import REPAIR_TEMPLATE, SYSTEM_PROMPT, USER_TEMPLATE

logger = logging.getLogger(__name__)


def build_providers(settings: Settings, client: httpx.AsyncClient) -> list[JsonProvider]:
    """Providers named in LLM_PROVIDER_CHAIN that are implemented *and* have credentials."""
    out: list[JsonProvider] = []
    for name in settings.llm_provider_names:
        if name == "gemini" and settings.gemini_api_key is not None:
            out.append(
                GeminiProvider(
                    settings.gemini_api_key,
                    settings.gemini_model,
                    client=client,
                    timeout_s=settings.llm_timeout_seconds,
                    max_retries=settings.llm_max_retries,
                )
            )
        elif name != "gemini":
            logger.info("llm provider not implemented, skipped", extra={"provider": name})
    return out


def _problems(exc: ValidationError) -> str:
    # Field paths and error types only: never echo model output back into the next prompt.
    return "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['type']}" for e in exc.errors()[:5])


class IntentExtractor:
    def __init__(self, providers: Sequence[JsonProvider]) -> None:
        self._providers = list(providers)

    async def extract(
        self, prompt: str, *, has_device_location: bool = False, city: str | None = None
    ) -> IntentResult:
        def done(
            raw: RawIntent, source: Literal["llm", "fallback"], provider: str | None
        ) -> IntentResult:
            intent = finalize_intent(raw, has_device_location=has_device_location, city=city)
            return IntentResult(intent=intent, source=source, provider=provider)

        user = USER_TEMPLATE.format(prompt=prompt)
        for provider in self._providers:
            raw = await self._ask(provider, user)
            if raw is not None:
                return done(raw, "llm", provider.name)

        logger.info("intent fallback used", extra={"providers_tried": len(self._providers)})
        return done(parse_intent_rules(prompt), "fallback", None)

    async def _ask(self, provider: JsonProvider, user: str) -> RawIntent | None:
        problems = ""
        for attempt in range(2):  # first try + one repair
            try:
                data = await provider.complete_json(
                    SYSTEM_PROMPT,
                    user + (REPAIR_TEMPLATE.format(problems=problems) if problems else ""),
                )
                if not data.keys() & RawIntent.model_fields.keys():
                    problems = "no recognised fields"  # e.g. {} or an injected foreign object
                    continue
                return RawIntent.model_validate(data)
            except ValidationError as exc:
                problems = _problems(exc)
                logger.warning(
                    "llm output failed validation",
                    extra={"provider": provider.name, "attempt": attempt + 1, "problems": problems},
                )
            except ProviderError as exc:
                # Retryable errors were already retried inside the provider. A malformed body
                # may succeed on a repair attempt; anything else moves to the next provider.
                if exc.reason in ("malformed response", "response is not a JSON object"):
                    problems = exc.reason
                    continue
                return None
        return None
