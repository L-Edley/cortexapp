import re
import logging
from typing import Optional

logger = logging.getLogger("aion.llm.providers")

_API_KEY_PATTERNS = [
    re.compile(r'(sk-[A-Za-z0-9]{10,})'),
    re.compile(r'(AIza[A-Za-z0-9_-]{10,})'),
]


def mask_api_key(text: str) -> str:
    for pattern in _API_KEY_PATTERNS:
        text = pattern.sub(lambda m: m.group(1)[:3] + "..." + m.group(1)[-4:], text)
    return text


def safe_log_error(logger_obj: logging.Logger, provider_name: str, error: Exception, messages: Optional[list] = None):
    msg_count = len(messages) if messages else 0
    safe_err = mask_api_key(str(error))
    logger_obj.warning(
        "Provider '%s' failed after %d messages: %s",
        provider_name, msg_count, safe_err,
    )
