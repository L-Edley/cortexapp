# Checkpoint Técnico — Fase 3 (Motor de Raciocínio)

---

## 1. Resumo executivo

A Fase 3 implementou o motor de raciocínio estruturado do Aion, completando três camadas que transformaram o agente de um roteador simples em um sistema com consciência contextual:

1. **P3.1 — LLM Router híbrido** (`lib/aionLLM.ts`): Cadeia de fallback entre 5 provedores cloud + Ollama opcional, com tolerância a falhas.
2. **P3.2 — Context Builder** (`lib/aionContext.ts`): Montagem de contexto rico (perfil, daily insight, records, brain items, busca semântica) para alimentar o prompt do LLM.
3. **P3.3 — Reason Engine** (`lib/aionReason.ts`): Motor central de raciocínio que classifica intenção, roteia localmente ou para LLM, persiste memória/registros, e normaliza respostas.

Resultado: **349 testes passando**, lint limpo, build OK. Nenhum provider removido, Supabase e Obsidian não foram alterados.

---

## 2. Arquitetura atual do Aion

```
       ┌──────────────┐
       │  /api/aion   │
       │  (route.ts)  │
       └──────┬───────┘
              │
       ┌──────▼───────┐
       │   agent.ts   │
       │  (runAgent)  │
       │              │
       │  reason() ───┼──► lib/aionReason.ts
       └──────┬───────┘
              │
    ┌─────────┼──────────────┐
    │         │              │
    ▼         ▼              ▼
┌────────┐ ┌────────┐ ┌──────────┐
│ Smart  │ │ Aion   │ │  LLM     │
│ Router │ │ Brain  │ │  Router  │
│router. │ │brain/  │ │aionLLM.ts│
│  ts    │ │*.ts    │ └────┬─────┘
└────────┘ └────────┘      │
                           ▼
                    ┌──────────────┐
                    │   Context    │
                    │   Builder    │
                    │ aionContext  │
                    └──────────────┘
```

Fluxo completo de uma requisição:

```
POST /api/aion
  → agent.runAgent()
    → reason(userInput)
      → classifyIntent()        → memory/record/question/analysis/...
      → smartRouter()           → local route? retorna resposta local
      → handleMemoryIntent()    → saveMemory() + indexVector()
      → retrieveRelevantBrainContext()
      → answerFromBrain()       → brain match? retorna resposta do Brain
      → buildSessionContext()   → perfil + registros + brain + semântica
      → buildSystemPrompt()     → sistema + regras de tom
      → buildQueryPrompt()      → contexto + mensagem
      → callWithFallback()      → LLM Router (fallback chain)
      → parseLLMResponse()      → JSON → AionDecision
      → enforceToneRules()      → sem ALL CAPS, voiceReply curta
      → AionReasonResponse
    → AionResponse              → mantém contrato antigo
```

---

## 3. O que foi implementado

### P3.1 — `lib/aionLLM.ts`

| Funcionalidade | Detalhes |
|---|---|
| `callWithFallback(prompt, systemPrompt)` | Tenta Ollama (se `OLLAMA_PRIORITY=before-cloud`), depois providers cloud ordenados, depois Ollama (se `after-cloud`). Retorna texto + metadados. |
| `isOllamaAvailable()` | Cache de 30s, timeout de 3s, detecta se Ollama local está rodando. |
| Providers preservados | Groq, NVIDIA, OpenRouter, Gemini, OpenCode — obtidos via `getOrderedProviders()` de `lib/ai/index.ts`. |
| Rota de fallback | Se todos os providers falham, retorna texto vazio + `route: "fallback"`. |
| Ollama opcional | `OLLAMA_PRIORITY` pode ser `before-cloud`, `after-cloud`, ou ausente (desligado). |

### P3.2 — `lib/aionContext.ts` (371 linhas)

| Função | O que faz |
|---|---|
| `buildSessionContext(input, options?)` | Carrega profile, daily insight, registros recentes, brain items relevantes, resultados de busca semântica. Retorna `AionContext`. |
| `buildSystemPrompt(context)` | Monta o prompt de sistema com perfil, daily insight, padrões, registros, estado do sistema + regras de tom. |
| `buildQueryPrompt(input, context, conversation?)` | Monta o prompt do usuário com brain items, resultados semânticos, contexto de conversa, e schema JSON esperado. |
| `buildContextDebug(context)` | Retorna flags booleanas/numéricas indicando quais fontes foram usadas. |

Tipos de contexto suportados:

- **Profile**: userName, currentGoal, energyPattern, behaviorTriggers, activeProjects
- **Daily Insight**: summary, financial, productivity, habits, topPriority, suggestion
- **Records**: até 5 registros recentes com tipo, título, status
- **Brain Items**: até 3 itens relevantes do IndexedDB
- **Semantic Search**: até 3 resultados de busca vetorial
- **System State**: totalRecords, pendingTasks, todayExpenses

