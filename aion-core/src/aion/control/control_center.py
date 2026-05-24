import os
import sys
import time
import asyncio
import logging
import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

from aion.config import settings
from aion.memory import sqlite_store, vector_store

logger = logging.getLogger("aion.control")

_start_time = time.time()

# ── Status constants ──
STATUS_OK = "ok"
STATUS_DEGRADED = "degraded"
STATUS_ERROR = "error"
STATUS_UNAVAILABLE = "unavailable"
STATUS_DISABLED = "disabled"
STATUS_CONFIGURED = "configured"
STATUS_MISSING = "missing"
STATUS_ONLINE = "online"
STATUS_OFFLINE = "offline"
STATUS_NOT_CONFIGURED = "not_configured"


# ── Pydantic Models ──

class BrainStatus(BaseModel):
    sqlite: str = STATUS_OK
    chroma: str = STATUS_UNAVAILABLE
    obsidian: str = STATUS_UNAVAILABLE
    supabase: str = STATUS_DISABLED
    memories_count: int = 0
    knowledge_count: int = 0
    decisions_count: int = 0
    total_vectors: int = 0
    last_activity: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class ProviderStatus(BaseModel):
    groq: str = STATUS_MISSING
    gemini: str = STATUS_MISSING
    openai: str = STATUS_MISSING
    ollama: str = STATUS_NOT_CONFIGURED
    mock: str = "available"
    preferred_provider: str = ""
    warnings: List[str] = Field(default_factory=list)


class SyncOverview(BaseModel):
    pending: int = 0
    syncing: int = 0
    synced: int = 0
    failed: int = 0
    last_sync_at: Optional[str] = None
    scheduler_enabled: bool = False
    warnings: List[str] = Field(default_factory=list)


class StudyOverview(BaseModel):
    last_study_report: Optional[Dict[str, Any]] = None
    last_desktop_study_report: Optional[Dict[str, Any]] = None
    active_desktop_sessions: int = 0
    knowledge_saved_total: int = 0
    last_run_at: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class DevOverview(BaseModel):
    last_project_analyzed: Optional[str] = None
    last_dev_lesson: Optional[str] = None
    last_validation: Optional[str] = None
    dev_lessons_count: int = 0
    warnings: List[str] = Field(default_factory=list)


class JobsOverview(BaseModel):
    active_jobs: int = 0
    recent_jobs: List[Dict[str, Any]] = Field(default_factory=list)
    failed_jobs: List[Dict[str, Any]] = Field(default_factory=list)
    rebuild_jobs: int = 0
    study_jobs: int = 0
    desktop_study_sessions: int = 0
    warnings: List[str] = Field(default_factory=list)


class ControlOverview(BaseModel):
    app_id: str
    status: str = STATUS_OK
    version: str = "1.0.0"
    uptime_seconds: float = 0.0
    mode_summary: Dict[str, str] = Field(default_factory=lambda: {
        "chat": "active",
        "study": "available",
        "desktop_study": "available",
        "teacher": "available",
        "developer": "available",
        "sync": "available",
        "rebuild": "available",
        "proactive": "available",
        "voice": "available",
        "briefing": "available",
        "night_research": "available",
        "reteaching": "available",
    })
    brain: BrainStatus = Field(default_factory=BrainStatus)
    providers: ProviderStatus = Field(default_factory=ProviderStatus)
    sync: SyncOverview = Field(default_factory=SyncOverview)
    study: StudyOverview = Field(default_factory=StudyOverview)
    dev: DevOverview = Field(default_factory=DevOverview)
    jobs: JobsOverview = Field(default_factory=JobsOverview)
    warnings: List[str] = Field(default_factory=list)
    generated_at: str = Field(default_factory=lambda: datetime.datetime.utcnow().isoformat())


# ── Diagnostic Functions ──

