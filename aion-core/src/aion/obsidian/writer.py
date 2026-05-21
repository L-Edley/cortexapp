import os
import re
import json
import logging
import datetime
import asyncio
from typing import Dict, Any, Optional, List

logger = logging.getLogger("aion.obsidian.writer")

# Padrões para remoção de conteúdo malicioso
_SCRIPT_PATTERN = re.compile(r"<script\b[^<]*(?:(?!</script>)<[^<]*)*</script\s*>", re.IGNORECASE | re.DOTALL)
_EVENT_HANDLER_PATTERN = re.compile(r"\s+on\w+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]*)", re.IGNORECASE)
_JS_PROTOCOL_PATTERN = re.compile(r"\b(javascript|data)\s*:", re.IGNORECASE)


def _sanitize_content(content: str) -> str:
    content = _SCRIPT_PATTERN.sub("", content)
    content = _EVENT_HANDLER_PATTERN.sub("", content)
    content = _JS_PROTOCOL_PATTERN.sub("blocked:", content)
    return content


def _sanitize_app_id(app_id: str) -> str:
    safe = "".join(c for c in app_id if c.isalnum() or c in ("-", "_")).strip()
    if not safe:
        raise ValueError(f"Invalid app_id after sanitization: '{app_id}'")
    return safe


def _resolve_safe_path(vault: str, app_id: str, *parts: str) -> str:
    safe_id = _sanitize_app_id(app_id)
    vault_real = os.path.realpath(vault)
    target = os.path.realpath(os.path.join(vault_real, safe_id, *parts))
    if not target.startswith(vault_real + os.sep) and target != vault_real:
        raise ValueError(
            f"Path traversal blocked: '{target}' is outside vault '{vault_real}'"
        )
    return target


def _get_vault_path() -> Optional[str]:
    return os.environ.get("OBSIDIAN_VAULT_PATH")


async def _ensure_dir(path: str) -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, os.makedirs, path, 0o755, True)


async def _write_file(path: str, content: str) -> None:
    await _ensure_dir(os.path.dirname(path))
    loop = asyncio.get_running_loop()

    def _write():
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    await loop.run_in_executor(None, _write)


async def _append_file(path: str, content: str) -> None:
    await _ensure_dir(os.path.dirname(path))
    loop = asyncio.get_running_loop()

    def _append():
        with open(path, "a", encoding="utf-8") as f:
            f.write(content)

    await loop.run_in_executor(None, _append)


