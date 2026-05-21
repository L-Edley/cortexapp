import asyncio
import re
import datetime
import logging
from typing import List, Dict, Any, Optional
from supabase import create_client, Client

logger = logging.getLogger("aion.memory.supabase_store")

_SANITIZE_RE = re.compile(r"[^\w\-]")

def _sanitize_app_id(app_id: str) -> str:
    safe = _SANITIZE_RE.sub("", app_id.replace(" ", "_"))
    if not safe:
        raise ValueError(f"Invalid app_id after sanitization: '{app_id}'")
    return safe

def _truncate_id(raw: str, max_len: int = 255) -> str:
    return raw[:max_len]

class SupabaseStore:
    def __init__(self, app_id: str, supabase_url: str, supabase_key: str):
        try:
            self.app_id = _sanitize_app_id(app_id)
        except ValueError:
            logger.error("Invalid app_id '%s' for SupabaseStore", app_id)
            self.app_id = "unknown"
        try:
            self.client: Client = create_client(supabase_url, supabase_key)
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client for {app_id}: {e}")
            self.client = None

    # ── helpers ──────────────────────────────────────────────────────

    def _is_disabled(self) -> bool:
        return self.client is None

    def _safe_log(self, table: str, record_id: str, action: str = "sync") -> None:
        safe_id = _truncate_id(record_id)
        logger.debug("%s %s to %s for tenant %s", action, safe_id, table, self.app_id)

    # ── existing: memory / knowledge / decision ──────────────────────

    async def sync_memory(self, memory_id: str, content: str, type: str, metadata: Optional[Dict[str, Any]], confidence: float = 1.0) -> None:
        if self._is_disabled():
            return
        data = {
            "id": _truncate_id(memory_id),
            "app_id": self.app_id,
            "content": content,
            "type": type,
            "metadata": metadata or {},
            "confidence": confidence
        }
        def _execute():
            self.client.table("aion_memories").upsert(data).execute()
        try:
            await asyncio.to_thread(_execute)
            self._safe_log("aion_memories", memory_id)
        except Exception as e:
            logger.warning("Failed to sync memory %s: %s", _truncate_id(memory_id), e)

    async def sync_knowledge(self, knowledge_id: str, content: str, tags: List[str], confidence: float = 1.0, expires_at: Optional[str] = None) -> None:
        if self._is_disabled():
            return
        data = {
            "id": _truncate_id(knowledge_id),
            "app_id": self.app_id,
            "content": content,
            "tags": tags or [],
            "confidence": confidence,
            "expires_at": expires_at
        }
        def _execute():
            self.client.table("aion_knowledge").upsert(data).execute()
        try:
            await asyncio.to_thread(_execute)
            self._safe_log("aion_knowledge", knowledge_id)
        except Exception as e:
            logger.warning("Failed to sync knowledge %s: %s", _truncate_id(knowledge_id), e)

    async def sync_decision(self, decision_id: str, content: str, reasoning: str) -> None:
        if self._is_disabled():
            return
        data = {
            "id": _truncate_id(decision_id),
            "app_id": self.app_id,
            "content": content,
            "reasoning": reasoning
        }
        def _execute():
            self.client.table("aion_decisions").upsert(data).execute()
        try:
            await asyncio.to_thread(_execute)
            self._safe_log("aion_decisions", decision_id)
        except Exception as e:
            logger.warning("Failed to sync decision %s: %s", _truncate_id(decision_id), e)

    # ── new: study_report ────────────────────────────────────────────

    async def save_study_report(self, app_id: str, report: dict) -> bool:
        if self._is_disabled():
            return False
        try:
            safe_id = _truncate_id(report.get("id", ""))
            data = {
                "id": safe_id,
                "app_id": _sanitize_app_id(app_id),
                "mode": report.get("mode", ""),
                "topics": report.get("topics_studied", report.get("topics", [])),
                "summary": report.get("summary", ""),
                "conclusions": report.get("conclusions", report.get("warnings", [])),
                "knowledge_saved": report.get("knowledge_saved", 0),
                "warnings": report.get("warnings", []),
                "confidence": report.get("confidence", 0.0),
                "duration_seconds": report.get("duration_seconds", 0.0),
                "created_at": report.get("created_at", datetime.datetime.utcnow().isoformat()),
            }
            def _execute():
                self.client.table("study_reports").upsert(data).execute()
            await asyncio.to_thread(_execute)
            self._safe_log("study_reports", safe_id)
            return True
        except Exception as e:
            logger.warning("Failed to save study report: %s", e)
            return False

    async def save_desktop_study_report(self, app_id: str, report: dict) -> bool:
        if self._is_disabled():
            return False
        try:
            safe_id = _truncate_id(report.get("id", ""))
            data = {
                "id": safe_id,
                "app_id": _sanitize_app_id(app_id),
                "session_id": report.get("session_id", ""),
                "topics": report.get("topics", []),
                "sources_read": report.get("sources_read", 0),
                "teacher_calls": report.get("teacher_calls", 0),
                "knowledge_saved": report.get("knowledge_saved", 0),
                "conclusions": report.get("conclusions", []),
                "confidence": report.get("confidence", 0.0),
                "pending_sync_count": report.get("pending_sync_count", 0),
                "warnings": report.get("warnings", []),
                "duration_seconds": report.get("duration_seconds", 0.0),
                "created_at": report.get("created_at", datetime.datetime.utcnow().isoformat()),
            }
            def _execute():
                self.client.table("desktop_study_reports").upsert(data).execute()
            await asyncio.to_thread(_execute)
            self._safe_log("desktop_study_reports", safe_id)
            return True
        except Exception as e:
            logger.warning("Failed to save desktop study report: %s", e)
            return False

    async def save_teacher_lesson(self, app_id: str, lesson: dict) -> bool:
        if self._is_disabled():
            return False
        try:
            safe_id = _truncate_id(lesson.get("id", ""))
            answer = lesson.get("answer", "")
            safe_answer = _sanitize_sensitive(answer)
            data = {
                "id": safe_id,
                "app_id": _sanitize_app_id(app_id),
                "provider": lesson.get("provider", ""),
                "question": lesson.get("question", ""),
                "summary": lesson.get("summary", ""),
                "answer": safe_answer,
                "sources": lesson.get("sources", []),
                "confidence": lesson.get("confidence", 0.0),
                "tags": lesson.get("tags", []),
                "should_save": lesson.get("should_save", True),
                "created_at": lesson.get("created_at", datetime.datetime.utcnow().isoformat()),
            }
            def _execute():
                self.client.table("teacher_lessons").upsert(data).execute()
            await asyncio.to_thread(_execute)
            self._safe_log("teacher_lessons", safe_id)
            return True
        except Exception as e:
            logger.warning("Failed to save teacher lesson: %s", e)
            return False

    async def save_dev_lesson(self, app_id: str, lesson: dict) -> bool:
        if self._is_disabled():
            return False
        try:
            safe_id = _truncate_id(lesson.get("id", ""))
            content = lesson.get("content", "")
            if _contains_sensitive(content + lesson.get("title", "") + lesson.get("summary", "")):
                logger.warning("Sensitive data detected in dev lesson %s — skipping Supabase save", safe_id)
                return False
            data = {
                "id": safe_id,
                "app_id": _sanitize_app_id(app_id),
                "title": lesson.get("title", ""),
                "summary": lesson.get("summary", ""),
                "content": content,
                "tags": lesson.get("tags", []),
                "confidence": lesson.get("confidence", 0.0),
                "source": lesson.get("source", "dev_mode"),
                "created_at": lesson.get("created_at", datetime.datetime.utcnow().isoformat()),
            }
            def _execute():
                self.client.table("dev_lessons").upsert(data).execute()
            await asyncio.to_thread(_execute)
            self._safe_log("dev_lessons", safe_id)
            return True
        except Exception as e:
            logger.warning("Failed to save dev lesson: %s", e)
            return False

    async def save_sync_log(self, app_id: str, log: dict) -> bool:
        if self._is_disabled():
            return False
        try:
            safe_id = _truncate_id(log.get("id", ""))
            data = {
                "id": safe_id,
                "app_id": _sanitize_app_id(app_id),
                "record_type": log.get("record_type", ""),
                "record_id": _truncate_id(log.get("record_id", "")),
                "status": log.get("status", "pending"),
                "attempts": log.get("attempts", 0),
                "last_error": _truncate_id(log.get("last_error", ""), 500),
                "created_at": log.get("created_at", datetime.datetime.utcnow().isoformat()),
                "synced_at": log.get("synced_at", datetime.datetime.utcnow().isoformat()),
            }
            def _execute():
                self.client.table("sync_log").upsert(data).execute()
            await asyncio.to_thread(_execute)
            self._safe_log("sync_log", safe_id)
            return True
        except Exception as e:
            logger.warning("Failed to save sync log: %s", e)
            return False

    # ── existing: search + pull ──────────────────────────────────────

    async def search_semantic(self, app_id: str, embedding: List[float], table: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Executes a semantic search using an RPC function in Supabase.
        """
        if self._is_disabled():
            return []
            
        rpc_name = "match_aion_memories" if table == "memories" else "match_aion_knowledge"
        
        def _execute():
            return self.client.rpc(
                rpc_name, 
                {
                    "query_embedding": embedding,
                    "match_count": top_k,
                    "filter_app_id": app_id
                }
            ).execute()

        try:
            result = await asyncio.to_thread(_execute)
            return result.data if result and hasattr(result, 'data') else []
        except Exception as e:
            logger.warning("Failed to perform semantic search in Supabase for %s: %s", app_id, e)
            return []

    async def pull_all(self, app_id: str) -> Dict[str, List[Dict[str, Any]]]:
        if self._is_disabled():
            return {"memories": [], "knowledge": [], "decisions": []}
            
        def _execute_memories():
            return self.client.table("aion_memories").select("*").eq("app_id", app_id).execute()
            
        def _execute_knowledge():
            return self.client.table("aion_knowledge").select("*").eq("app_id", app_id).execute()
            
        def _execute_decisions():
            return self.client.table("aion_decisions").select("*").eq("app_id", app_id).execute()

        try:
            memories = await asyncio.to_thread(_execute_memories)
            knowledge = await asyncio.to_thread(_execute_knowledge)
            decisions = await asyncio.to_thread(_execute_decisions)
            
            return {
                "memories": memories.data if hasattr(memories, 'data') else [],
                "knowledge": knowledge.data if hasattr(knowledge, 'data') else [],
                "decisions": decisions.data if hasattr(decisions, 'data') else []
            }
        except Exception as e:
            logger.warning("Failed to pull all records from Supabase for %s: %s", app_id, e)
            return {"memories": [], "knowledge": [], "decisions": []}


# ── standalone helpers (reused from safety_guard / study_mode) ──────

def _sanitize_sensitive(text: str) -> str:
    patterns = [
        (r"(sk-[A-Za-z0-9\-]{10,})", "sk-..."),
        (r"(AIza[A-Za-z0-9_-]{10,})", "AIza..."),
        (r"(\b\d{3}\.\d{3}\.\d{3}-\d{2}\b)", "***.***.***-**"),
        (r"(-----BEGIN\s+.*PRIVATE\s+KEY-----)", "[REDACTED]"),
    ]
    for pat, repl in patterns:
        text = re.sub(pat, repl, text, flags=re.IGNORECASE)
    return text


def _contains_sensitive(text: str) -> bool:
    text_lower = text.lower()
    checks = [
        r"bearer\s+[a-za-z0-9\-\._~\+\/]+=*",
        r"secret[_-]?key\s*[:=]\s*['\"][^'\"]+['\"]",
        r"password\s*[:=]\s*['\"][^'\"]+['\"]",
        r"api[_-]?key\s*[:=]\s*['\"][^'\"]+['\"]",
        r"-----begin\s+.*private\s+key-----",
    ]
    for pat in checks:
        if re.search(pat, text_lower):
            return True
    return False