async def get_brain_status(app_id: str) -> BrainStatus:
    warnings = []
    memories = knowledge = decisions = 0
    last_activity = None
    sqlite_status = STATUS_ERROR
    chroma_status = STATUS_UNAVAILABLE
    obsidian_status = STATUS_UNAVAILABLE
    supabase_status = STATUS_DISABLED
    total_vectors = 0

    try:
        provisioned = await sqlite_store.is_tenant_provisioned(app_id)
        sqlite_status = STATUS_OK if provisioned else STATUS_ERROR
        if not provisioned:
            warnings.append("[brain] Tenant não provisionado no SQLite")
    except Exception as e:
        sqlite_status = STATUS_ERROR
        warnings.append(f"[brain] Falha ao verificar SQLite: {e}")

    if sqlite_status == STATUS_OK:
        try:
            async with sqlite_store.tenant_db_connection(app_id) as conn:
                c = await conn.execute("SELECT COUNT(*) FROM memories WHERE app_id = ?", (app_id,))
                memories = (await c.fetchone())[0]
                c = await conn.execute("SELECT COUNT(*) FROM knowledge WHERE app_id = ?", (app_id,))
                knowledge = (await c.fetchone())[0]
                c = await conn.execute("SELECT COUNT(*) FROM decisions WHERE app_id = ?", (app_id,))
                decisions = (await c.fetchone())[0]
                c = await conn.execute(
                    "SELECT MAX(created_at) FROM actions_log WHERE app_id = ?", (app_id,)
                )
                last_activity = (await c.fetchone())[0]
        except Exception as e:
            warnings.append(f"[brain] Falha ao ler dados do SQLite: {e}")

    try:
        total_vectors = await vector_store.count_vectors(app_id)
        chroma_status = STATUS_OK
    except Exception:
        chroma_status = STATUS_UNAVAILABLE

    vault_path = os.environ.get("OBSIDIAN_VAULT_PATH")
    if vault_path and os.path.isdir(vault_path):
        obsidian_status = STATUS_OK
    else:
        warnings.append("[brain] Obsidian vault não configurado ou caminho inválido")

    if settings.SUPABASE_ENABLED and settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        supabase_status = STATUS_OK
    else:
        warnings.append("[brain] Supabase desabilitado ou chave ausente")

    return BrainStatus(
        sqlite=sqlite_status,
        chroma=chroma_status,
        obsidian=obsidian_status,
        supabase=supabase_status,
        memories_count=memories,
        knowledge_count=knowledge,
        decisions_count=decisions,
        total_vectors=total_vectors,
        last_activity=last_activity,
        warnings=warnings,
    )


async def get_provider_status() -> ProviderStatus:
    warnings = []
    groq_status = STATUS_MISSING
    gemini_status = STATUS_MISSING
    openai_status = STATUS_MISSING
    ollama_status = STATUS_NOT_CONFIGURED

    try:
        from aion.llm.providers import groq, gemini, openai_p, ollama
    except Exception as e:
        warnings.append(f"[providers] Falha ao importar módulos: {e}")
        return ProviderStatus(warnings=warnings)

    for name, mod, attr in [
        ("groq", groq, "groq"),
        ("gemini", gemini, "gemini"),
        ("openai", openai_p, "openai"),
    ]:
        try:
            available = await mod.is_available()
            set_status = STATUS_CONFIGURED if available else STATUS_MISSING
        except Exception:
            set_status = STATUS_ERROR
            warnings.append(f"[providers] Falha ao verificar {name}")
        if name == "groq":
            groq_status = set_status
        elif name == "gemini":
            gemini_status = set_status
        elif name == "openai":
            openai_status = set_status

    try:
        ollama_available = await asyncio.wait_for(ollama.is_available(), timeout=2.0)
        ollama_status = STATUS_ONLINE if ollama_available else STATUS_OFFLINE
        if not ollama_available:
            warnings.append("[providers] Ollama offline ou não respondendo")
    except asyncio.TimeoutError:
        ollama_status = STATUS_OFFLINE
        warnings.append("[providers] Ollama timeout (2s)")
    except Exception:
        ollama_status = STATUS_OFFLINE
        warnings.append("[providers] Falha ao conectar com Ollama")

    preferred = settings.AI_PROVIDER or "auto (groq -> gemini -> openai -> ollama -> mock)"

    return ProviderStatus(
        groq=groq_status,
        gemini=gemini_status,
        openai=openai_status,
        ollama=ollama_status,
        preferred_provider=preferred,
        warnings=warnings,
    )


async def get_sync_overview(app_id: str) -> SyncOverview:
    warnings = []
    try:
        from aion.sync.sync_queue import get_sync_status
        from aion.sync.sync_scheduler import get_sync_schedule_status

        status = await get_sync_status(app_id)
        scheduler = get_sync_schedule_status(app_id)

        return SyncOverview(
            pending=status.pending,
            syncing=status.syncing,
            synced=status.synced,
            failed=status.failed,
            last_sync_at=status.last_sync_at,
            scheduler_enabled=scheduler.get("scheduled", False),
        )
    except Exception as e:
        warnings.append(f"[sync] Falha ao consultar fila de sync: {e}")
        return SyncOverview(warnings=warnings)


async def get_study_overview(app_id: str) -> StudyOverview:
    warnings = []
    last_report = None
    last_desktop_report = None
    active_sessions = 0
    knowledge_saved = 0
    last_run = None

    try:
        from aion.study.study_mode import get_last_study_report
        report = await get_last_study_report(app_id)
        if report:
            last_report = report.model_dump()
            knowledge_saved = report.knowledge_saved
            last_run = report.created_at
    except Exception as e:
        warnings.append(f"[study] Falha ao obter relatório de estudo: {e}")

    try:
        from aion.study.study_desktop_agent import get_last_desktop_study_report
        report = await get_last_desktop_study_report(app_id)
        if report:
            last_desktop_report = report.model_dump()
    except Exception as e:
        warnings.append(f"[study] Falha ao obter relatório desktop: {e}")

    try:
        from aion.study import study_desktop_agent as sda
        active_sessions = len(getattr(sda, "ACTIVE_DESKTOP_STUDY_TASKS", {}))
    except Exception:
        pass

    return StudyOverview(
        last_study_report=last_report,
        last_desktop_study_report=last_desktop_report,
        active_desktop_sessions=active_sessions,
        knowledge_saved_total=knowledge_saved,
        last_run_at=last_run,
        warnings=warnings,
    )