def _build_frontmatter(
    id_str: str,
    type_str: str,
    app_id: str,
    created_at: str,
    confidence: Optional[float] = None,
    tags: Optional[List[str]] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> str:
    lines = ["---"]
    lines.append(f"id: {id_str}")
    lines.append(f"type: {type_str}")
    lines.append(f"tenant: {app_id}")
    if confidence is not None:
        lines.append(f"confidence: {confidence}")
    lines.append(f"created_at: {created_at}")
    if tags:
        tags_str = ", ".join(tags)
        lines.append(f"tags: [{tags_str}]")
    if extra:
        for k, v in extra.items():
            lines.append(f"{k}: {v}")
    lines.append("---")
    return "\n".join(lines)


def _generate_title(content: str, max_len: int = 60) -> str:
    first_line = content.split("\n")[0].strip()
    if len(first_line) > max_len:
        return first_line[:max_len].rstrip() + "..."
    return first_line


def _now() -> datetime.datetime:
    return datetime.datetime.utcnow()


def _month_path(dt: datetime.datetime) -> str:
    return dt.strftime("%Y-%m")


def _file_timestamp(dt: datetime.datetime) -> str:
    return dt.strftime("%Y-%m-%d-%H-%M")


def _daily_filename(dt: datetime.datetime) -> str:
    return dt.strftime("%Y-%m-%d")


def _id_from_dt(prefix: str, dt: datetime.datetime) -> str:
    return f"{prefix}_{dt.strftime('%Y%m%dT%H%M%S')}"


async def write_memory(app_id: str, content: str, metadata: Optional[Dict[str, Any]] = None) -> Optional[str]:
    vault = _get_vault_path()
    if not vault:
        logger.warning("Obsidian vault path not configured — skipping memory write")
        return None
    dt = _now()
    month = _month_path(dt)
    fname = _file_timestamp(dt)
    safe_content = _sanitize_content(content)
    rel_dir = _resolve_safe_path(vault, app_id, "memory", month)
    rel_path = os.path.join(rel_dir, f"{fname}.md")
    mem_id = _id_from_dt("mem", dt)
    title = _generate_title(safe_content)
    extra = None
    if metadata:
        extra = {"metadata": json.dumps(metadata, ensure_ascii=False)}
    safe_id = _sanitize_app_id(app_id)
    front = _build_frontmatter(mem_id, "memory", safe_id, dt.isoformat(), extra=extra)
    body = f"\n\n# {title}\n\n{safe_content}\n"
    await _write_file(rel_path, front + body)
    logger.info("Memory written to %s", rel_path)
    return rel_path


async def write_knowledge(app_id: str, content: str, tags: List[str], confidence: float = 1.0) -> Optional[str]:
    vault = _get_vault_path()
    if not vault:
        logger.warning("Obsidian vault path not configured — skipping knowledge write")
        return None
    dt = _now()
    month = _month_path(dt)
    fname = _file_timestamp(dt)
    safe_content = _sanitize_content(content)
    rel_dir = _resolve_safe_path(vault, app_id, "knowledge", month)
    rel_path = os.path.join(rel_dir, f"{fname}.md")
    know_id = _id_from_dt("know", dt)
    title = _generate_title(safe_content)
    safe_id = _sanitize_app_id(app_id)
    front = _build_frontmatter(know_id, "knowledge", safe_id, dt.isoformat(), confidence=confidence, tags=tags)
    body = f"\n\n# {title}\n\n{safe_content}\n"
    await _write_file(rel_path, front + body)
    logger.info("Knowledge written to %s", rel_path)
    return rel_path


async def write_decision(app_id: str, content: str, reasoning: str) -> Optional[str]:
    vault = _get_vault_path()
    if not vault:
        logger.warning("Obsidian vault path not configured — skipping decision write")
        return None
    dt = _now()
    month = _month_path(dt)
    fname = _file_timestamp(dt)
    safe_content = _sanitize_content(content)
    safe_reasoning = _sanitize_content(reasoning)
    rel_dir = _resolve_safe_path(vault, app_id, "decisions", month)
    rel_path = os.path.join(rel_dir, f"{fname}.md")
    dec_id = _id_from_dt("dec", dt)
    title = _generate_title(safe_content)
    safe_id = _sanitize_app_id(app_id)
    front = _build_frontmatter(dec_id, "decision", safe_id, dt.isoformat())
    body = f"\n\n# {title}\n\n{safe_content}\n\n## Reasoning\n\n{safe_reasoning}\n"
    await _write_file(rel_path, front + body)
    logger.info("Decision written to %s", rel_path)
    return rel_path


async def write_action_log(app_id: str, action: Dict[str, Any], result: Dict[str, Any]) -> Optional[str]:
    vault = _get_vault_path()
    if not vault:
        logger.warning("Obsidian vault path not configured — skipping action log write")
        return None
    dt = _now()
    fname = _daily_filename(dt)
    safe_id = _sanitize_app_id(app_id)
    rel_dir = _resolve_safe_path(vault, app_id, "actions")
    rel_path = os.path.join(rel_dir, f"{fname}.md")
    act_id = _id_from_dt("act", dt)
    front = _build_frontmatter(act_id, "action", safe_id, dt.isoformat())
    action_str = json.dumps(action, ensure_ascii=False, indent=2)
    result_str = json.dumps(result, ensure_ascii=False, indent=2)
    entry = f"{front}\n\n## Action\n\n```json\n{action_str}\n```\n\n## Result\n\n```json\n{result_str}\n```\n\n---\n"
    await _append_file(rel_path, entry)
    logger.info("Action log appended to %s", rel_path)
    return rel_path


async def write_study_report(app_id: str, report) -> Optional[str]:
    """Grava um relatório de estudo no Obsidian vault."""
    vault = _get_vault_path()
    if not vault:
        logger.warning("Obsidian vault path not configured — skipping study report write")
        return None
    dt = _now()
    month = _month_path(dt)
    fname = _file_timestamp(dt)
    rel_dir = _resolve_safe_path(vault, app_id, "study", month)
    rel_path = os.path.join(rel_dir, f"{fname}.md")
    study_id = _id_from_dt("study", dt)
    safe_id = _sanitize_app_id(app_id)
    front = _build_frontmatter(
        study_id, "study_report", safe_id, dt.isoformat(),
        extra={
            "mode": report.mode,
            "topics_count": len(report.topics_studied),
            "knowledge_saved": report.knowledge_saved,
        },
    )
    body_parts = [f"\n\n# Relatório de Estudo ({report.mode})\n"]
    body_parts.append(f"\n{report.summary}\n")
    if report.topics_studied:
        body_parts.append("\n## Tópicos Estudados\n")
        for t in report.topics_studied:
            body_parts.append(f"- {_sanitize_content(t)}")
    if report.warnings:
        body_parts.append("\n\n## Avisos\n")
        for w in report.warnings:
            body_parts.append(f"- {_sanitize_content(w)}")
    body_parts.append(f"\n\n---\nDuração: {report.duration_seconds:.1f}s | Salvos: {report.knowledge_saved} | Pulados: {report.skipped}\n")
    body = "\n".join(body_parts)
    await _write_file(rel_path, front + body)
    logger.info("Study report written to %s", rel_path)
    return rel_path


async def write_desktop_study_report(app_id: str, report) -> Optional[str]:
    """Grava um relatório de estudo desktop no Obsidian vault."""
    vault = _get_vault_path()
    if not vault:
        logger.warning("Obsidian vault path not configured — skipping desktop study report write")
        return None
    dt = _now()
    month = _month_path(dt)
    fname = _file_timestamp(dt)
    try:
        rel_dir = _resolve_safe_path(vault, app_id, "study", "desktop", month)
    except Exception as e:
        logger.error("Error resolving safe path for desktop study report: %s", e)
        return None
    rel_path = os.path.join(rel_dir, f"{fname}.md")
    safe_id = _sanitize_app_id(app_id)
    front = _build_frontmatter(
        report.id, "desktop_study_report", safe_id, report.created_at,
        confidence=report.confidence,
        tags=["study", "desktop", "aion"]
    )
    body_parts = [
        f"\n\n# Desktop Study Report\n",
        f"**Sessão ID:** `{report.session_id}`",
        f"**Duração:** {report.duration_seconds:.1f}s",
        f"**Fontes Lidas:** {report.sources_read}",
        f"**Chamadas de IA (Teacher):** {report.teacher_calls}",
        f"**Gaps/Knowledge Salvos:** {report.knowledge_saved}",
        f"**Confiança Média:** {report.confidence:.2f}\n",
        f"\n## Tópicos Estudados\n"
    ]
    for t in report.topics:
        body_parts.append(f"- {_sanitize_content(t)}")
    if report.conclusions:
        body_parts.append("\n## Conclusões Acadêmicas e Descobertas\n")
        for c in report.conclusions:
            body_parts.append(f"- {_sanitize_content(c)}")
    if report.warnings:
        body_parts.append("\n## Avisos / Anomalias da Sessão\n")
        for w in report.warnings:
            body_parts.append(f"- `{_sanitize_content(w)}`")
    body = "\n".join(body_parts)
    await _write_file(rel_path, front + body)
    logger.info("Desktop study report written to %s", rel_path)
    return rel_path


async def write_teacher_lesson(app_id: str, answer: Any) -> Optional[str]:
    """Grava uma lição de professor no Obsidian vault."""
    vault = _get_vault_path()
    if not vault:
        logger.warning("Obsidian vault path not configured — skipping teacher lesson write")
        return None
    dt = _now()
    month = _month_path(dt)
    fname = _file_timestamp(dt)
    
    rel_dir = _resolve_safe_path(vault, app_id, "teachers", month)
    rel_path = os.path.join(rel_dir, f"{fname}.md")
    
    safe_id = _sanitize_app_id(app_id)
    
    ans_id = getattr(answer, "id", "teacher_unknown")
    provider = getattr(answer, "provider", "unknown")
    confidence = getattr(answer, "confidence", 1.0)
    created_at = getattr(answer, "created_at", dt.isoformat())
    tags = getattr(answer, "tags", [])
    if not tags:
        tags = ["teacher", provider, "study"]
        
    front = _build_frontmatter(
        id_str=ans_id,
        type_str="teacher_lesson",
        app_id=safe_id,
        created_at=created_at,
        confidence=confidence,
        tags=tags,
        extra={"provider": provider}
    )
    
    question = getattr(answer, "question", "")
    summary = getattr(answer, "summary", "")
    full_answer = getattr(answer, "answer", "")
    
    s_question = _sanitize_content(question)
    s_summary = _sanitize_content(summary)
    s_answer = _sanitize_content(full_answer)
    
    body = (
        f"\n\n# {s_question}\n\n"
        f"## Pergunta\n\n{s_question}\n\n"
        f"## Resumo\n\n{s_summary}\n\n"
        f"## Conclusões\n\n{s_summary}\n\n"
        f"## Resposta completa\n\n{s_answer}\n"
    )
    
    await _write_file(rel_path, front + body)
    logger.info("Teacher lesson written to %s", rel_path)
    return rel_path


async def write_dev_lesson(app_id: str, lesson: Any) -> Optional[str]:
    """Grava uma lição técnica do Dev Mode no Obsidian vault."""
    vault = _get_vault_path()
    if not vault:
        logger.warning("Obsidian vault path not configured — skipping dev lesson write")
        return None
    dt = _now()
    month = _month_path(dt)
    fname = _file_timestamp(dt)
    
    try:
        rel_dir = _resolve_safe_path(vault, app_id, "dev", month)
    except Exception as e:
        logger.error("Error resolving safe path for dev lesson: %s", e)
        return None
        
    rel_path = os.path.join(rel_dir, f"{fname}.md")
    safe_id = _sanitize_app_id(app_id)
    
    lesson_id = f"dev_lesson_{fname}"
    confidence = getattr(lesson, "confidence", 0.90)
    created_at = getattr(lesson, "created_at", dt.isoformat())
    tags = getattr(lesson, "tags", [])
    if not tags:
        tags = ["dev", "lesson", "aion"]
        
    front = _build_frontmatter(
        id_str=lesson_id,
        type_str="dev_lesson",
        app_id=safe_id,
        created_at=created_at,
        confidence=confidence,
        tags=tags,
        extra={"source": "dev_mode"}
    )
    
    title = getattr(lesson, "title", "Lição Técnica")
    summary = getattr(lesson, "summary", "")
    content = getattr(lesson, "content", "")
    
    s_title = _sanitize_content(title)
    s_summary = _sanitize_content(summary)
    s_content = _sanitize_content(content)
    
    body = (
        f"\n\n# {s_title}\n\n"
        f"## Resumo Técnico\n\n{s_summary}\n\n"
        f"## Conteúdo e Descobertas\n\n{s_content}\n"
    )
    
    await _write_file(rel_path, front + body)
    logger.info("Dev lesson written to %s", rel_path)
    return rel_path




