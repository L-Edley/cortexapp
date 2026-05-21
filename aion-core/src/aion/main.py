import os
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional, List
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


class ChatResponseData(BaseModel):
    used_cache: bool = Field(default=False, description="Indica se a resposta veio do cache semântico")
    confidence: float = Field(default=1.0, description="Nível de confiança da classificação de intenção (0.0 a 1.0)")


class ChatResponse(BaseModel):
    status: str = Field(default="success", description="Status da transação")
    tenant_id: str = Field(..., description="ID do tenant associado à transação")
    reasoning_log: str = Field(..., description="Logs parciais de raciocínio da IA (Chain of Thought)")
    action_executed: Optional[str] = Field(default=None, description="Ação ou ferramenta engatilhada")
    ui_reply: str = Field(..., description="Resposta formatada para interface de usuário final")
    data: ChatResponseData = Field(..., description="Métricas adicionais da operação")


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

    return ChatResponse(
        status=result.status,
        tenant_id=result.tenant_id,
        reasoning_log=result.reasoning_log,
        action_executed=result.action_executed,
        ui_reply=result.ui_reply,
        data=ChatResponseData(
            used_cache=result.response_source == "cache",
            confidence=result.confidence,
        )
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