async def get_dev_overview(app_id: str) -> DevOverview:
    warnings = []
    lessons_count = 0
    last_lesson = None

    try:
        if await sqlite_store.is_tenant_provisioned(app_id):
            async with sqlite_store.tenant_db_connection(app_id) as conn:
                cursor = await conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='dev_lessons'"
                )
                if await cursor.fetchone():
                    cursor = await conn.execute(
                        "SELECT COUNT(*) FROM dev_lessons WHERE app_id = ?", (app_id,)
                    )
                    row = await cursor.fetchone()
                    lessons_count = row[0] if row else 0

                    cursor = await conn.execute(
                        "SELECT title, created_at FROM dev_lessons WHERE app_id = ? "
                        "ORDER BY created_at DESC LIMIT 1",
                        (app_id,),
                    )
                    row = await cursor.fetchone()
                    if row:
                        last_lesson = row["title"]
    except Exception as e:
        warnings.append(f"[dev] Falha ao consultar lições técnicas: {e}")

    return DevOverview(
        last_dev_lesson=last_lesson,
        dev_lessons_count=lessons_count,
        warnings=warnings,
    )


async def get_jobs_overview(app_id: str) -> JobsOverview:
    warnings = []
    active = 0
    rebuild = 0
    study = 0
    desktop = 0
    recent = []
    failed = []

    study_jobs = {}
    rebuild_jobs = {}
    try:
        mod = sys.modules.get("aion.main")
        if mod:
            study_jobs = getattr(mod, "STUDY_JOBS", {})
            rebuild_jobs = getattr(mod, "REBUILD_JOBS", {})
    except Exception:
        pass

    for jid, job in study_jobs.items():
        if job.get("app_id") == app_id:
            study += 1
            if job.get("status") == "running":
                active += 1
            recent.append({"id": jid, "type": "study", "status": job.get("status", "unknown")})
            if job.get("status") == "failed":
                failed.append({"id": jid, "type": "study", "error": job.get("error", "unknown")})

    for jid, job in rebuild_jobs.items():
        rebuild += 1
        if job.get("status") == "running":
            active += 1
        recent.append({"id": jid, "type": "rebuild", "status": job.get("status", "unknown")})
        if job.get("status") == "failed":
            failed.append({"id": jid, "type": "rebuild", "error": job.get("error", "unknown")})

    try:
        from aion.study import study_desktop_agent as sda
        desktop_tasks = getattr(sda, "ACTIVE_DESKTOP_STUDY_TASKS", {})
        for sid, task in list(desktop_tasks.items()):
            if not task.done():
                active += 1
                desktop += 1
    except Exception:
        pass

    return JobsOverview(
        active_jobs=active,
        recent_jobs=recent,
        failed_jobs=failed,
        rebuild_jobs=rebuild,
        study_jobs=study,
        desktop_study_sessions=desktop,
        warnings=warnings,
    )


async def get_control_overview(app_id: str) -> ControlOverview:
    brain_task = asyncio.create_task(get_brain_status(app_id))
    providers_task = asyncio.create_task(get_provider_status())
    sync_task = asyncio.create_task(get_sync_overview(app_id))
    study_task = asyncio.create_task(get_study_overview(app_id))
    dev_task = asyncio.create_task(get_dev_overview(app_id))
    jobs_task = asyncio.create_task(get_jobs_overview(app_id))

    brain = await brain_task
    providers = await providers_task
    sync = await sync_task
    study = await study_task
    dev = await dev_task
    jobs = await jobs_task

    all_warnings = []
    all_warnings.extend(brain.warnings)
    all_warnings.extend(providers.warnings)
    all_warnings.extend(sync.warnings)
    all_warnings.extend(study.warnings)
    all_warnings.extend(dev.warnings)
    all_warnings.extend(jobs.warnings)

    if brain.sqlite != STATUS_OK:
        overall = STATUS_ERROR
    elif all_warnings:
        overall = STATUS_DEGRADED
    else:
        overall = STATUS_OK

    uptime = time.time() - _start_time

    return ControlOverview(
        app_id=app_id,
        status=overall,
        uptime_seconds=round(uptime, 1),
        brain=brain,
        providers=providers,
        sync=sync,
        study=study,
        dev=dev,
        jobs=jobs,
        warnings=all_warnings,
    )
