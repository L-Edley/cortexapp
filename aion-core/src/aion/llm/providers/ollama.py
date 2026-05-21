import os
import logging
import httpx
from aion.llm.providers import safe_log_error

logger = logging.getLogger("aion.llm.ollama")

BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")


async def is_available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{BASE_URL}/api/tags")
            return r.status_code == 200
    except Exception:
        return False


async def complete(messages: list, tools: list = None) -> str:
    if not await is_available():
        raise RuntimeError("Ollama not available at " + BASE_URL)

    async with httpx.AsyncClient(timeout=60.0) as client:
        payload = {"model": MODEL, "messages": messages, "stream": False}
        try:
            r = await client.post(f"{BASE_URL}/api/chat", json=payload)
            r.raise_for_status()
            data = r.json()
            return data["message"]["content"]
        except Exception as e:
            safe_log_error(logger, "ollama", e, messages)
            raise
