# P3.1 — Ollama Local LLM Integration

> **Status:** Design document — no implementation yet
> **Fase:** 3 — Raciocínio
> **Objetivo:** Raciocínio em cadeia local com custo zero por token, preservando cadeia online existente

---

## 1. Modelo Recomendado: Mistral 7B

### Comparativo

| Modelo | RAM (Q4) | RAM (Q8) | Raciocínio | CoT | PT-BR | Tamanho |
|---|---|---|---|---|---|---|
| **Mistral 7B** | ~5.5 GB | ~8.5 GB | ★★★★★ | ★★★★★ | ★★★★☆ | 7B |
| Llama 3 8B   | ~6.0 GB | ~9.5 GB | ★★★★☆ | ★★★★☆ | ★★★☆☆ | 8B |
| Gemma 2 9B   | ~6.5 GB | ~10 GB  | ★★★★☆ | ★★★★☆ | ★★☆☆☆ | 9B |

**Recomendação: Mistral 7B `q4_k_m` para 8 GB RAM, `q8_0` para 16 GB RAM**

**Comandos Ollama:**
```bash
ollama pull mistral:7b-q4_k_m
ollama run mistral:7b
```

---

## 2. Controle por Env (requisito central)

```bash
# .env.local
ENABLE_OLLAMA=true
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=mistral:7b-q4_k_m
OLLAMA_PRIORITY=before-cloud
```

### Regras de comportamento:

| `ENABLE_OLLAMA` | `OLLAMA_PRIORITY` | Comportamento |
|---|---|---|
| `false` | — | Ollama não entra na cadeia. Nenhuma chamada a localhost. |
| `true` | `before-cloud` | Ollama tentado **antes** do provider chain online. Se falhar, cai em Groq → NVIDIA → OpenRouter → Gemini → OpenCode. |
| `true` | `after-cloud` | Provider configurado (ex: Groq) tentado primeiro. Se falhar, Ollama tentado como fallback **local gratuito** antes de OpenRouter/Gemini. |

---

## 3. Impacto na Cadeia de Fallback

### 3.1 Estado Atual (`getOrderedProviders()`)

```
getOrderedProviders() retorna:
  1. Provider configurado (AI_PROVIDER=groq → GroqProvider)
  2. Sibling (groq ↔ nvidia)
  3. OpenRouter
  4. Gemini
  5. OpenCode
```

### 3.2 Com Ollama `before-cloud`

```
getOrderedProviders() retorna:
  1. OllamaProvider          ← NOVO (antes de tudo)
  2. Provider configurado (Groq/NVIDIA/OpenRouter/Gemini/OpenCode)
  3. Sibling
  4. OpenRouter
  5. Gemini
  6. OpenCode
```

### 3.3 Com Ollama `after-cloud`

```
getOrderedProviders() retorna:
  1. Provider configurado (Groq/NVIDIA/OpenRouter/Gemini/OpenCode)
  2. OllamaProvider          ← NOVO (fallback local antes de cloud mais cara)
  3. OpenRouter (se não for o configurado)
  4. Gemini (se não for o configurado)
  5. OpenCode (se não for o configurado)
```

**Nada é removido.** Groq, NVIDIA, OpenRouter, Gemini, OpenCode continuam exatamente como estão. `getOrderedProviders()` apenas insere `OllamaProvider` na posição correta baseada em `OLLAMA_PRIORITY`.

---

## 4. Implementação: `OllamaProvider`

### 4.1 A interface `AIProvider` (já existe — sem mudanças)

```typescript
// lib/ai/types.ts
export interface AIProvider {
  generateResponse(prompt: string, systemPrompt: string): Promise<string | null>;
}
```

### 4.2 `OllamaProvider`