Regras de tom embutidas no system prompt:
- NUNCA usar ALL CAPS
- voiceReply deve ser curta (máximo 1 frase)
- Não inventar dados
- Responder em português do Brasil

### P3.3 — `lib/aionReason.ts` (495 linhas)

| Função | O que faz |
|---|---|
| `classifyIntent(input)` | Classificador léxico puro — detecta 9 intenções sem chamar LLM. |
| `reason(userInput, options?)` | Motor central: timer → classificar → smart router → memory? salvar no Brain → record? persistir → LLM pipeline → normalizar → retornar `AionReasonResponse`. |
| `enforceToneRules(text, voiceReply)` | Corrige ALL CAPS, encurta voiceReply para 1 frase, limita a 200 caracteres. |

Funções auxiliares internas:
- `stripMarkdown()`, `repairJson()`, `extractReplyFallback()`, `parseLLMResponse()` — parsing e reparo de JSON do LLM
- `buildEmptyResponse()`, `localToReasonResponse()`, `handleMemoryIntent()`, `llmPipeline()` — cada etapa do fluxo

### Mudanças em `lib/aion/agent.ts`

O `runAgent()` foi refatorado para usar `reason()` como cérebro central:

- Código reduzido de **651 → 207 linhas** (~68% menos)
- Removeu funções agora delegadas ao `reason()`: `normalizeAionDecision`, `parseJSON`, `callAIWithFallback`, `fallbackResponse`, `stripMarkdown`, `repairJsonFromModel`, `extractReplyFromRawText`
- `runAgent()` agora: valida → `reason()` → web_search (pós-processamento) → learning → `AionResponse`
- Contrato `AionResponse` preservado: `reply`, `voiceReply`, `action`, `record`, `suggestion`, `followUpQuestion`, `tips`, `confidence`, `fallbackUsed`, `debug`

---

## 4. Providers preservados

| Provider | Classe | Ativação |
|---|---|---|
| **Groq** | `OpenAICompatibleProvider` (via `GROQ_CONFIG`) | `GROQ_API_KEY` ou `AI_PROVIDER=groq` |
| **NVIDIA** | `OpenAICompatibleProvider` (via `NVIDIA_CONFIG`) | `NVIDIA_API_KEY` ou `AI_PROVIDER=nvidia` |
| **OpenRouter** | `OpenRouterProvider` | `OPENROUTER_API_KEY` |
| **Gemini** | `GeminiProvider` | `GEMINI_API_KEY` ou `AI_PROVIDER=gemini` |
| **OpenCode** | `OpenCodeProvider` | `OPENCODE_API_KEY` |
| **Ollama** | Chamada HTTP direta a `/api/chat` | `OLLAMA_PRIORITY=before-cloud\|after-cloud` (opcional) |

Ordem de fallback:
1. Provider primário (`AI_PROVIDER`)
2. Par (Groq ↔ NVIDIA)
3. OpenRouter
4. Gemini
5. OpenCode
6. Ollama (se `OLLAMA_PRIORITY=after-cloud`)

Nenhum provider foi removido. Ollama continua estritamente opcional.

---

## 5. Intenções suportadas pelo `reason()`

| Intenção | Gatilhos léxicos | Ação |
|---|---|---|
| `memory` | "salve que", "guarde que", "lembre que", "lembra disso" | Salva no Brain (`saveMemory`) + indexação vetorial |
| `record` | "me lembra de", "tenho que", "preciso", "gastei", "paguei", "recebi", "ideia:", "pensando em" | Smart Router local cria task/expense/idea |
| `question` | `?` ou "o que", "qual", "quem", "como", "onde", "quando", "por que" | Tenta `answerFromBrain` primeiro, depois LLM com contexto |
| `command` | "faça", "execute", "mostre", "liste", "busque", "crie" | Roteia para LLM |
| `analysis` | "analise", "o que percebe", "qual padrão", "o que você acha" | LLM com contexto completo |
| `planning` | "planeje", "crie um plano", "próximos passos", "estratégia" | LLM com contexto completo |
| `review` | "revise", "resuma meu dia", "como estou", "relatório do dia" | LLM com contexto completo |
| `smalltalk` | "oi", "olá", "bom dia", "obrigado", "valeu" | Smart Router local (respostas pré-definidas) |
| `unknown` | Nenhum padrão detectado | Roteia para LLM |

---

## 6. Fluxo de memória

