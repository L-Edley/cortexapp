import os
import re
import logging
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

logger = logging.getLogger("aion.obsidian.reader")

IGNORED_DIRS = {"actions"}


class VaultRecord(BaseModel):
    id: str
    type: str
    tenant: str
    content: str
    confidence: Optional[float] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None
    reasoning: Optional[str] = None
    created_at: Optional[str] = None
    file_path: str


def _get_vault_path() -> Optional[str]:
    return os.environ.get("OBSIDIAN_VAULT_PATH")


def parse_frontmatter(file_path: str) -> Optional[Dict[str, Any]]:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            raw = f.read()
    except Exception as e:
        logger.warning("Failed to read %s: %s", file_path, e)
        return None

    if not raw.startswith("---"):
        return None

    parts = raw.split("---", 2)
    if len(parts) < 3:
        return None

    import yaml
    try:
        front = yaml.safe_load(parts[1])
    except Exception as e:
        logger.warning("Invalid YAML frontmatter in %s: %s", file_path, e)
        return None

    if not isinstance(front, dict):
        return None

    body = parts[2].strip()
    return {"frontmatter": front, "body": body}


def _extract_content(type_str: str, body: str) -> tuple[str, Optional[str]]:
    text = body.strip()
    text = re.sub(r"^#\s+.*\n?", "", text, count=1).strip()
    if type_str == "decision":
        m = re.split(r"##\s+Reasoning\s*", text, maxsplit=1, flags=re.IGNORECASE)
        if len(m) == 2:
            return m[0].strip(), m[1].strip()
    return text, None


def read_all(app_id: str) -> List[VaultRecord]:
    return _scan_vault(app_id)


def read_by_type(app_id: str, record_type: str) -> List[VaultRecord]:
    results = _scan_vault(app_id, record_type)
    return results


def _walk_vault(base: str) -> List[str]:
    files = []
    for root, dirs, fnames in os.walk(base):
        rel = os.path.relpath(root, base)
        parts = rel.split(os.sep) if rel != "." else []
        if parts and parts[0] in IGNORED_DIRS:
            continue
        for fname in fnames:
            if fname.endswith(".md"):
                files.append(os.path.join(root, fname))
    return files


def _scan_vault(app_id: str, record_type: Optional[str] = None) -> List[VaultRecord]:
    vault = _get_vault_path()
    if not vault:
        logger.warning("Obsidian vault path not configured — cannot read")
        return []

    tenant_dir = os.path.join(vault, app_id)
    if not os.path.isdir(tenant_dir):
        logger.info("No vault directory for tenant '%s'", app_id)
        return []

    records: List[VaultRecord] = []
    for file_path in _walk_vault(tenant_dir):
        parsed = parse_frontmatter(file_path)
        if parsed is None:
            continue

        front = parsed["frontmatter"]
        body = parsed["body"]

        record_id = str(front.get("id", ""))
        rtype = str(front.get("type", ""))
        tenant = str(front.get("tenant", "")) if front.get("tenant") else app_id
        confidence = front.get("confidence")
        tags = front.get("tags")
        metadata = front.get("metadata")
        created_at = str(front["created_at"]) if "created_at" in front else None

        if not record_id or not rtype:
            continue
        if tenant and tenant != app_id:
            continue
        if record_type and rtype != record_type:
            continue

        # skip action logs — not rebuildable as structured records
        if rtype == "action":
            continue

        content, reasoning = _extract_content(rtype, body)

        record = VaultRecord(
            id=record_id,
            type=rtype,
            tenant=tenant or app_id,
            content=content or body.strip(),
            confidence=confidence,
            tags=tags,
            metadata=metadata,
            reasoning=reasoning,
            created_at=created_at,
            file_path=file_path,
        )
        records.append(record)

    return records
