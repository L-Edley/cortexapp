# P2.5C — Supabase Schema & Sync Engine Architecture

> **Status:** Design document — no implementation yet
> **Decisões arquiteturais aprovadas:**
> - IDs atuais (`{prefix}_{YYYYMMDD}_{6hex}`) mantidos como PK text no Postgres
> - pgvector com sync bilateral de embeddings (Dexie local + Supabase server-side)
> - Firebase removido na migração para Supabase (não mantido como fallback)

---

## 1. Princípios Arquiteturais

```
┌─────────────────────────────────────────────────────────────────┐
│                     Local-First Principle                        │
│                                                                  │
│  1. Local DB (localStorage + Dexie) é a fonte primária da verdade│
│  2. App funciona 100% offline sem Supabase                       │
│  3. Escritas locais são instantâneas, sync é assíncrono          │
│  4. Obsidian export continua independente                        │
│  5. Usuário nunca espera pela nuvem                              │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 Stack Target
| Camada | Tecnologia | Propósito |
|---|---|---|
| Local primário | localStorage + Dexie/IndexedDB | Fonte da verdade |
| Cloud database | Supabase (Postgres) | Sincronização entre dispositivos |
| Vector search | pgvector extension | Busca semântica server-side |
| Auth | Supabase Auth | Autenticação + RLS |
| Realtime | Supabase Realtime | Atualizações ao vivo entre devices |
| Export | Obsidian REST API | Export Markdown (inalterado) |

### 1.2 O que NÃO muda
- `storageProvider.ts` — continua escrevendo em localStorage primeiro
- `lib/storage.ts` — continua sendo a fonte primária de leitura
- `lib/obsidian-adapter.ts` — exportação Markdown inalterada
- `lib/aion/` (brain, vector, patterns, profile) — continua local-first
- `lib/aion/sync/` — sincronização Obsidian→Aion inalterada
- IDs legíveis — `generateRecordId()` continua sendo o gerador
- `287/287` testes existentes — nenhum será modificado

### 1.3 O que será adicionado
- `lib/supabase/client.ts` — cliente Supabase SSR-safe
- `lib/supabase/types.ts` — tipos gerados das tabelas
- `lib/sync/adapters/localAdapter.ts` — lê fila de pendências locais
- `lib/sync/adapters/supabaseAdapter.ts` — escreve/lê no Supabase
- `lib/sync/syncEngine.ts` — orquestrador bidirecional
- `lib/sync/conflictResolver.ts` — resolução de conflitos LWW
- Migrations SQL em `supabase/migrations/`

---

## 2. Schema Supabase

### 2.1 Extensões
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

### 2.2 Tabela: `records`
**Propósito:** Registros principais do Cortex (tasks, expenses, ideas, etc.)
**PK estratégica:** Text — mesmo formato de `generateRecordId()`.

```sql
CREATE TABLE records (
  id          TEXT PRIMARY KEY,       -- task_20260519_a1b2c3
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN (
                'task','idea','expense','project_note',
                'daily_review','focus_request','unknown'
              )),
  title       TEXT NOT NULL,
  description TEXT,
  priority    TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high')),
  project     TEXT,
  amount      NUMERIC(12,2),
  category    TEXT,
  due_date    DATE,
  next_action TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','done','archived','promoted')),
  raw_input   TEXT,

  -- Sync metadados
  device_id   TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ           -- soft delete
);

