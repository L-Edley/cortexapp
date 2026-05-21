import json
import asyncio
import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from aion.database import provision_tenant
from aion.teaching.self_teacher import run_preflight
from aion.teaching import reteacher as reteacher_mod

logger = logging.getLogger("aion.middleware.tenant")

class TenantMiddleware(BaseHTTPMiddleware):
    """
    Middleware responsável por extrair o tenant_id de forma dinâmica
    (do header X-Tenant-ID, query string ou campo 'app_id' no corpo JSON)
    e provisionar automaticamente sua base SQLite de forma segura.
    Após o provisionamento, dispara o self-teaching em background.
    """
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            request.state.tenant_id = "system"
            return await call_next(request)
        # Ignora rotas administrativas ou estáticas
        if request.url.path in ("/health", "/v1/core/health", "/docs", "/openapi.json", "/redoc"):
            request.state.tenant_id = "system"
            return await call_next(request)

        tenant_id = None

        # 1. Extração via Header Customizado
        tenant_id = request.headers.get("X-Tenant-ID")

        # 2. Extração via Query Parameter
        if not tenant_id:
            tenant_id = request.query_params.get("tenant_id")

        # 3. Extração via Request Body (para rotas JSON como /v1/core/chat)
        if not tenant_id and request.method == "POST" and "application/json" in request.headers.get("content-type", ""):
            try:
                body_bytes = await request.body()
                if body_bytes:
                    # Decodificação resiliente para suportar payloads encodados diferentemente no Windows
                    try:
                        body_str = body_bytes.decode("utf-8")
                    except UnicodeDecodeError:
                        body_str = body_bytes.decode("latin-1")
                        
                    body_json = json.loads(body_str)
                    # Mapeia app_id como tenant_id principal, caindo de volta para tenant_id
                    tenant_id = body_json.get("app_id") or body_json.get("tenant_id")
                    
                    # Restaura os bytes na requisição de forma assíncrona para que a rota FastAPI possa re-ler
                    async def receive():
                        return {
                            "type": "http.request",
                            "body": body_bytes,
                            "more_body": False
                        }
                    request._receive = receive
            except Exception as e:
                logger.warning(f"Não foi possível parsear o corpo do JSON no middleware de tenant: {e}")

        # Fallback padrão seguro
        if not tenant_id:
            tenant_id = "default"

        # Sanitização do ID para evitar Path Traversal
        safe_tenant_id = "".join(c for c in tenant_id if c.isalnum() or c in ("-", "_")).strip()
        if not safe_tenant_id:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"status": "error", "message": "Identificador de tenant inválido."}
            )

        # Registra o tenant no request.state
        request.state.tenant_id = safe_tenant_id

        # Provisiona a base do tenant de forma dinâmica (criação e automigração de tabelas)
        try:
            provision_tenant(safe_tenant_id)
        except Exception as e:
            logger.error(f"Erro no provisionamento do banco do tenant '{safe_tenant_id}': {e}")
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "status": "error", 
                    "message": "Erro de infraestrutura ao provisionar base de dados isolada."
                }
            )

        # Dispara self-teaching em background (nunca bloqueia a request)
        asyncio.create_task(run_preflight(safe_tenant_id, safe_tenant_id))

        # Agenda re-ensino periódico em background (24h de intervalo)
        asyncio.create_task(
            reteacher_mod.schedule_reteaching(safe_tenant_id, safe_tenant_id, interval_hours=24.0)
        )

        return await call_next(request)
