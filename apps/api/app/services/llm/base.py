"""Provider boundary: a provider turns (system, user) text into one parsed JSON object."""

from typing import Any, Protocol


class ProviderError(Exception):
    """Sanitised provider failure. Never carries prompts, keys, or response bodies."""

    def __init__(self, reason: str, *, retryable: bool) -> None:
        super().__init__(reason)
        self.reason = reason
        self.retryable = retryable


class JsonProvider(Protocol):
    name: str

    async def complete_json(
        self, system: str, user: str, schema: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Return the model's JSON object, or raise ProviderError (already retried).

        ``schema`` is a provider-native response schema; None = the intent schema.
        """
        ...