-- Índices
CREATE INDEX idx_records_user_type     ON records(user_id, type);
CREATE INDEX idx_records_user_created  ON records(user_id, created_at DESC);
CREATE INDEX idx_records_user_updated  ON records(user_id, updated_at DESC);
CREATE INDEX idx_records_user_deleted  ON records(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_records_sync_pull     ON records(user_id, updated_at)
                WHERE deleted_at IS NULL;
```

**Justificativa da PK text:** `generateRecordId()` já produz IDs únicos com timestamp + entropia. Usar text PK evita refatorar todo o código local (storageProvider, storage, tests, componentes). Postgres lida bem com text PK em escalas de centenas de milhares de registros — o volume do Cortex não justifica a complexidade de um UUID mapping layer.

### 2.3 Tabela: `profiles`
```sql
CREATE TABLE profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  avatar_url    TEXT,
  preferences   JSONB,               -- configurações de UI/UX
  profile_data  JSONB NOT NULL,      -- AionProfile completo (YAML convertido)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_profiles_user ON profiles(user_id);
```

### 2.4 Tabela: `memories`
```sql
CREATE TABLE memories (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  content     TEXT NOT NULL,
  source      TEXT,
  confidence  REAL DEFAULT 0,
  tags        TEXT[] DEFAULT '{}',
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  device_id   TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_memories_user       ON memories(user_id);
CREATE INDEX idx_memories_user_type  ON memories(user_id, type);
CREATE INDEX idx_memories_expires    ON memories(expires_at) WHERE deleted_at IS NULL;
```

### 2.5 Tabela: `knowledge`
Mesma estrutura de `memories`. Separada por domínio: knowledge = fatos aprendidos, memories = contexto pessoal.
```sql
CREATE TABLE knowledge (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  content     TEXT NOT NULL,
  source      TEXT,
  confidence  REAL DEFAULT 0,
  tags        TEXT[] DEFAULT '{}',
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  device_id   TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_knowledge_user      ON knowledge(user_id);
CREATE INDEX idx_knowledge_user_type ON knowledge(user_id, type);
```

### 2.6 Tabela: `conversations`
```sql
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT,
  messages    JSONB NOT NULL,        -- [{role, content, created_at}]
  created_at  TIMESTAMPTZ NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,
  device_id   TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
```

### 2.7 Tabela: `embeddings` (pgvector)
```sql
CREATE TABLE embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN (
                'record','memory','knowledge','profile'
              )),
  source_id   TEXT NOT NULL,
  embedding   VECTOR(384) NOT NULL,
  text        TEXT NOT NULL,          -- texto fonte que gerou o embedding
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Apenas um embedding por source
  UNIQUE(user_id, source_type, source_id)
);

CREATE INDEX idx_embeddings_user          ON embeddings(user_id);
CREATE INDEX idx_embeddings_source        ON embeddings(source_type, source_id);
-- Índice IVFFlat para busca por相似idade (ajustar listas após dados reais)
CREATE INDEX idx_embeddings_ivfflat       ON embeddings
                USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100);
```

### 2.8 Tabela: `sync_queue`
```sql
CREATE TABLE sync_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     TEXT NOT NULL,
  table_name    TEXT NOT NULL,        -- 'records','memories','knowledge', etc.
  record_id     TEXT NOT NULL,        -- PK do registro na tabela
  operation     TEXT NOT NULL CHECK (operation IN ('insert','update','delete')),
  payload       JSONB NOT NULL,       -- snapshot completo do registro
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','failed','completed')),
  retry_count   INTEGER NOT NULL DEFAULT 0,
  max_retries   INTEGER NOT NULL DEFAULT 5,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_queue_status ON sync_queue(user_id, status, created_at);
