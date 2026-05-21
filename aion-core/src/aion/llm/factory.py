import os
import logging
from typing import List, Dict, Any, Callable, Awaitable

logger = logging.getLogger("aion.llm.factory")

PROVIDER_ORDER = ["groq", "gemini", "openai", "ollama", "mock"]


def _get_order() -> List[str]:
    """Respeita AI_PROVIDER do .env: coloca o preferido em primeiro."""
    preferred = os.environ.get("AI_PROVIDER", "").lower().strip()
    if preferred and preferred in PROVIDER_ORDER:
        return [preferred] + [p for p in PROVIDER_ORDER if p != preferred]
    return PROVIDER_ORDER


async def get_llm_provider() -> Callable[[list, list], Awaitable[str]]:
    from aion.llm.providers import groq, gemini, openai_p, ollama, mock

    registry = {
        "groq": groq,
        "gemini": gemini,
        "openai": openai_p,
        "ollama": ollama,
        "mock": mock,
    }

    order = _get_order()
    for name in order:
        mod = registry[name]
        try:
            if hasattr(mod, "is_available"):
                if callable(mod.is_available):
                    available = await mod.is_available()
                else:
                    available = bool(mod.is_available)
            else:
                available = True

            if available:
                logger.info("Selected LLM provider: %s", name)
                return mod.complete
        except Exception:
            continue

    logger.info("No provider available — falling back to mock")
    return mock.complete


async def complete(messages: list, tools: list = None) -> str:
    from aion.llm.providers import groq, gemini, openai_p, ollama, mock

    registry_map = {
        "groq": groq, "gemini": gemini,
        "openai": openai_p, "ollama": ollama, "mock": mock,
    }
    pipeline = [registry_map[name] for name in _get_order()]
    last_error = None

    for mod in pipeline:
        try:
            if hasattr(mod, "is_available"):
                if callable(mod.is_available):
                    available = await mod.is_available()
                else:
                    available = bool(mod.is_available)
                if not available:
                    continue

            logger.info("Calling provider: %s", mod.__name__.rsplit(".", 1)[-1])
            return await mod.complete(messages, tools)
        except Exception as e:
            last_error = e
            logger.warning("Provider %s failed: %s", mod.__name__, e)
            continue

    raise RuntimeError(
        f"All LLM providers failed. Last error: {last_error}"
    )
