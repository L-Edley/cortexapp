# Cortex

Sistema operacional pessoal com IA — motor de organização pessoal, financeira e estratégica.

O **Aion** é a secretária inteligente do Cortex. Ela classifica comandos, gerencia tarefas/gastos/ideias, aprende com o uso e decide quando usar IA externa ou resolver localmente.

---

## Arquitetura

```
  Comando do usuário
         │
         ▼
  ┌─────────────┐
  │ Smart Router│  ← classifica: task, expense, idea, saudação, etc.
  └──────┬──────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
  Local    Aion Brain
  (sem     (memória + aprendizado
   API)     + cache)
    │         │
    └────┬────┘
         ▼
  ┌──────────────┐
  │ LLM Provider │  ← só para raciocínio complexo
  │ (se precisar)│
  └──────┬───────┘
         ▼
  ┌──────────────────────────┐
  │ Firebase / Obsidian /    │
  │ localStorage / IndexedDB │
  └──────────────────────────┘
```

## Modos de funcionamento

| Modo | O que faz |
|------|-----------|
| **local** | Tarefas, gastos, ideias, saudações, datas — resolvido 100% no Smart Router sem chamar API |
| **brain** | Memória e aprendizado via Aion Brain (Dexie/IndexedDB no navegador) |
| **api** | Raciocínio complexo via provedores de IA externos |
| **fallback** | Resposta offline quando todos os provedores falham |

## Providers suportados

- **Groq** — `GROQ_API_KEY`
- **NVIDIA** — `NVIDIA_API_KEY`
- **OpenRouter** — `OPENROUTER_API_KEY`
- **Gemini** — `GEMINI_API_KEY`
- **OpenCode** — integração com opencode CLI
- **mock** — padrão, nenhuma chave necessária

## Variáveis de ambiente

Crie `.env.local`:

```env
AI_PROVIDER=groq
AION_PERSONALITY=strom
GROQ_API_KEY=gsk_...
NVIDIA_API_KEY=nvapi-...
OPENROUTER_API_KEY=sk-or-...
GEMINI_API_KEY=AIza...
```

## Scripts

```bash
npm run dev       # servidor de desenvolvimento
npm run build     # build de produção
npm run lint      # validação de código
npm run test      # testes unitários (Vitest)
```

## Estrutura do projeto

```
lib/
├── aion/
│   ├── router.ts          # Smart Router (classificador local)
│   ├── dateResolver.ts    # Resolução de datas em português
│   ├── types.ts           # Tipos do Aion (request, response, etc.)
│   ├── agent.ts           # Orchestrador server-side
│   ├── brain/
│   │   ├── types.ts       # AionBrainItem, scored, cache
│   │   ├── brainStore.ts  # Dexie schema (memories, knowledge, etc.)
│   │   ├── retrieval.ts   # Busca + scoring + sanitização
│   │   ├── knowledge.ts   # CRUD de conhecimento
│   │   ├── learning.ts    # Aprendizado por interação
│   │   ├── memory.ts      # CRUD de memórias
│   │   └── searchCache.ts # Cache de pesquisa com TTL
│   └── __tests__/         # Testes Vitest
├── ai/
│   └── providers/         # Groq, NVIDIA, OpenRouter, Gemini, OpenCode, mock
├── storageProvider.ts     # Camada de persistência
└── types.ts               # Core types (CortexRecord, etc.)
```

## Roadmap

- Tela de memória do Aion — visualizar/gerenciar o que o Aion aprendeu
- Categorização automática de tarefas e gastos
- Briefing diário — resumo inteligente do dia
- Pesquisa web integrada
- Sincronização avançada entre dispositivos

---

## Deploy do AION Intelligence Core

O backend `aion-core/` pode ser deployado no **Railway** ou **Render** como container Docker.

### Pré-requisitos

