# ARCHITECTURE_v2 — AION Intelligence Core + Cortex UI

## Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                      CORTEX (Next.js UI)                        │
│                                                                 │
│  CommandCenter → /api/aion/* (thin proxy) ─┐                    │
│  Control Panel  → /api/aion/control/*   ───┤                    │
│  Obsidian       → /api/obsidian/*        ──┤                    │
│  TTS            → /api/tts/*             ──┤                    │
│                                             │                   │
│  lib/aion/coreProxy.ts (thin client SDK)   │                   │
│  lib/aionGateway.ts (offline fallback)      │                   │
│  lib/aionKnowledgeGap.ts (local classifier) │                   │
│  lib/aion/brain/ (local IndexedDB)          │                   │
└─────────────────┬───────────────────────────┘                   │
                  │ HTTP (fetch)                                   │
                  ▼                                                │
┌─────────────────────────────────────────────────────────────────┐
│                   AION CORE (FastAPI)                            │
│                                                                  │
│  Runtime Layer:                                                  │
│    main.py → lifespan (startup → serve → shutdown)               │
│    startup.py  (env validation, dirs, health init)              │
│    shutdown.py (graceful: health, scheduler, sessions)          │
│    env_validator.py (required + optional vars)                   │
│                                                                  │
│  API Layer:                                                      │
│    api/health.py     GET /health  GET /v1/health                 │
│    api/status.py     GET /status  GET /v1/status                 │
│    api/metrics.py    GET /metrics (Prometheus format)            │
│    (existing: /v1/core/chat, /v1/tenant/*, etc.)                 │
│                                                                  │
│  LLM Layer:                                                      │
│    factory.py        (legacy — USE_LEGACY_FACTORY=true)          │
│    provider_manager.py (warmup + delegation)                    │
│    provider_health.py  (periodic health check per provider)      │
│    provider_metrics.py (counters, latencies, error rates)        │
│    providers/          groq, gemini, openai, ollama, mock        │
│                                                                  │
│  Resilience Layer:                                               │
│    resilience/circuit_breaker.py  (3 fails → OPEN 30s)          │
│    resilience/retry.py           (exp backoff + jitter)          │
│    resilience/fallback_chain.py  (try providers in order)        │
│                                                                  │
│  Logging Layer:                                                  │
│    logging/structured_logger.py   (JSON formatter)               │
│    logging/runtime_logger.py      (event-based: llm_call, etc.) │
│    logging/request_context.py     (request_id + tenant_id)       │
│                                                                  │
│  Observability:                                                  │
│    runtime/runtime_state.py       (RuntimeFullState)             │
│    runtime/cognitive_metrics.py   (11 counters)                  │
│                                                                  │
│  Runtime Modules:                                                │
│    runtime/runtime_manager.py                                    │
│    runtime/safety_governor.py                                    │
│    runtime/persistent_sessions.py                                │
│    runtime/cognitive_scheduler.py                                │
│    runtime/goal_engine.py                                        │
│    runtime/notifications.py                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Separação Cortex ↔ AION Core

| Camada | Cortex (UI) | AION Core (server) |
|--------|-------------|-------------------|
| Inteligência | ❌ Nenhuma | ✅ LLM, agent, reasoning |
| Providers | ❌ Removido | ✅ groq, gemini, openai, ollama, mock |
| Perfil | Proxy via coreProxy | ✅ Profile engine |
| Alertas | Proxy via coreProxy | ✅ Alert engine |
| Research Topics | Proxy via coreProxy | ✅ Research engine |
| Context/Brain | Local IndexedDB (temporário) | ✅ Context engine |
| Roteamento | ❌ Removido (stub) | ✅ Doctrine router |
| Embeddings | ❌ Removido | ✅ Memory + vector store |
| Scheduler | ❌ Removido (stub) | ✅ Cognitive scheduler |
| Learning | ❌ Removido (stub) | ✅ Learning engine |
| Orquestração | ❌ Nenhuma | ✅ Runtime manager |

## Runtime Lifecycle

```
                STARTUP
                   │
                   ▼
    ┌──────────────────────────┐
    │  env_validator.validate  │  ← verifica DATABASE_DIR, AION_CORE_URL
    └──────────────────────────┘
                   │
                   ▼
    ┌──────────────────────────┐
    │  Criar diretórios        │  ← DATABASE_DIR, VECTOR_STORE_PATH
    └──────────────────────────┘
                   │
                   ▼
    ┌──────────────────────────┐
    │  health_checker.check    │  ← testa cada provider
    │  health_checker.periodic │  ← a cada 60s
    └──────────────────────────┘
                   │
                   ▼
    ┌──────────────────────────┐
    │  provider_manager.warmup │  ← pre-warm providers
    └──────────────────────────┘
                   │
                   ▼
    ┌──────────────────────────┐
    │  FastAPI lifespan yield  │  ← ACEITA REQUISIÇÕES
    └──────────────────────────┘
                   │
                   ▼
                 SHUTDOWN
                   │
                   ▼
    ┌──────────────────────────┐
    │  health_checker.stop     │
    │  cognitive_scheduler.stop│
    │  vector_store.close      │
    │  sessions.persist_all    │
    └──────────────────────────┘
```

## Provider Flow

### Health Check
```
ProviderHealthChecker (singleton)
  ├── check_all() → testa todos providers com prompt curto
  ├── check_one(name) → testa provider específico
  ├── get_cached_statuses() → retorna status em cache
  ├── start_periodic_check() → setInterval(60s)
  └── stop() → clearInterval
```

### Circuit Breaker (per-provider)
```
CLOSED ──(3 consecutive failures)──→ OPEN ──(30s timeout)──→ HALF_OPEN
  ↑                                                              │
  └──────────────────(success)───────────────────────────────────┘
```

### Metrics Registry
```
ProviderMetricsRegistry
  ├── record_success(provider, latency_ms, tokens...)
  ├── record_error(provider, error_type)
  ├── record_timeout(provider)
  ├── record_fallback(from, to)
  └── get_all_stats() → dict por provider
```

### Retry with Backoff
```
attempt 0: delay = base (1s)
attempt 1: delay = base × factor (2s) + jitter
attempt 2: delay = base × factor² (4s) + jitter
...cap at max_delay (30s)
```

### Fallback Chain
```
chain = [
  ("groq",   groq_complete),
  ("gemini", gemini_complete),
  ("openai", openai_complete),
  ("ollama", ollama_complete),
  ("mock",   mock_complete),
]
result = await fallback_chain(chain, prompt, ...)
```

## Observability

### Health Endpoints
| Rota | Descrição |
|------|-----------|
| `GET /health` | Status básico + providers + vector store |
| `GET /v1/health` | Status completo + runtime state |
| `GET /v1/providers/status` | Status por provider |

### Status Endpoints
| Rota | Descrição |
|------|-----------|
| `GET /status` | RuntimeFullState completo |
| `GET /v1/status` | RuntimeFullState completo |
| `GET /v1/brain/status` | Brain + memory + scheduler |
| `GET /v1/scheduler/status` | Scheduler state |

### Metrics
| Rota | Descrição |
|------|-----------|
| `GET /metrics` | Prometheus text format |

### Logging Events
```
llm_call, llm_error, provider_fallback,
request, job_start, job_end,
session_start, session_end,
alert_triggered, research_done,
startup, shutdown
```

## Rollback Flags (env vars)

| Flag | Default | Função |
|------|---------|--------|
| `USE_LEGACY_FACTORY` | `false` | Usa factory.py em vez de provider_manager |
| `CIRCUIT_BREAKER_ENABLED` | `true` | Desliga circuit breaker |
| `STRUCTURED_LOGGING` | `true` | JSON logging (false = stdout simples) |
| `CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `3` | Nº de falhas para abrir |
| `CIRCUIT_BREAKER_RECOVERY_TIMEOUT` | `30` | Tempo em segundos para half-open |

## Client-Side Proxy Layer (Cortex)

```
CommandCenter
  └── handleSend()
       ├── fetch("/api/aion/stream")    ← SSE streaming (tenta primeiro)
       └── fetch("/api/aion")           ← POST fallback

/api/aion (Next.js API route)
  ├── callCoreChat(msg) → AION Core /v1/core/chat
  └── runAgent(msg)     → aionChat() via aionGateway

aionGateway
  ├── isCoreAvailable() → GET /health (cached 30s)
  └── aionChat(input)   → POST /v1/core/chat → offline message

coreProxy.ts
  ├── callCoreChat()     → POST /v1/core/chat
  ├── checkCoreHealth()  → GET /health
  ├── getProfile()       → GET /v1/tenant/{id}/profile
  ├── updateProfile()    → POST /v1/tenant/{id}/profile/update
  ├── getAlerts()        → GET /v1/tenant/{id}/alerts
  ├── checkAlerts()      → POST /v1/tenant/{id}/alerts/check
  └── listResearchTopics() → GET /v1/tenant/{id}/research/topics
```

## SDK (@aion/sdk)

```
packages/aion-sdk/
  ├── src/client.ts       → AionCoreClient (38 métodos)
  ├── src/types.ts        → 36 tipos
  ├── src/errors.ts       → Error handling
  └── src/index.ts        → Barrels
```

SDK client conecta-se diretamente ao AION Core via HTTP, sem passar pelo Next.js API routes. Usado para integrações externas e scripts.

## Configuração (Render)

```yaml
# render.yaml
services:
  - type: web
    name: aion-core
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn aion.main:app --host 0.0.0.0 --port 8001
    healthCheckPath: /v1/health
    envVars:
      - key: AION_CORE_URL
        value: http://localhost:8001
      - key: DATABASE_DIR
        value: /data/tenants
      - key: STRUCTURED_LOGGING
        value: "true"
      - key: CIRCUIT_BREAKER_ENABLED
        value: "true"
```

## Próximos Passos (Fase 5+)

1. Migrar `lib/aion/brain/` (IndexedDB) → ChromaDB no AION Core
2. Migrar `lib/aion/vector/` → Vector store no Core
3. Remover CommandCenter → simplificar para chat-only
4. Remover `components/voice/` legado → consolidar VoiceCenter
5. Unificar `src/aion/config.py` e `app/config.py`
