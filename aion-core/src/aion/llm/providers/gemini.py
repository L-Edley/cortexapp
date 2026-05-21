import os
import logging
import google.generativeai as genai
from aion.llm.providers import safe_log_error

logger = logging.getLogger("aion.llm.gemini")

async def _api_key() -> str:
    return os.environ.get("GEMINI_API_KEY") or ""


async def _model() -> str:
    return os.environ.get("GEMINI_MODEL", "gemini-1.5-flash")


async def is_available() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY"))


async def complete(messages: list, tools: list = None) -> str:
    key = await _api_key()
    if not key:
        raise RuntimeError("Gemini provider not available: GEMINI_API_KEY not set")

    genai.configure(api_key=key)

    system_instruction = None
    contents = []
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if role == "system":
            system_instruction = content
        elif role == "user":
            contents.append({"role": "user", "parts": [content]})
        elif role == "assistant":
            contents.append({"role": "model", "parts": [content]})

    model = genai.GenerativeModel(
        await _model(),
        system_instruction=system_instruction,
    )

    try:
        response = await model.generate_content_async(contents)
        return response.text
    except Exception as e:
        safe_log_error(logger, "gemini", e, messages)
        raise
