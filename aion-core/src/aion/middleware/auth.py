import time
import asyncio
import logging
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from aion.config import settings

logger = logging.getLogger("aion.middleware.auth")


class _RateLimiter:
    def __init__(self, max_requests: int = 100, window_seconds: int = 60):
        self._max = max_requests
        self._window = window_seconds
        self._buckets: dict[str, list[float]] = {}
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self._window
        async with self._lock:
            bucket = self._buckets.get(key, [])
            bucket = [t for t in bucket if t > cutoff]
            if len(bucket) >= self._max:
                return False
            bucket.append(now)
            self._buckets[key] = bucket
            return True

    async def cleanup(self):
        now = time.monotonic()
        cutoff = now - self._window
        async with self._lock:
            stale = [k for k, v in self._buckets.items() if all(t < cutoff for t in v)]
            for k in stale:
                del self._buckets[k]


_rate_limiter = _RateLimiter()


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware de autenticação Bearer Token por Tenant.
    Aplica rate limiting (100 req/min por tenant), bloqueia tenants
    sem token configurado, e registra tentativas inválidas sem expor o token.
    """
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        if request.url.path in ("/health", "/v1/core/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        tenant_id = getattr(request.state, "tenant_id", "default")

        if not await _rate_limiter.check(tenant_id):
            logger.warning(
                "Rate limit exceeded for tenant '%s' on route '%s'.",
                tenant_id, request.url.path,
            )
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"status": "error", "message": "Limite de requisições excedido. Tente novamente em instantes."},
            )

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            logger.warning(
                "Access denied: Missing or malformed Authorization header for tenant '%s' on route '%s'.",
                tenant_id, request.url.path,
            )
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "status": "error",
                    "message": "Autenticação necessária. Use o formato: 'Authorization: Bearer <token>'."
                }
            )

        token = auth_header.split(" ", 1)[1].strip()

        expected_token = settings.get_token_for_tenant(tenant_id)

        if not expected_token:
            logger.warning(
                "Access denied: No token configured for tenant '%s' on route '%s'. "
                "Set AION_TOKEN_%s or add to AION_TENANT_TOKENS.",
                tenant_id, request.url.path, tenant_id.upper().replace("-", "_"),
            )
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "status": "error",
                    "message": "Token de autenticação não configurado para este tenant."
                }
            )

        if token != expected_token:
            logger.warning(
                "Access denied: Invalid token for tenant '%s' on route '%s'.",
                tenant_id, request.url.path,
            )
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={
                    "status": "error",
                    "message": "Token de autenticação inválido ou não autorizado para este tenant."
                }
            )

        return await call_next(request)
