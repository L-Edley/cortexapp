import os
import logging
from openai import AsyncOpenAI
from aion.llm.providers import safe_log_error

logger = logging.getLogger("aion.llm.groq")

BASE_URL = "https://api.groq.com/openai/v1"


async def _api_key() -> str:
    return os.environ.get("GROQ_API_KEY") or ""


async def _model() -> str:
    return os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")


async def is_available() -> bool:
    return bool(os.environ.get("GROQ_API_KEY"))


async def complete(messages: list, tools: list = None) -> str:
    key = await _api_key()
    if not key:
        raise RuntimeError("Groq provider not available: GROQ_API_KEY not set")

    client = AsyncOpenAI(api_key=key, base_url=BASE_URL, timeout=15.0)
    kwargs = {"model": await _model(), "messages": messages}
    if tools:
        kwargs["tools"] = tools

    try:
        response = await client.chat.completions.create(**kwargs)
        return response.choices[0].message.content
    except Exception as e:
        safe_log_error(logger, "groq", e, messages)
        raise