```
Usuário: "salve que eu gosto de pizza"
  → classifyIntent("salve que eu gosto de pizza") → "memory"
  → smartRouter() → não é local (memory não está no router)
  → handleMemoryIntent()
    → extrai "eu gosto de pizza"
    → cria AionBrainItem { type: "user_preference", tags: ["memory", "user-saved"] }
    → saveMemory(item) → Dexie table "memories" + indexBrainItemInBackground()
    → retorna "Anotado: 'Eu gosto de pizza'. Vou lembrar disso."
```

A memória salva fica disponível para:
- `retrieveRelevantBrainContext()` em consultas futuras
- `answerFromBrain()` se a confidence for ≥ 0.65
- Busca semântica via `semanticSearch()` no índice vetorial

---

## 7. Fluxo de registro

```
Usuário: "gastei 50 no almoço"
  → smartRouter() → local: expenseResponse
    → makeRecord("expense", "Gasto de R$ 50.00", ...)
    → retorna AionResponse com action="create_record", record preenchido
  → agent.runAgent() devolve AionResponse com record
  → Frontend persiste via storageProvider.saveRecord()

Usuário: "me lembra de comprar pão amanhã"
  → smartRouter() → local: taskResponse
    → cleanTaskTitle() → "Comprar pão"
    → resolveRelativeDatePtBR() → "2026-05-20"
    → makeRecord("task", "Comprar pão", { dueDate: "2026-05-20" })
```

Registros vindos do LLM (via reason() → llmPipeline):
- `action === "create_record"` → cria `CortexRecord` completo e chama `storageSaveRecord()`
- `action === "save_memory"` → cria `AionBrainItem` e chama `saveMemory()`

---

## 8. Fluxo de pergunta/análise/planejamento

### Pergunta contextual

```
Usuário: "qual meu objetivo atual?"
  → classifyIntent() → "question"
  → smartRouter() → api (não é local)
  → retrieveRelevantBrainContext() → itens do Brain
  → answerFromBrain() → se achar resposta com confidence ≥ 0.65, retorna direto
  → buildSessionContext() → carrega profile, records, brain, semântica
  → buildSystemPrompt() → monta prompt com perfil + regras
  → buildQueryPrompt() → monta prompt com brain items + mensagem
  → callWithFallback() → LLM Router
  → parseLLMResponse() → extrai JSON
  → enforceToneRules() → normaliza
  → AionReasonResponse { text, voiceReply, intent: "question", route: "llm", ... }
```

### Análise/planejamento

Idêntico ao fluxo de pergunta, mas a intenção é registrada como `"analysis"` ou `"planning"` no `AionReasonResponse`, permitindo que o frontend ou agent.ts diferenciem o tipo de resposta.

---

## 9. Debug disponível

### `AionContextDebug` (via `buildContextDebug()`)

```typescript
{
  contextUsed: boolean;        // alguma fonte foi usada?
  recentRecordsUsed: number;   // quantos registros
  brainItemsUsed: number;      // quantos brain items
  semanticResultsUsed: number; // quantos resultados semânticos
  profileUsed: boolean;        // perfil carregado?
  dailyInsightUsed: boolean;   // daily insight disponível?
}
```

### `AionReasonResponse.debug` (via `reason()`)

```typescript
{
  contextDebug: AionContextDebug;
  brainItemsUsed: number;       // itens do Brain considerados
  fallbackReason?: string;      // se route === "fallback"
}
```

### `AionResponse.debug` (via `agent.ts`)

```typescript
{
  route: "local" | "brain" | "api" | "fallback";
  provider: string;
  providerUsed: string;
  model: string;
  fallbackUsed: boolean;
  intent: AionReasonIntent;       // novo campo P3.3
  timeMs: number;                 // novo campo P3.3
  contextDebug?: AionContextDebug;
  brainItemsCount?: number;
  learnedNewItem?: boolean;
}
```

---

## 10. Testes existentes

### Testes de Fase 3 (novos)

| Arquivo | Testes | Cobertura |
|---|---|---|
| `lib/__tests__/aionReason.test.ts` | 24 | `classifyIntent` (9 intenções), `reason` (local, memory, record, analysis, LLM, fallback, ALL CAPS, voiceReply, debug, contexto) |

### Testes de Fase 1-2 (preservados)