```typescript
// lib/ai/providers/ollama.ts

const CACHE_TTL = 30_000; // 30s

interface OllamaConfig {
  baseUrl: string;
  model: string;
}

export class OllamaProvider implements AIProvider {
  private config: OllamaConfig;
  private lastCheck = 0;
  private cachedAvailable = false;

  constructor() {
    this.config = {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      model: process.env.OLLAMA_MODEL || 'mistral:7b-q4_k_m',
    };
  }

  async isAvailable(): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastCheck < CACHE_TTL) return this.cachedAvailable;

    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      this.cachedAvailable = res.ok;
    } catch {
      this.cachedAvailable = false;
    }

    this.lastCheck = Date.now();
    return this.cachedAvailable;
  }

  async generateResponse(
    prompt: string,
    systemPrompt: string
  ): Promise<string | null> {
    if (!(await this.isAvailable())) return null;

    try {
      const res = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 1024,
            stop: ['\n```\n'],
          },
        }),
      });

      if (!res.ok) return null;

      const data = await res.json();
      return data?.message?.content || null;
    } catch (err) {
      console.warn('[AION] Ollama erro:', err);
      return null;
    }
  }
}
```

### 4.3 Registro no Provider Chain

```typescript
// lib/ai/index.ts — ACRESCENTAR, não substituir

function isOllamaEnabled(): boolean {
  return process.env.ENABLE_OLLAMA === 'true';
}

export function getOrderedProviders(): ProviderEntry[] {
  const current = process.env.AI_PROVIDER || 'gemini';
  const providers: ProviderEntry[] = [];

  const seen = new Set<string>();

  function add(name: string): void {
    if (seen.has(name)) return;
    seen.add(name);

    switch (name) {
      case 'ollama':
        if (isOllamaEnabled()) {
          providers.push({ provider: new OllamaProvider(), name: 'ollama' });
        }
        break;
      case 'groq':
        // ... unchanged
      case 'nvidia':
        // ... unchanged
      // ... etc
    }
  }

  // NOVA LÓGICA: inserir Ollama baseado em OLLAMA_PRIORITY
  const ollamaPriority = process.env.OLLAMA_PRIORITY || 'before-cloud';

  if (isOllamaEnabled() && ollamaPriority === 'before-cloud') {
    add('ollama');  // antes de tudo
  }

  add(current);

  if (current === 'groq') add('nvidia');
  else if (current === 'nvidia') add('groq');

  if (isOllamaEnabled() && ollamaPriority === 'after-cloud') {
    add('ollama');  // depois do provider configurado + sibling, antes do resto
  }

  add('openrouter');
  add('gemini');
  add('opencode');

  return providers;
}
```

**Se `ENABLE_OLLAMA=false`:** `isOllamaEnabled()` retorna `false`, `add('ollama')` não faz nada. Cadeia inalterada.

---

## 5. Estratégia de Contexto

### 5.1 Orçamento de Tokens (Mistral 7B = 8K contexto)

| Componente | Tokens | Estratégia |
|---|---|---|
| System Prompt | ~1.200 | Fixo |
| Profile Context | ~300 | `buildEnhancedProfileContext()` já é conciso |
| Recent Records | ~800 | Manter top 5, apenas título + tipo + status |
| Brain Memories | ~600 | Top 3 por confidence |
| Detected Patterns | ~400 | Top 2 + daily insight |
| Conversation History | ~800 | Últimas 3 trocas |
| User Message | ~200 | Sempre incluída |
| JSON Schema | ~500 | Fixo no `buildUserPrompt()` |
| **Total** | **~4.800** | ~58% da janela de 8K |

### 5.2 Implementação

```typescript
// lib/aion/agent.ts — ajustar limites antes de montar o prompt

const RECORDS_MAX = 5;
const BRAIN_ITEMS_MAX = 3;
const CONVERSATION_TURNS = 3;

// Em runAgent():
const records = (recentRecords || []).slice(0, RECORDS_MAX);

const brainContext = (brainContextFromClient as AionBrainItem[] || [])
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, BRAIN_ITEMS_MAX);

