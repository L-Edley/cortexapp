import os
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, Request, Query, Path
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from aion.config import settings
from aion.middleware.tenant import TenantMiddleware
from aion.middleware.auth import AuthMiddleware
from aion.agent.agent import run as agent_run
from aion.memory import embeddings as embedding_service
from aion.memory.sqlite_store import tenant_db_connection, is_tenant_provisioned
from aion.llm import factory as llm_factory
from aion.memory import vector_store as vector_store_module
from aion.teaching import reteacher
from aion.research import night_research
from aion.briefing import morning_briefing

logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("aion.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("====================================================")
    logger.info("Iniciando AION Intelligence Core...")
    os.makedirs(settings.DATABASE_DIR, exist_ok=True)
    logger.info("Diretório de bases de dados configurado: %s", settings.DATABASE_DIR)

    logger.info("Inicializando modelo de embeddings...")
    ok = await asyncio.to_thread(embedding_service.load_model)
    if ok:
        logger.info("Modelo de embeddings carregado com sucesso.")
    else:
        logger.warning("Modelo de embeddings não carregado — busca semântica usará fallback.")

    logger.info("Agendando pesquisa noturna...")
    try:
        await night_research.schedule_night_research("cortex")
        logger.info(
            "Pesquisa noturna agendada para %s.",
            settings.NIGHT_RESEARCH_TIME,
        )
    except Exception as e:
        logger.warning("Falha ao agendar pesquisa noturna: %s", e)

    logger.info("Agendando Background Sync...")
    try:
        from aion.sync.sync_scheduler import schedule_cloud_sync
        if settings.SUPABASE_ENABLED:
            schedule_cloud_sync("cortex", interval_minutes=15)
            logger.info("Background Sync agendado a cada 15 minutos.")
        else:
            logger.info("SUPABASE_ENABLED is False — Background Sync não ativado.")
    except Exception as e:
        logger.warning("Falha ao agendar Background Sync: %s", e)

    logger.info("Verificando e recuperando sessões stale de Desktop Study...")
    try:
        from aion.study.study_desktop_agent import recover_stale_sessions
        await recover_stale_sessions("cortex")
        logger.info("Recuperação de sessões stale concluída.")
    except Exception as e:
        logger.warning("Falha ao recuperar sessões stale na inicialização: %s", e)

    logger.info("AION Intelligence Core pronto para servir requisições.")
    logger.info("====================================================")

    yield

    logger.info("====================================================")
    logger.info("Encerrando AION Intelligence Core...")
    logger.info("AION Intelligence Core desligado com segurança.")
    logger.info("====================================================")


app = FastAPI(
    title="AION Intelligence Core",
    description="Motor de IA autônomo, headless e multi-tenant local-first",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"http://192\.168\..*:300\d",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(AuthMiddleware)
app.add_middleware(TenantMiddleware)


class ChatContext(BaseModel):
    timezone: str = Field(default="UTC", description="Fuso horário do cliente")
    locale: str = Field(default="pt-BR", description="Localização/Idioma do cliente")


class ChatRequest(BaseModel):
    app_id: str = Field(..., description="Identificador único do tenant ou aplicação")
    user_id: str = Field(..., description="Identificador único do usuário final")
    input: str = Field(..., description="Mensagem de entrada para o motor de IA")
    context: Optional[ChatContext] = Field(default_factory=ChatContext, description="Metadados de contexto")


from aion.persona.response_formatter import Action, DebugInfo

class ChatResponse(BaseModel):
    status: str = Field(default="success", description="Status da transação")
    tenant_id: str = Field(..., description="ID do tenant associado à transação")
    ui_reply: str = Field(..., description="Resposta formatada para interface de usuário final")
    voice_reply: str = Field(..., description="Versão curta formatada para TTS")
    should_speak: bool = Field(default=True, description="Indicador se o áudio proativo deve ser engatilhado")
    available_actions: List[Action] = Field(default_factory=list, description="Ações ativas sugeridas para a UI")
    follow_up: Optional[str] = Field(default=None, description="Pergunta natural de acompanhamento")
    data: Dict[str, Any] = Field(..., description="Métricas adicionais e dados estruturados da operação")
    debug: Optional[DebugInfo] = Field(default=None, description="Informações de telemetria apenas ativas no nível DEBUG")
    
    # Legacy fields
    reasoning_log: str = Field(default="", description="Logs parciais de raciocínio")
    action_executed: Optional[str] = Field(default=None, description="Ação ou ferramenta engatilhada")


# ---------------------------------------------------------------------------
# POST /v1/core/chat
# ---------------------------------------------------------------------------

@app.post("/v1/core/chat", response_model=ChatResponse)
async def chat(request: Request, body: ChatRequest):
    tenant_id = getattr(request.state, "tenant_id", body.app_id)
    logger.info("Chat request. Tenant: '%s', User: '%s'", tenant_id, body.user_id)

    result = await agent_run(
        app_id=tenant_id,
        user_id=body.user_id,
        input=body.input,
        context=body.context.model_dump() if body.context else {},
    )

    from aion.persona.proactive_engine import reset_cooldown
    reset_cooldown(tenant_id, body.user_id)

    return ChatResponse(
        status=result.status,
        tenant_id=result.tenant_id,
        ui_reply=result.ui_reply,
        voice_reply=result.voice_reply,
        should_speak=result.should_speak,
        available_actions=result.available_actions,
        follow_up=result.follow_up,
        data=result.data,
        debug=result.debug,
        reasoning_log=result.reasoning_log,
        action_executed=result.action_executed
    )


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

AVAILABLE_PROVIDERS_CACHE: List[str] = []
_VECTOR_STORE_CACHE: Optional[str] = None


async def _check_providers() -> List[str]:
    available = []
    for name in llm_factory.PROVIDER_ORDER:
        try:
            mod = getattr(__import__(f"aion.llm.providers.{name}", fromlist=["is_available"]), "is_available")
            if await mod():
                available.append(name)
        except Exception:
            pass
    return available


async def _check_vector_store() -> str:
    try:
        from aion.memory import embeddings
        dummy = embeddings.embed("health check")
        if dummy:
            await vector_store_module.semantic_search("_system_health", dummy, n_results=1)
        return "ok"
    except Exception:
        return "unavailable"


def _check_obsidian_vault() -> str:
    path = os.environ.get("OBSIDIAN_VAULT_PATH")
    if not path:
        return "unavailable"
    if os.path.isdir(path):
        return "ok"
    return "unavailable"


@app.get("/health")
async def health():
    global AVAILABLE_PROVIDERS_CACHE, _VECTOR_STORE_CACHE
    if not AVAILABLE_PROVIDERS_CACHE:
        AVAILABLE_PROVIDERS_CACHE = await _check_providers()
    if _VECTOR_STORE_CACHE is None:
        _VECTOR_STORE_CACHE = await _check_vector_store()
    return {
        "status": "ok",
        "version": "1.0.0",
        "providers_available": AVAILABLE_PROVIDERS_CACHE,
        "vector_store": _VECTOR_STORE_CACHE,
        "obsidian_vault": _check_obsidian_vault(),
    }


@app.get("/v1/core/health")
async def core_health():
    return {
        "status": "ok",
        "service": "AION Intelligence Core V1"
    }


# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/stats
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/stats")
async def tenant_stats(request: Request, app_id: str = Path(..., description="ID do tenant")):
    if not await is_tenant_provisioned(app_id):
        return {
            "app_id": app_id,
            "memories": 0,
            "knowledge": 0,
            "decisions": 0,
            "initialized": False,
            "last_activity": None,
        }

    async with tenant_db_connection(app_id) as conn:
        mem_c = await conn.execute("SELECT COUNT(*) FROM memories WHERE app_id = ?", (app_id,))
        memories = (await mem_c.fetchone())[0]

        kn_c = await conn.execute("SELECT COUNT(*) FROM knowledge WHERE app_id = ?", (app_id,))
        knowledge = (await kn_c.fetchone())[0]

        dec_c = await conn.execute("SELECT COUNT(*) FROM decisions WHERE app_id = ?", (app_id,))
        decisions = (await dec_c.fetchone())[0]

        act_c = await conn.execute(
            "SELECT MAX(created_at) FROM actions_log WHERE app_id = ?", (app_id,)
        )
        last_action = (await act_c.fetchone())[0]

        if not last_action:
            for tbl in ("memories", "knowledge", "decisions"):
                c = await conn.execute(
                    f"SELECT MAX(created_at) FROM {tbl} WHERE app_id = ?", (app_id,)
                )
                val = (await c.fetchone())[0]
                if val:
                    last_action = val
                    break

    try:
        from aion.teaching.self_teacher import is_initialized as _is_initialized
        initialized = await _is_initialized(app_id)
    except Exception:
        initialized = False

    return {
        "app_id": app_id,
        "memories": memories,
        "knowledge": knowledge,
        "decisions": decisions,
        "initialized": initialized,
        "last_activity": last_action,
    }


# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/knowledge
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/knowledge")
async def tenant_knowledge(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
    query: Optional[str] = Query(None, description="Filtro textual (busca por conteúdo e tags)"),
    limit: int = Query(20, ge=1, le=100, description="Máximo de resultados"),
):
    from aion.memory.sqlite_store import search_knowledge

    if not await is_tenant_provisioned(app_id):
        return {"app_id": app_id, "items": [], "total": 0}

    if query:
        results = await search_knowledge(app_id, query)
    else:
        async with tenant_db_connection(app_id) as conn:
            c = await conn.execute(
                "SELECT id, app_id, content, tags, confidence, expires_at, created_at "
                "FROM knowledge WHERE app_id = ? ORDER BY created_at DESC LIMIT ?",
                (app_id, limit),
            )
            rows = await c.fetchall()
            results = []
            for r in rows:
                import json
                parsed_tags = []
                if r["tags"]:
                    try:
                        parsed_tags = json.loads(r["tags"])
                    except Exception:
                        parsed_tags = [r["tags"]]
                results.append({
                    "id": r["id"],
                    "app_id": r["app_id"],
                    "content": r["content"],
                    "tags": parsed_tags,
                    "confidence": r["confidence"],
                    "expires_at": r["expires_at"],
                    "created_at": r["created_at"],
                })

    return {
        "app_id": app_id,
        "items": results[:limit],
        "total": len(results),
    }


# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/knowledge-health
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/knowledge-health")
async def tenant_knowledge_health(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    health = await reteacher.get_knowledge_health(app_id)
    return health.model_dump()


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/reteach
# ---------------------------------------------------------------------------

class ReteachRequest(BaseModel):
    description: str = Field(default="", description="Descrição da aplicação para contexto")

@app.post("/v1/tenant/{app_id}/reteach", status_code=202)
async def trigger_reteach(
    request: Request,
    body: ReteachRequest,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)

    # Fire re-teaching in background (never blocks the request)
    asyncio.create_task(
        reteacher.run_reteaching(tenant_id, body.description or tenant_id)
    )

    return {
        "status": "accepted",
        "app_id": tenant_id,
        "message": "Reteaching triggered in background.",
    }


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/reteach/schedule
# ---------------------------------------------------------------------------

class ScheduleReteachRequest(BaseModel):
    description: str = Field(default="", description="Descrição da aplicação")
    interval_hours: float = Field(default=24.0, ge=1.0, le=720.0, description="Intervalo em horas entre re-ensinos")

@app.post("/v1/tenant/{app_id}/reteach/schedule", status_code=202)
async def schedule_reteach(
    request: Request,
    body: ScheduleReteachRequest,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)

    await reteacher.schedule_reteaching(
        tenant_id,
        body.description or tenant_id,
        interval_hours=body.interval_hours,
    )

    return {
        "status": "scheduled",
        "app_id": tenant_id,
        "interval_hours": body.interval_hours,
        "message": f"Reteaching scheduled every {body.interval_hours}h.",
    }


# ---------------------------------------------------------------------------
# DELETE /v1/tenant/{app_id}/reteach/schedule
# ---------------------------------------------------------------------------

@app.delete("/v1/tenant/{app_id}/reteach/schedule")
async def cancel_schedule_reteach(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    cancelled = await reteacher.cancel_reteaching(tenant_id)
    return {
        "status": "cancelled" if cancelled else "not_found",
        "app_id": tenant_id,
    }


# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/research/last-report
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/research/last-report")
async def get_research_report(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    report = await night_research.get_last_report(app_id)
    if report is None:
        return {"status": "not_found", "app_id": app_id}
    return report.model_dump()


# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/research/topics
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/research/topics")
async def get_research_topics(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    topics = await night_research.get_monitored_topics(app_id)
    return {"app_id": app_id, "topics": topics}


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/research/run
# ---------------------------------------------------------------------------

@app.post("/v1/tenant/{app_id}/research/run", status_code=202)
async def trigger_night_research(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    asyncio.create_task(night_research.run_night_research(tenant_id))
    return {
        "status": "accepted",
        "app_id": tenant_id,
        "message": "Night research triggered in background.",
    }


# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/briefing
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/briefing")
async def get_briefing(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    existing = await morning_briefing.get_today_briefing(app_id)
    if existing is not None:
        return existing.model_dump()

    briefing = await morning_briefing.generate_briefing(app_id)
    if not briefing.summary or briefing.summary.startswith("Briefing não gerado") or briefing.summary.startswith("Tenant ainda não"):
        return briefing.model_dump()

    await morning_briefing.mark_briefing_shown(app_id)
    return briefing.model_dump()

# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/rebuild
# ---------------------------------------------------------------------------

import uuid

class RebuildRequest(BaseModel):
    source: str = Field(default="auto", description="Fonte do rebuild: auto, supabase ou obsidian")

REBUILD_JOBS = {}

@app.post("/v1/tenant/{app_id}/rebuild", status_code=202)
async def trigger_rebuild(
    request: Request,
    body: RebuildRequest,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    job_id = str(uuid.uuid4())
    REBUILD_JOBS[job_id] = {"status": "running", "report": None, "error": None}
    
    async def _run_rebuild(j_id: str, t_id: str, src: str):
        try:
            from aion.obsidian.rebuilder import rebuild_from_vault
            report = await rebuild_from_vault(t_id, source=src)
            REBUILD_JOBS[j_id]["status"] = "completed"
            REBUILD_JOBS[j_id]["report"] = report.model_dump()
        except Exception as e:
            REBUILD_JOBS[j_id]["status"] = "failed"
            REBUILD_JOBS[j_id]["error"] = str(e)
            logger.error("Rebuild job %s failed: %s", j_id, e)
            
    asyncio.create_task(_run_rebuild(job_id, tenant_id, body.source))
    
    return {
        "status": "accepted",
        "app_id": tenant_id,
        "job_id": job_id,
        "message": f"Rebuild triggered from source '{body.source}'. Check status at /v1/tenant/{tenant_id}/rebuild/{job_id}"
    }

# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/rebuild/{job_id}
# ---------------------------------------------------------------------------

from fastapi import HTTPException

@app.get("/v1/tenant/{app_id}/rebuild/{job_id}")
async def get_rebuild_status(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
    job_id: str = Path(..., description="ID do job de rebuild")
):
    job = REBUILD_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    return {
        "job_id": job_id,
        "status": job["status"],
        "error": job["error"]
    }

# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/speak
# ---------------------------------------------------------------------------

from fastapi.responses import StreamingResponse
import io

class SpeakRequest(BaseModel):
    text: str = Field(..., description="Texto para sintetizar em voz")

@app.post("/v1/tenant/{app_id}/speak")
async def speak(
    request: Request,
    body: SpeakRequest,
    app_id: str = Path(..., description="ID do tenant"),
):
    from aion.voice import tts_engine
    
    result = await tts_engine.synthesize(body.text)
    
    # Se indisponível, retorna um JSON padrão com metadados
    if not result.available or not result.audio_bytes:
        return result.model_dump()
        
    # Retorna o áudio como stream MPEG
    return StreamingResponse(
        io.BytesIO(result.audio_bytes),
        media_type="audio/mpeg"
    )

# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/proactive
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/proactive")
async def get_proactive(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
    user_id: str = Query(..., description="ID do usuário")
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    from aion.persona import proactive_engine
    
    trigger = await proactive_engine.get_proactive_trigger(tenant_id, user_id)
    if not trigger:
        return {"has_message": False}
        
    context = {"user_name": "Edley"} # Dummy mock
    msg = await proactive_engine.generate_proactive_message(trigger, context)
    
    proactive_engine.mark_trigger_used(tenant_id, user_id, trigger)
    
    return {
        "has_message": True,
        "message": msg.model_dump()
    }


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/study
# ---------------------------------------------------------------------------

class StudyRequest(BaseModel):
    topics: Optional[List[str]] = Field(default=None, description="Tópicos para estudo manual")
    mode: str = Field(default="manual", description="Modo: manual ou auto")
    max_topics: int = Field(default=5, ge=1, le=20, description="Máximo de tópicos")
    depth: str = Field(default="normal", description="Profundidade: shallow, normal, deep")

STUDY_JOBS: Dict[str, Dict[str, Any]] = {}

@app.post("/v1/tenant/{app_id}/study", status_code=202)
async def trigger_study(
    request: Request,
    body: StudyRequest,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    job_id = f"study_{uuid.uuid4()}"
    STUDY_JOBS[job_id] = {"status": "running", "report": None, "error": None, "app_id": tenant_id}

    async def _run_study(j_id: str, t_id: str, topics, mode, max_t, depth):
        try:
            from aion.study.study_mode import run_study_mode
            report = await run_study_mode(t_id, topics=topics, mode=mode, max_topics=max_t, depth=depth)
            STUDY_JOBS[j_id]["status"] = "completed"
            STUDY_JOBS[j_id]["report"] = report.model_dump()
        except Exception as e:
            STUDY_JOBS[j_id]["status"] = "failed"
            STUDY_JOBS[j_id]["error"] = str(e)
            logger.error("Study job %s failed: %s", j_id, e)

    asyncio.create_task(_run_study(job_id, tenant_id, body.topics, body.mode, body.max_topics, body.depth))

    return {
        "status": "started",
        "app_id": tenant_id,
        "job_id": job_id,
        "message": f"Study mode triggered ({body.mode}). Check status at /v1/tenant/{tenant_id}/study/{job_id}"
    }


# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/study/last
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/study/last")
async def get_last_study(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    from aion.study.study_mode import get_last_study_report
    report = await get_last_study_report(tenant_id)
    if not report:
        return {"status": "not_found", "app_id": tenant_id}
    return report.model_dump()


# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/study/{job_id}
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/study/{job_id}")
async def get_study_status(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
    job_id: str = Path(..., description="ID do job de estudo"),
):
    job = STUDY_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Study job not found")

    # Tenant isolation
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if job.get("app_id") and job["app_id"] != tenant_id:
        raise HTTPException(status_code=404, detail="Study job not found")

    result: Dict[str, Any] = {
        "job_id": job_id,
        "status": job["status"],
    }
    if job["report"]:
        result["report"] = job["report"]
    if job["error"]:
        result["error"] = job["error"]
    return result


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/sync
# ---------------------------------------------------------------------------

@app.post("/v1/tenant/{app_id}/sync")
async def trigger_sync(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    """Força sincronização manual da fila local para a nuvem."""
    tenant_id = getattr(request.state, "tenant_id", app_id)
    from aion.sync.cloud_sync import sync_pending_to_supabase
    
    report = await sync_pending_to_supabase(tenant_id, limit=100)
    return {
        "status": "completed",
        "report": report.model_dump()
    }


# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/sync/status
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/sync/status")
async def sync_status(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    """Recupera status consolidado da fila de sync e do agendador."""
    tenant_id = getattr(request.state, "tenant_id", app_id)
    
    from aion.sync.sync_queue import get_sync_status
    from aion.sync.sync_scheduler import get_sync_schedule_status
    
    status = await get_sync_status(tenant_id)
    scheduler_status = get_sync_schedule_status(tenant_id)
    
    return {
        "status": status.model_dump(),
        "scheduler": scheduler_status
    }


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/sync/retry-failed
# ---------------------------------------------------------------------------

@app.post("/v1/tenant/{app_id}/sync/retry-failed")
async def retry_failed_sync(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    """Pega itens failed e volta para pending (limitado)."""
    tenant_id = getattr(request.state, "tenant_id", app_id)
    
    from aion.sync.sync_queue import retry_failed_sync as queue_retry_failed
    from fastapi import HTTPException
    
    try:
        res = await queue_retry_failed(tenant_id)
        retried = res.get("retried", 0)
    except Exception as e:
        logger.error("Falha ao tentar resetar itens failed para pending: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error resetting sync queue")
        
    if retried == 0:
        message = "Nenhum item failed para retry."
    else:
        message = f"{retried} itens falhos reenfileirados para sincronização."
        
    return {
        "status": "completed",
        "retried": retried,
        "message": message
    }


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/study/desktop/start
# ---------------------------------------------------------------------------

class DesktopStudyStartRequest(BaseModel):
    topics: Optional[List[str]] = Field(default=None, description="Tópicos para estudo manual")
    duration_minutes: int = Field(default=60, ge=1, le=480, description="Duração da sessão em minutos (1 a 480)")
    max_sources: int = Field(default=20, ge=1, le=100, description="Máximo de fontes a ler (1 a 100)")
    depth: str = Field(default="normal", description="Profundidade: shallow, normal, deep")

@app.post("/v1/tenant/{app_id}/study/desktop/start")
async def start_desktop_study_endpoint(
    request: Request,
    body: DesktopStudyStartRequest,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.study.study_desktop_agent import start_desktop_study
    try:
        session = await start_desktop_study(
            app_id=tenant_id,
            topics=body.topics,
            duration_minutes=body.duration_minutes,
            max_sources=body.max_sources,
            depth=body.depth
        )
        return {
            "status": "started",
            "session_id": session.id,
            "app_id": session.app_id
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error("Erro ao iniciar estudo desktop: %s", e)
        raise HTTPException(status_code=500, detail="Erro interno ao iniciar sessão de estudo.")

# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/study/desktop/{session_id}/stop
# ---------------------------------------------------------------------------

@app.post("/v1/tenant/{app_id}/study/desktop/{session_id}/stop")
async def stop_desktop_study_endpoint(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
    session_id: str = Path(..., description="ID da sessão de estudo"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.study.study_desktop_agent import stop_desktop_study
    try:
        status_res = await stop_desktop_study(tenant_id, session_id)
        return {
            "status": "cancelled",
            "session_id": status_res.session_id,
            "app_id": status_res.app_id
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error("Erro ao parar estudo desktop %s: %s", session_id, e)
        raise HTTPException(status_code=500, detail="Erro interno ao parar sessão de estudo.")

# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/study/desktop/{session_id}
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/study/desktop/{session_id}")
async def get_desktop_study_status_endpoint(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
    session_id: str = Path(..., description="ID da sessão de estudo"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.study.study_desktop_agent import get_desktop_study_status
    try:
        status_res = await get_desktop_study_status(tenant_id, session_id)
        return status_res.model_dump()
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        logger.error("Erro ao obter status do estudo desktop %s: %s", session_id, e)
        raise HTTPException(status_code=500, detail="Erro interno ao buscar status da sessão.")

# ---------------------------------------------------------------------------
# GET /v1/tenant/{app_id}/study/desktop/last-report
# ---------------------------------------------------------------------------

@app.get("/v1/tenant/{app_id}/study/desktop/last-report")
async def get_last_desktop_study_report_endpoint(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.study.study_desktop_agent import get_last_desktop_study_report
    try:
        report = await get_last_desktop_study_report(tenant_id)
        if not report:
            raise HTTPException(status_code=404, detail="Nenhum relatório de estudo desktop encontrado.")
        return report.model_dump()
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erro ao obter último relatório do estudo desktop: %s", e)
        raise HTTPException(status_code=500, detail="Erro interno ao buscar último relatório.")


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/teach/ask (P10.6)
# ---------------------------------------------------------------------------

class TeachAskBody(BaseModel):
    teacher: str
    topic: str
    save: bool = False
    tags: List[str] = []

@app.post("/v1/tenant/{app_id}/teach/ask")
async def teach_ask_endpoint(
    request: Request,
    body: TeachAskBody,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.study.teacher_adapters import ask_teacher, save_teacher_answer
    try:
        ans = await ask_teacher(body.teacher, body.topic)
        saved_id = None
        if body.save:
            saved_id = await save_teacher_answer(tenant_id, ans, tags=body.tags)
            
        return {
            "status": "success",
            "answer": {
                "provider": ans.provider,
                "summary": ans.summary,
                "confidence": ans.confidence,
                "should_save": ans.should_save
            },
            "saved_id": saved_id
        }
    except Exception as e:
        logger.error("Erro no teach_ask_endpoint para %s: %s", app_id, e)
        raise HTTPException(status_code=500, detail="Erro interno ao consultar o professor.")


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/teach/import (P10.6)
# ---------------------------------------------------------------------------

class TeachImportBody(BaseModel):
    source: str = "opencode"
    file_path: str
    save: bool = False

@app.post("/v1/tenant/{app_id}/teach/import")
async def teach_import_endpoint(
    request: Request,
    body: TeachImportBody,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.study.teacher_adapters import import_opencode_lesson, save_teacher_answer
    try:
        ans = await import_opencode_lesson(tenant_id, body.file_path)
        saved_id = None
        if body.save:
            saved_id = await save_teacher_answer(tenant_id, ans)
            
        return {
            "status": "success",
            "provider": ans.provider,
            "saved_id": saved_id,
            "warnings": ans.warnings
        }
    except PermissionError as pe:
        logger.warning("Permission error no teach_import_endpoint: %s", pe)
        raise HTTPException(status_code=403, detail=str(pe))
    except FileNotFoundError as fnfe:
        logger.warning("File not found no teach_import_endpoint: %s", fnfe)
        raise HTTPException(status_code=404, detail=str(fnfe))
    except ValueError as ve:
        logger.warning("Value error no teach_import_endpoint: %s", ve)
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error("Erro no teach_import_endpoint para %s: %s", app_id, e)
        raise HTTPException(status_code=500, detail="Erro interno ao importar lição.")


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/dev/analyze (P10.7)
# ---------------------------------------------------------------------------

class DevAnalyzeBody(BaseModel):
    project_path: str

@app.post("/v1/tenant/{app_id}/dev/analyze")
async def dev_analyze_endpoint(
    request: Request,
    body: DevAnalyzeBody,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.dev.dev_mode import analyze_repository
    try:
        res = await analyze_repository(tenant_id, body.project_path)
        return {
            "status": "success",
            "analysis": res.model_dump()
        }
    except ValueError as ve:
        logger.warning("ValueError no dev_analyze_endpoint: %s", ve)
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error("Erro no dev_analyze_endpoint para %s: %s", app_id, e)
        raise HTTPException(status_code=500, detail="Erro interno ao analisar repositório.")


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/dev/plan (P10.7)
# ---------------------------------------------------------------------------

class DevPlanBody(BaseModel):
    project_path: str
    goal: str

@app.post("/v1/tenant/{app_id}/dev/plan")
async def dev_plan_endpoint(
    request: Request,
    body: DevPlanBody,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.dev.dev_mode import create_dev_plan
    try:
        res = await create_dev_plan(tenant_id, body.goal, body.project_path)
        return {
            "status": "success",
            "plan": res.model_dump()
        }
    except ValueError as ve:
        logger.warning("ValueError no dev_plan_endpoint: %s", ve)
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error("Erro no dev_plan_endpoint para %s: %s", app_id, e)
        raise HTTPException(status_code=500, detail="Erro interno ao criar plano de desenvolvimento.")


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/dev/review (P10.7)
# ---------------------------------------------------------------------------

class DevReviewBody(BaseModel):
    project_path: str

@app.post("/v1/tenant/{app_id}/dev/review")
async def dev_review_endpoint(
    request: Request,
    body: DevReviewBody,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.dev.dev_mode import review_code_changes
    try:
        res = await review_code_changes(tenant_id, body.project_path)
        return {
            "status": "success",
            "review": res.model_dump()
        }
    except ValueError as ve:
        logger.warning("ValueError no dev_review_endpoint: %s", ve)
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error("Erro no dev_review_endpoint para %s: %s", app_id, e)
        raise HTTPException(status_code=500, detail="Erro interno ao revisar código.")


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/dev/validate (P10.7)
# ---------------------------------------------------------------------------

class DevValidateBody(BaseModel):
    project_path: str
    commands: List[str]

@app.post("/v1/tenant/{app_id}/dev/validate")
async def dev_validate_endpoint(
    request: Request,
    body: DevValidateBody,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.dev.dev_mode import run_validation_commands
    try:
        res = await run_validation_commands(body.project_path, body.commands)
        return {
            "status": "success",
            "report": res.model_dump()
        }
    except ValueError as ve:
        logger.warning("ValueError no dev_validate_endpoint: %s", ve)
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error("Erro no dev_validate_endpoint para %s: %s", app_id, e)
        raise HTTPException(status_code=500, detail="Erro interno ao executar validações.")


# ---------------------------------------------------------------------------
# Control Center Endpoints (P10.8B)
# ---------------------------------------------------------------------------

from aion.control.control_center import (
    get_control_overview,
    get_brain_status,
    get_provider_status,
    get_sync_overview,
    get_study_overview,
    get_dev_overview,
    get_jobs_overview,
)


@app.get("/v1/tenant/{app_id}/control/overview")
async def control_overview(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    overview = await get_control_overview(tenant_id)
    return overview.model_dump()


@app.get("/v1/tenant/{app_id}/control/brain")
async def control_brain(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    status = await get_brain_status(tenant_id)
    return status.model_dump()


@app.get("/v1/tenant/{app_id}/control/providers")
async def control_providers(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    status = await get_provider_status()
    return status.model_dump()


@app.get("/v1/tenant/{app_id}/control/sync")
async def control_sync(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    overview = await get_sync_overview(tenant_id)
    return overview.model_dump()


@app.get("/v1/tenant/{app_id}/control/study")
async def control_study(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    overview = await get_study_overview(tenant_id)
    return overview.model_dump()


@app.get("/v1/tenant/{app_id}/control/dev")
async def control_dev(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    overview = await get_dev_overview(tenant_id)
    return overview.model_dump()


@app.get("/v1/tenant/{app_id}/control/jobs")
async def control_jobs(
    request: Request,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    overview = await get_jobs_overview(tenant_id)
    return overview.model_dump()


# ---------------------------------------------------------------------------
# Workspace API (P11 — Unified Cognitive Workspace)
# ---------------------------------------------------------------------------

@app.get("/v1/workspace/state")
async def workspace_state(request: Request):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.workspace.workspace_state import get_workspace_state
    state = get_workspace_state().get_state()
    return state.model_dump()


@app.get("/v1/workspace/timeline")
async def workspace_timeline(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    category: Optional[str] = Query(None),
):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.workspace.timeline import get_timeline
    events = get_timeline().get_events(limit=limit, category=category)
    return {
        "events": [e.model_dump() for e in events],
        "categories": get_timeline().get_categories(),
    }


@app.get("/v1/workspace/strategies")
async def workspace_strategies(request: Request):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.orchestrator.learning_system import get_learning_system
    system = get_learning_system()
    await system.sync_strategies(tenant_id)
    strategies = system.evaluator.get_all_strategies()
    return {
        "strategies": {k: v.model_dump() for k, v in strategies.items()},
        "most_used_modes": system.evaluator.get_most_used_modes(),
    }


@app.get("/v1/workspace/memory-graph")
async def workspace_memory_graph(
    request: Request,
    limit: int = Query(200, ge=10, le=500),
):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.workspace.memory_graph import get_memory_graph
    graph = await get_memory_graph().build(tenant_id, limit=limit)
    return graph.model_dump()


@app.get("/v1/workspace/providers")
async def workspace_providers(request: Request):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.workspace.brain_observatory import get_brain_observatory
    providers = await get_brain_observatory().get_providers(tenant_id)
    return {"providers": providers}


@app.get("/v1/workspace/executions")
async def workspace_executions(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.orchestrator.execution_memory import get_execution_memory
    records = await get_execution_memory().list_recent(tenant_id, limit=limit)
    return {
        "executions": [r.model_dump() for r in records],
        "total": len(records),
    }


@app.get("/v1/workspace/reflections")
async def workspace_reflections(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.memory.sqlite_store import search_knowledge
    results = await search_knowledge(tenant_id, "", limit=limit * 2)
    reflections = [r for r in results if r.get("source_mode") == "reflection" or "reflection" in (r.get("tags") or [])]
    return {
        "reflections": [{
            "id": r.get("id"),
            "content": (r.get("content") or "")[:300],
            "tags": r.get("tags", []),
            "created_at": r.get("created_at"),
        } for r in reflections[:limit]],
        "total": len(reflections[:limit]),
    }


@app.get("/v1/workspace/live-feed")
async def workspace_live_feed(
    request: Request,
    limit: int = Query(50, ge=1, le=100),
):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.workspace.live_feed import get_live_feed
    entries = get_live_feed().get_entries(limit=limit)
    return {
        "entries": [e.model_dump() for e in entries],
    }


@app.get("/v1/workspace/dashboard")
async def workspace_dashboard(request: Request):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.orchestrator.learning_system import get_learning_system
    system = get_learning_system()
    dashboard = await system.get_dashboard_data(tenant_id)
    from aion.workspace.brain_observatory import get_brain_observatory
    brain = await get_brain_observatory().get_stats(tenant_id)
    from aion.workspace.timeline import get_timeline
    timeline = get_timeline().get_recent_summary(limit=10)
    return {
        **dashboard,
        "brain": brain.model_dump(),
        "recent_timeline": timeline,
    }


# ---------------------------------------------------------------------------
# Workspace Brain Observatory (P11.6)
# ---------------------------------------------------------------------------

@app.get("/v1/workspace/brain/stats")
async def workspace_brain_stats(request: Request):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.workspace.brain_observatory import get_brain_observatory
    stats = await get_brain_observatory().get_stats(tenant_id)
    return stats.model_dump()


@app.get("/v1/workspace/brain/health")
async def workspace_brain_health(request: Request):
    tenant_id = getattr(request.state, "tenant_id", "cortex")
    from aion.workspace.brain_observatory import get_brain_observatory
    health = await get_brain_observatory().get_health(tenant_id)
    return health


# ---------------------------------------------------------------------------
# Runtime API (P12 — Autonomous Cognitive Runtime)
# ---------------------------------------------------------------------------

@app.get("/v1/runtime/state")
async def runtime_state(request: Request):
    from aion.runtime.runtime_manager import get_runtime_manager
    state = get_runtime_manager().get_state()
    return state.model_dump()


@app.get("/v1/runtime/sessions")
async def runtime_sessions(
    request: Request,
    session_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    from aion.runtime.persistent_sessions import get_session_store
    sessions = get_session_store().list_all(session_type=session_type, limit=limit)
    return {
        "sessions": [s.model_dump() for s in sessions],
        "active_count": len(get_session_store().list_active(session_type)),
    }


@app.get("/v1/runtime/goals")
async def runtime_goals(
    request: Request,
    active_only: bool = Query(True),
):
    from aion.runtime.goal_engine import get_goal_engine
    goals = get_goal_engine().list_goals(active_only=active_only)
    return {
        "goals": [g.model_dump() for g in goals],
    }


@app.get("/v1/runtime/jobs")
async def runtime_jobs(request: Request):
    from aion.runtime.runtime_manager import get_runtime_manager
    mgr = get_runtime_manager()
    return {
        "active_jobs": mgr.get_active_jobs(),
        "telemetry": mgr.get_telemetry(),
    }


@app.get("/v1/runtime/notifications")
async def runtime_notifications(
    request: Request,
    unread_only: bool = Query(False),
    type_filter: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
):
    from aion.runtime.notifications import get_notification_store
    store = get_notification_store()
    notes = store.list_all(unread_only=unread_only, type_filter=type_filter, limit=limit)
    return {
        "notifications": [n.model_dump() for n in notes],
        "unread_count": store.count_unread(),
    }


@app.get("/v1/runtime/scheduler")
async def runtime_scheduler(request: Request):
    from aion.runtime.cognitive_scheduler import get_scheduler
    tasks = get_scheduler().list_tasks()
    return {
        "tasks": [t.model_dump() for t in tasks],
        "due_count": len(get_scheduler().get_due_tasks()),
    }


# ---------------------------------------------------------------------------
# POST /v1/tenant/{app_id}/dev/save-lesson (P10.7)
# ---------------------------------------------------------------------------

class DevSaveLessonBody(BaseModel):
    title: str
    content: str
    summary: str = ""
    tags: List[str] = []
    confidence: float = 0.90

@app.post("/v1/tenant/{app_id}/dev/save-lesson")
async def dev_save_lesson_endpoint(
    request: Request,
    body: DevSaveLessonBody,
    app_id: str = Path(..., description="ID do tenant"),
):
    tenant_id = getattr(request.state, "tenant_id", app_id)
    if tenant_id != app_id:
        raise HTTPException(status_code=403, detail="Acesso não autorizado para este tenant (Tenant Isolation).")

    from aion.dev.dev_mode import save_technical_lesson
    try:
        saved_id = await save_technical_lesson(tenant_id, body.model_dump())
        if not saved_id:
            raise HTTPException(status_code=400, detail="Persistence blocked. Sensitive data or invalid format.")
            
        return {
            "status": "success",
            "saved_id": saved_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Erro no dev_save_lesson_endpoint para %s: %s", app_id, e)
        raise HTTPException(status_code=500, detail="Erro interno ao salvar lição técnica.")