- Docker instalado localmente (para testar build)
- Conta no [Railway](https://railway.app) ou [Render](https://render.com)
- Uma chave de API LLM (Gemini free tier recomendada)

### 1. Gerar tokens de tenant

```bash
cd aion-core
python scripts/generate_tenant_key.py cortex
```

Saída:
```
Tenant:       cortex
Bearer Token: tok_abc123...
```

Guarde o token — ele será usado no `Authorization: Bearer` de cada requisição
e no `.env.local` do Cortex (`AION_CORE_API_KEY`).

### 2. Deploy no Railway (5 passos)

1. **Crie um novo projeto** no Railway conectado ao seu repositório GitHub
2. **Aponte o root directory** para `aion-core/`
3. **Configure os volumes** (Railway detecta automaticamente pelo `railway.toml`):
   - `/data` — SQLite + ChromaDB
   - `/obsidian` — Obsidian vault (opcional)
4. **Adicione as secrets** no dashboard:

   | Secret | Valor |
   |--------|-------|
   | `GEMINI_API_KEY` | `AIza...` |
   | `AION_TENANT_TOKENS` | `{"cortex":"tok_abc123..."}` |
   | `LOG_LEVEL` | `INFO` |

5. **Deploy** — o Railway builda o Dockerfile automaticamente.
   O `/health` responderá em ~60s (tempo de download do modelo de embeddings).

### 3. Deploy no Render

1. Crie um **Web Service** → **Deploy using Dockerfile**
2. Aponte root directory para `aion-core/`
3. Adicione as variáveis de ambiente (mesmas do Railway)
4. Render criará automaticamente o disco persistente em `/data` (1GB)
5. O health check em `/health` será usado para monitorar o serviço

### 4. Conectar o Cortex ao Core

No `.env.local` do projeto raiz:

```env
NEXT_PUBLIC_AION_CORE_URL=https://seu-projeto.railway.app
AION_CORE_API_KEY=tok_abc123...
```

O Cortex gateway (`lib/aionGateway.ts`) detecta automaticamente
quando o Core está disponível e alterna entre resposta local e remota.

### 5. Verificar o deploy

```bash
curl https://seu-projeto.railway.app/health
# {"status":"ok","providers_available":{"groq":false,"gemini":true,...},"vector_store":"available","obsidian_vault":"unavailable"}

curl -H "Authorization: Bearer tok_abc123..." \
     -H "X-Tenant-ID: cortex" \
     https://seu-projeto.railway.app/v1/core/chat \
     -d '{"message":"qual é a previsão do tempo?"}'
```

### Variáveis de ambiente obrigatórias

| Variável | Descrição |
|----------|-----------|
| `GEMINI_API_KEY` | Chave da API Gemini (provedor principal free tier) |
| `AION_TENANT_TOKENS` | JSON com `{"tenant_id":"token"}` |
| `AION_GLOBAL_TOKEN` | (opcional) Fallback se o tenant não tiver token |

### Variáveis de ambiente opcionais

| Variável | Default | Descrição |
|----------|---------|-----------|
| `SIMILARITY_THRESHOLD` | `0.65` | Threshold de similaridade semântica |
| `NIGHT_RESEARCH_MAX_TOPICS` | `10` | Máx. tópicos por pesquisa noturna |
| `NIGHT_RESEARCH_TIME` | `03:00` | Horário da pesquisa noturna |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Modelo de embeddings |
| `LOG_LEVEL` | `INFO` | Nível de log |
| `OBSIDIAN_VAULT_PATH` | `/obsidian` | Onde salvar cold storage |
| `DATABASE_DIR` | `/data/tenants` | Onde salvar SQLite |
| `VECTOR_STORE_PATH` | `/data/vectors` | Onde salvar ChromaDB |
| `GROQ_API_KEY` | — | Provedor fallback (mais rápido) |
| `OPENAI_API_KEY` | — | Provedor fallback |

### Persistência de dados

- `/data/tenants/*.sqlite` — memórias, conhecimento, decisões (SQLite)
- `/data/vectors/` — índices vetoriais (ChromaDB)
- `/obsidian/` — cold storage em Markdown (opcional, montado separadamente)

Todos os dados sobrevivem a restarts e redeploys.