// Conversation context já limitado por formatoTurnos
```

---

## 6. Estratégia de Fallback (atualizada)

### 6.1 Com `before-cloud`

```
1. Smart Router (keyword local, zero)     ← já existe
2. Brain Context (Dexie local, zero)      ← já existe
3. Ollama Provider (local, zero)          ← NOVO
4. Groq / NVIDIA (configurado, pago)
5. OpenRouter (fallback, pago)
6. Gemini (fallback, pago/free)
7. OpenCode (fallback, free)
8. Offline Fallback Response              ← já existe
```

### 6.2 Com `after-cloud`

```
1. Smart Router (keyword local, zero)     ← já existe
2. Brain Context (Dexie local, zero)      ← já existe
3. Groq / NVIDIA (configurado, pago)
4. Ollama Provider (local, zero)          ← NOVO (fallback gratuito)
5. OpenRouter (fallback, pago)
6. Gemini (fallback, pago/free)
7. OpenCode (fallback, free)
8. Offline Fallback Response              ← já existe
```

---

## 7. Plano de Implementação

### P3.1.1 — Provider + Config

```
Arquivos:
  lib/ai/providers/ollama.ts              → classe OllamaProvider (implements AIProvider)
  lib/ai/providers/__tests__/ollama.test.ts → isAvailable, generateResponse, cache, timeout

Mudanças em lib/ai/index.ts:
  - Importar OllamaProvider
  - Adicionar case "ollama" no switch de add()
  - Adicionar lógica OLLAMA_PRIORITY em getOrderedProviders()
  - Nenhuma linha removida

Nenhuma mudança em agent.ts, router.ts, CommandCenter, storageProvider.
Nenhum teste existente modificado.
287/287 testes continuam passando.
```

### P3.1.2 — Health Endpoint (opcional)

```
Arquivo:
  app/api/ollama/health/route.ts          → GET /api/ollama/health
                                           → proxiea GET /api/tags do Ollama
                                           → retorna { available, model, version }

Nenhuma mudança no client — apenas endpoint server-side.
```

### P3.1.3 — Context Truncation

```
Mudanças em lib/aion/agent.ts:
  - Limitar recentRecords a 5
  - Limitar brainContext a 3
  - Limitar conversationContext a 3 turnos

Testes:
  - Garantir que truncamento não quebra JSON schema
```

### P3.1.4 — Status UI (SettingsView)

```
Mudanças em components/SettingsView.tsx:
  - useEffect que chama /api/ollama/health se ENABLE_OLLAMA=true
  - Mostra "Ollama: Online (Mistral 7B)" ou "Ollama: Offline"
```

### P3.1.5 — Testes

```
Novos:
  lib/ai/providers/__tests__/ollama.test.ts
  lib/ai/__tests__/ollama-index.test.ts   → getOrderedProviders inclui/exclui Ollama

Nenhum teste existente modificado.
```

---

## 8. O que NÃO fazer agora

1. ❌ **Não modificar `agent.ts`** para forçar Ollama — ele só entra se `ENABLE_OLLAMA=true` e o provider chain o incluir
2. ❌ **Não modificar `getOrderedProviders()`** além de adicionar a lógica `OLLAMA_PRIORITY` — nada é removido ou substituído
3. ❌ **Não remover Groq** — cadeia online permanece idêntica
4. ❌ **Não instalar dependências** — Ollama é chamado via `fetch` nativo
5. ❌ **Não modificar `storageProvider.ts`** — fora do escopo
6. ❌ **Não modificar `router.ts`** — Smart Router continua igual
7. ❌ **Não modificar testes existentes** — zero mudanças
8. ❌ **Não implementar streaming** — fase futura
9. ❌ **Não expor nada no client bundle** — Ollama roda apenas em API route server-side
10. ❌ **Não forçar usuário a ter Ollama** — tudo opcional

---

## 9. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Ollama offline | Alta | Baixo | `isAvailable()` → `null` → fallback normal |
| Latência 1ª inferência (~5s) | Alta | Médio | Loading state no CommandCenter já existe; cache de modelo em RAM |
| Prompt > 8K contexto | Média | Alto | Truncamento + safety margin de ~4K |
| Devaneio em português | Média | Médio | `temperature: 0.3`, reparo JSON existente |
| Conflito de porta 11434 | Baixa | Baixo | Configurável via `OLLAMA_BASE_URL` |