```

### 2.9 Tabela: `devices`
```sql
CREATE TABLE devices (
  id            TEXT PRIMARY KEY,     -- device_id gerado localmente
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name   TEXT,
  device_type   TEXT,                 -- 'mobile','desktop','web'
  last_synced_at TIMESTAMPTZ,
  last_ip       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_user ON devices(user_id);
```

### 2.10 Tabela: `sync_log`
```sql
CREATE TABLE sync_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id         TEXT NOT NULL,
  direction         TEXT NOT NULL CHECK (direction IN ('push','pull')),
  status            TEXT NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress','completed','failed')),
  records_pushed    INTEGER DEFAULT 0,
  records_pulled    INTEGER DEFAULT 0,
  conflicts_resolved INTEGER DEFAULT 0,
  errors            INTEGER DEFAULT 0,
  error_details     JSONB,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_sync_log_user ON sync_log(user_id, started_at DESC);
```

---

## 3. Row Level Security (RLS)

### 3.1 Política padrão para todas as tabelas
```sql
-- Habilitar RLS em todas as tabelas
ALTER TABLE records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue    ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log      ENABLE ROW LEVEL SECURITY;
```

### 3.2 Políticas por tabela
```sql
-- Records: usuário vê apenas seus próprios registros não-deletados
CREATE POLICY records_user_isolation ON records
  FOR ALL
  USING (user_id = auth.uid() AND deleted_at IS NULL);

-- Profiles: apenas o próprio perfil
CREATE POLICY profiles_user_isolation ON profiles
  FOR ALL
  USING (user_id = auth.uid());

-- Sync queue: o sync engine (service role) insere; usuário lê própria fila
CREATE POLICY sync_queue_user_select ON sync_queue
  FOR SELECT
  USING (user_id = auth.uid());

-- Devices: próprio device
CREATE POLICY devices_user_isolation ON devices
  FOR ALL
  USING (user_id = auth.uid());
```

### 3.3 Service Role
- Todas as operações de sync (push/pull/batch) usam **service role key**
- Service role bypassa RLS
- `service role key` NUNCA fica no client bundle
- Sync engine roda em API routes do Next.js (server-side)

---

## 4. Sync Engine Architecture

### 4.1 Visão geral

```
┌──────────────────────────────────────────────────────────────────┐
│                        SyncEngine                                │
│                                                                  │
│  sync(): Promise<SyncSummary>                                    │
│    ├── pushLocalChanges()    →  SyncQueue → SupabaseAdapter      │
│    ├── pullRemoteChanges()   →  SupabaseAdapter → LocalAdapter   │
│    └── resolveConflicts()    →  ConflictResolver                  │
│                                                                  │
│  onMount: useEffect() → sync()  (background, não-bloqueante)     │
│  onChange: storageProvider → enqueue()  (escrita local → fila)   │
│  onManual: botão "Sincronizar" → sync()  (forçado)              │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Fluxo de Push (local → cloud)

```
1. Escrita local ocorre (storageProvider.saveRecord)
2. storageProvider enfileira no LocalSyncQueue (Dexie):  ← NOVO
   { table: 'records', id, operation: 'insert', payload, status: 'pending' }
3. SyncEngine.sync() é agendado (debounce 2s, non-blocking)
4. SyncEngine.pushLocalChanges():
   a. Lê todas as pendências do LocalSyncQueue (status = 'pending')
   b. Para cada lote de 50:
      - Envia batch upsert para SupabaseAdapter
      - Se sucesso: marca como 'synced' + atualiza syncedAt no registro local
      - Se falha: incrementa retryCount, loga erro
   c. Após 5 retries: marca como 'failed', notifica usuário
5. SyncEngine atualiza last_synced_at no device

Resiliência:
- Se sem internet: pendências acumulam localmente, sync retry no próximo ciclo
- Se falha parcial: apenas os itens com erro ficam pendentes
- Se conflito no push: servidor vence (LWW)
```

### 4.3 Fluxo de Pull (cloud → local)

```
1. SyncEngine.pullRemoteChanges():
   a. Lê last_synced_at do device
   b. Query Supabase:
      SELECT * FROM records
      WHERE user_id = $1
        AND updated_at > $2      (último pull)
        AND deleted_at IS NULL
      ORDER BY updated_at ASC
   c. Para cada registro remoto:
      - Se não existe localmente → insert local
      - Se existe e local.updated_at >= remote.updated_at → skip
      - Se existe e remote.updated_at > local.updated_at → update local
      - Se remote.deleted_at && !local.deleted_at → soft delete local
   d. Marca registros atualizados com syncedAt = now()
   e. Atualiza last_synced_at
```

### 4.4 Estratégia de Resolução de Conflitos

```
Conflito = mesmo registro modificado em dois devices antes do sync

Estratégia: Last-Writer-Wins (LWW) com updated_at

Regras:
1. Compara updated_at (ISO string → timestamptz)
2. Maior updated_at vence
3. Se diferença < 1s (edge case): maior version vence
4. Se empate total: mantém local (conservador), rejeita o remoto

Para conflitos manuais futuros:
- Campo 'conflict_id' na sync_queue
- UI de "merge" opcional na SettingsView
- Log de conflitos em sync_log (conflicts_resolved)
```

### 4.5 LocalSyncQueue (Dexie)

```typescript
// NOVA tabela no Dexie AionBrain (version 3)
syncQueue: 'id, tableName, recordId, operation, status, createdAt, retryCount'

interface SyncQueueItem {
  id: string;           // UUID gerado localmente
  tableName: string;    // 'records' | 'memories' | 'knowledge' | 'conversations' | 'embeddings'
  recordId: string;     // PK do registro na tabela
  operation: 'insert' | 'update' | 'delete';
  payload: unknown;     // snapshot completo do registro no momento da escrita
  localVersion: number; // versão local na hora do enqueue
  status: 'pending' | 'synced' | 'failed';
  retryCount: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 4.6 Integração com storageProvider

```typescript
// NOVO: após saveRecord local, enfileira sync
async function saveRecord(record: CortexRecord): Promise<void> {
  // 1. Local (obrigatório, síncrono)
  local.saveRecord(record);

  // 2. Obsidian (fire-and-forget, existente)
  if (obsidianExportEnabled()) {
    exportRecordToObsidian(record).catch(() => {});
  }

  // 3. Indexação vetorial (fire-and-forget, existente)
  indexRecordInBackground(record);

  // 4. NOVO: Sync queue (fire-and-forget)
  enqueueSync('records', record.id, 'insert', record).catch(() => {});

  // 5. NOVO: Notifica SyncEngine (não aguarda)
  notifySyncEngine();
}
```

---

## 5. Camada de Adaptadores

### 5.1 `LocalAdapter`
```typescript
interface LocalAdapter {
  // Leitura de pendências
  getPendingSyncItems(): Promise<SyncQueueItem[]>;
  markAsSynced(id: string): Promise<void>;
  markAsFailed(id: string, error: string): Promise<void>;

  // Aplicar mudanças remotas
  upsertRecord(record: CortexRecord): Promise<void>;
  softDeleteRecord(id: string): Promise<void>;

  // Metadados
  getLastSyncedAt(): Promise<string | null>;
  setLastSyncedAt(timestamp: string): Promise<void>;

  // Estado do device
  getDeviceId(): Promise<string>;
}
```

### 5.2 `SupabaseAdapter`
```typescript
interface SupabaseAdapter {
  // Push
  batchUpsertRecords(records: CortexRecord[]): Promise<SyncResult>;
  batchDeleteRecords(ids: string[]): Promise<SyncResult>;

  // Pull
  getRecordsChangedSince(since: string): Promise<CortexRecord[]>;
  getDeletedRecordsSince(since: string): Promise<string[]>;  // IDs

  // Auth
  isAuthenticated(): Promise<boolean>;
  getUserId(): Promise<string | null>;

  // Status
  isOnline(): Promise<boolean>;
  getLastSyncTimestamp(): Promise<string | null>;
}
```

### 5.3 Supabase Client

```typescript
// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Server-side client (API routes only)
export function createServerClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

---

## 6. Arquivos a Criar (ordem de implementação)

### Fase P2.5C — Schema + Tipos + Infra

| # | Arquivo | Conteúdo |
|---|---|---|
| 1 | `supabase/migrations/001_schema.sql` | Schema completo (tabelas, índices, RLS, extensões) |
| 2 | `lib/supabase/types.ts` | Tipos TypeScript das tabelas + helpers de serialização |
| 3 | `lib/supabase/client.ts` | Cliente Supabase (client + server) |
| 4 | `lib/sync/types.ts` | SyncQueueItem, SyncSummary, interfaces de adaptador |
| 5 | `lib/sync/localAdapter.ts` | Implementa LocalAdapter (Dexie syncQueue) |
| 6 | `lib/sync/supabaseAdapter.ts` | Implementa SupabaseAdapter |
| 7 | `lib/sync/conflictResolver.ts` | LWW conflict resolution |
| 8 | `lib/sync/syncEngine.ts` | Orquestrador push/pull |
| 9 | `lib/sync/index.ts` | Barrel exports |

### Fase P2.5D — Integração

| # | Arquivo | Mudança |
|---|---|---|
| 10 | `lib/storageProvider.ts` | Adicionar `enqueueSync()` + `notifySyncEngine()` |
| 11 | `lib/aion/brain/brainStore.ts` | Dexie v3: adicionar tabela `syncQueue` |
| 12 | `components/SyncStatusPanel.tsx` | Adicionar botão "Sincronizar nuvem" + status online |
| 13 | `app/api/sync/route.ts` | API route server-side para sync (usa service role) |

### Fase P2.5E — Firebase Removal

| # | Arquivo | Mudança |
|---|---|---|
| 14 | `lib/storageProvider.ts` | Remover Firebase branches (saveRecord, updateRecord, etc.) |
| 15 | `lib/firebase/` | Remover diretório inteiro |
| 16 | `package.json` | Remover `firebase` dependency |
| 17 | `lib/__tests__/storageProvider.test.ts` | Remover testes de Firebase |

---

## 7. Riscos e Mitigações

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Conflitos entre devices com LWW podem perder dados | Média | Alto | `sync_log` guarda histórico; possível UI de "conflitos detectados" no futuro |
| pgvector em produção pode ser lento sem tuning | Média | Médio | IVFFlat com lists adequado; monitorar performance antes de escalar |
| Sync queue cresce sem internet prolongada | Baixa | Médio | Limite de 10k itens na fila; alerta no UI se fila > 500 |
| RLS mal configurada expõe dados entre usuários | Baixa | Crítico | Testes de RLS obrigatórios antes do deploy; service role apenas em API routes |
| Obsidian export e Supabase sync podem competir | Baixa | Baixo | Ambos são fire-and-forget; ordem não importa |
| Migração de Firebase para Supabase pode perder dados | Baixa | Alto | `pullFromFirebase()` já existe; fazer dump antes da migração |
| Text PK pode ser gargalo em joins futuros | Muito baixa | Baixo | Volume esperado < 100k registros por usuário; Postgres lida bem com text PK |

---

## 8. O que NÃO deve ser feito agora

1. ❌ **Instalar `@supabase/supabase-js`** — apenas quando começar P2.5C.2
2. ❌ **Modificar `storageProvider.ts`** — a integração será adicionada depois, num PR separado
3. ❌ **Modificar `lib/storage.ts`** — continua sendo a fonte primária
4. ❌ **Modificar testes existentes** — nenhum teste existente deve quebrar
5. ❌ **Modificar Dexie schema** — apenas quando chegar a fase de integração (P2.5D)
6. ❌ **Migrar dados do Firebase** — será o último passo, depois de tudo testado
7. ❌ **Criar UI de login Supabase** — autenticação será tratada depois do schema
8. ❌ **Implementar Realtime subscriptions** — fase futura, após sync bidirecional básico
9. ❌ **Tocar em providers de IA** — completamente fora do escopo
10. ❌ **Mexer na exportação Obsidian** — inalterada, independente
11. ❌ **Tocar na Fase 3** — roadmap futuro, não agora

---

## 9. Ordem de Implementação Resumida

```
P2.5C.1  ──  docs/SUPABASE_SCHEMA.md  (este documento) ✓
P2.5C.2  ──  @supabase/supabase-js + client.ts + types.ts
P2.5C.3  ──  Migration SQL + RLS policies
P2.5C.4  ──  LocalAdapter (Dexie syncQueue)
P2.5C.5  ──  SupabaseAdapter
P2.5C.6  ──  ConflictResolver
P2.5C.7  ──  SyncEngine (push + pull)
P2.5C.8  ──  Integração storageProvider (enqueueSync)
P2.5C.9  ──  SyncStatusPanel + /api/sync route
P2.5C.10 ──  Tests
──────── ──  Firebase removal (P2.5E)
```

---

## 10. Resumo de Decisões Técnicas

| Decisão | Escolha | Motivo |
|---|---|---|
| PK das tabelas | Text (ID atual) | Evita refatorar todo o código local |
| Embeddings | pgvector sync bilateral | Busca semântica server-side + cache local |
| Firebase | Remover na migração | Simplifica manutenção |
| Sync engine | Server-side (API routes) | Service role key segura |
| Conflict resolution | LWW por updated_at | Simples, eficaz para este volume |
| RLS | user_id isolation | Segurança mínima, sem overhead |
| Sync queue | Dexie table (IndexedDB) | Persistente offline, mesmo ecossistema |
| Batch size | 50 records | Balance entre latency e throughput |
| Sync trigger | Debounce 2s após última escrita | Evita múltiplos syncs em sequência rápida |