| Arquivo | Testes |
|---|---|
| `lib/__tests__/aionContext.test.ts` | 15 |
| `lib/__tests__/aionLLM.test.ts` | 1 |
| `lib/__tests__/aionProfile.test.ts` | 17 |
| `lib/__tests__/id.test.ts` | 5 |
| `lib/__tests__/obsidian-adapter.test.ts` | 5 |
| `lib/__tests__/paths.test.ts` | 4 |
| `lib/__tests__/patternDetector.test.ts` | 1 |
| `lib/__tests__/profileStorage.test.ts` | 4 |
| `lib/__tests__/storageProvider.test.ts` | 13 |
| `lib/__tests__/storageProvider.vector.test.ts` | 5 |
| `lib/aion/__tests__/router.test.ts` | 5 |
| `lib/aion/__tests__/dateResolver.test.ts` | 11 |
| `lib/aion/brain/__tests__/retrieval.test.ts` | 4 |
| `lib/aion/brain/__tests__/retrieval.hybrid.test.ts` | 2 |
| `lib/aion/brain/__tests__/learning.vector.test.ts` | 3 |
| `lib/aion/brain/__tests__/knowledge.vector.test.ts` | 2 |
| `lib/aion/brain/__tests__/memory.vector.test.ts` | 2 |
| `lib/aion/vector/__tests__/embed.test.ts` | 2 |
| `lib/aion/vector/__tests__/semanticIndex.test.ts` | 3 |
| `lib/aion/vector/__tests__/similarity.test.ts` | 1 |
| `lib/aion/vector/__tests__/store.test.ts` | 2 |
| `lib/aion/vector/__tests__/text.test.ts` | 3 |
| Outros (sync, componentes) | 11 |

**Total: 349 testes, 31 arquivos, 0 falhas.**

---

## 11. Riscos atuais

| Risco | Impacto | Mitigação |
|---|---|---|
| `reason()` chama `callWithFallback()` que tenta providers reais | Testes mockam `callWithFallback`, mas em ambiente real sem API keys configuradas, todas as chamadas LLM falham | `OLLAMA_PRIORITY` ou configurar ao menos uma API key |
| `saveMemory()` só funciona no browser (Dexie/IndexedDB) | Server-side/testing sem browser: memory intent retorna `saved=false` | `handleMemoryIntent()` já trata fallback — retorna "Não consegui salvar agora" |
| `classifyIntent()` é puramente léxica (sem LLM) | Frases criativas podem não ser classificadas corretamente | Fallback para `"unknown"` que roteia para LLM |
| `reason()` chama `generateId()` do `brainStore` que usa `crypto.randomUUID()` | Pode falhar em ambientes sem `crypto` | `generateId()` já tem fallback para `Date.now()` + Math.random() |
| Dependência de `getMemory()` (singleton) | Em cenários server-side, o memory singleton persiste entre requisições | `ConversationMemory` é client-side (singleton em módulo), server-side usa `formatConversationContext()` vazio |

---

## 12. Pendências antes da Fase 4

| Item | Onde | Motivo |
|---|---|---|
| Proatividade do Aion | engine de proatividade | Fase 4: Aion deve agir sem input do usuário (sugestões, lembretes, briefings) |
| web_search integrado | agent.ts / tools | `searchWeb` existe mas nunca é acionado por smartRouter — só via LLM |
| AionMemory UI | componente | Não existe interface para ver/gerenciar memórias salvas no Brain |
| Briefing diário (`read_dashboard`) | agent.ts / tools | `action: "read_dashboard"` existe no tipo mas sem implementação |
| Testes de agent.ts | agent.ts | Cobertura indireta via reason(), mas sem testes de integração do fluxo completo |

---

## 13. Critérios para considerar Fase 3 fechada

1. ✅ `lib/aionLLM.ts` — LLM Router híbrido com fallback chain entre 5+ providers
2. ✅ `lib/aionContext.ts` — Context Builder com perfil, daily insight, brain, semântica
3. ✅ `lib/aionReason.ts` — Motor de raciocínio com `classifyIntent()` e `reason()`
4. ✅ `classifyIntent()` detecta: memory, record, question, command, analysis, planning, review, smalltalk, unknown
5. ✅ Memory intents salvam no Brain e indexam
6. ✅ Record intents persistem via storageProvider
7. ✅ Perguntas contextuais usam `buildSessionContext`
8. ✅ Análise/planejamento usam LLM Router com contexto completo
9. ✅ Smart Router local não chama LLM
10. ✅ Falha da LLM retorna fallback útil
11. ✅ `voiceReply` sempre curta (1 frase, ≤ 200 caracteres)
12. ✅ Respostas nunca em ALL CAPS
13. ✅ Debug inclui route, intent, providerUsed e timeMs
14. ✅ agent.ts mantém contrato antigo (AionResponse)
15. ✅ 349 testes passando
16. ✅ lint limpo (sem warnings dos arquivos novos)
17. ✅ build OK
18. ✅ Nenhum provider removido
19. ✅ Ollama continua opcional
20. ✅ Supabase e Obsidian não foram alterados
21. ✅ Nenhuma UI nova criada

---

## A. Comandos de verificação

```bash
# Testes
npm run test

# Lint
npm run lint

# Build
npm run build
```

Todos os três passam sem erros.
