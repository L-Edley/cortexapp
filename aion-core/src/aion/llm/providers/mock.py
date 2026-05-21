import logging
from datetime import datetime

logger = logging.getLogger("aion.llm.mock")


async def is_available() -> bool:
    return True


async def complete(messages: list, tools: list = None) -> str:
    last_msg = messages[-1]["content"] if messages else ""
    logger.info("Mock provider returning simulated response")
    return (
        f"[Mock Response]\n\n"
        f"Recebi sua mensagem: \"{last_msg[:100]}\"\n\n"
        f"Esta é uma resposta simulada do provider Mock. "
        f"Timestamp: {datetime.utcnow().isoformat()}"
    )
