# Checkpoint Técnico — Cortex/Aion (Fases 1 a 3)

---

## 1. Resumo executivo

O Cortex atingiu um MVP funcional com três pilares:

- **Storage/Obsidian** — registros salvos em localStorage com replicação opcional para Firebase e Obsidian REST API, mais um adapter novo gerando notas `.md` com frontmatter YAML.
- **Aion Brain** — 8 módulos criados (Dexie/IndexedDB), memória e aprendizado client-side, sanitização para API, server-side sem acesso a Dexie.
- **Aion Raciocínio** — Smart Router local classifica tarefas/gastos/ideias sem chamar API; provedores externos (Groq, NVIDIA, OpenRouter, Gemini, OpenCode, mock) para raciocínio complexo; Vitest configurado com 19 testes; CI no GitHub Actions.

O projeto tem código funcional, mas acumula dívida técnica legada (dois sistemas de template Obsidian, dupla escrita em localStorage, paths baseados em título em vez de ID, API key exposta no client-side). Antes de adicionar features novas, é recomendado resolver os itens marcados como **pendente** e **risco** abaixo.

---

## 2. Fase 1 — Storage/Obsidian

Camada de persistência local com replicação para Obsidian e Firebase.

### ✅ Concluído

| Item | Arquivo |
|---|---|
| `lib/storage.ts` — CRUD localStorage com chave única `cortex_records` | `lib/storage.ts` |
| `lib/storageProvider.ts` — Orchestrador multi-camada (local + Firebase + Obsidian) | `lib/storageProvider.ts` |
| `lib/obsidian/` — Módulo completo: client REST, paths, templates, export, vaultStorage, health | `lib/obsidian/*.ts` (8 arquivos) |
| `lib/obsidian-adapter.ts` — Novo adapter com `isObsidianAvailable()`, `recordToObsidianNote()`, `saveRecordToObsidian()`, `parseFrontmatter()` | `lib/obsidian-adapter.ts` |
| Integração do adapter no `storageProvider.saveRecord()` | `lib/storageProvider.ts:47-50` |
| 8 templates `.md` para o vault (Gasto, Receita, Tarefa, Hábito, Ideia, Projeto, NotaDiária, RegistroLivre) | `templates/obsidian/*.md` |
| Firebase/Firestore (opcional, auth Google) | `lib/firebase/*.ts` (3 arquivos) |

### ⚠️ Parcial

| Item | Problema |
|---|---|
| `obsidian/vaultStorage.ts` | Chama `saveLocal()` internamente (linha 40), mas `storageProvider.ts` já chamou `local.saveRecord()` antes. Resultado: **localStorage escrito 2x** em modo `hybrid`. |
| Templates Markdown | Existem **dois sistemas paralelos**: `lib/obsidian/templates.ts` (antigo, TypeScript) e `templates/obsidian/*.md` (novo, arquivos .md). O adapter novo usa `buildNoteFrontmatter` próprio, o vaultStorage legado usa `templates.ts`. |
| `parseFrontmatter()` | Existe no adapter, mas não está integrado com `CortexRecord` — ninguém chama `parseFrontmatter` para ler notas de volta do vault. |

### ❌ Pendente

| Item | Arquivo alvo | Por que |
|---|---|---|
| Proxy server-side REST API | `app/api/obsidian/vault/[...path]/route.ts` | API key do Obsidian está em `NEXT_PUBLIC_OBSIDIAN_API_KEY` e vai para o bundle client-side |
| Path baseado em ID | `lib/obsidian/paths.ts` | Usa `{title}.md` → quebra se título mudar. Migrar para `{id}.md` |
| Sync bidirecional (vault → Cortex) | `lib/obsidian/sync.ts` + `parser.ts` | Não existe leitura do vault de volta para localStorage |
| Componente de status do vault | — | Não há indicador visual de sync pendente/realizado |
| Testes do adapter | `lib/obsidian-adapter.test.ts` | `buildNoteFrontmatter`, `saveRecordToObsidian`, `parseFrontmatter` sem cobertura |
| Remover duplicidade `saveLocal` | `lib/obsidian/vaultStorage.ts` | vaultStorage não deveria chamar localStorage diretamente |

### 🔴 Risco

| Risco | Impacto | Mitigação |
|---|---|---|
| API key exposta no bundle | Qualquer deploy expõe a chave do Obsidian REST | Proxy server-side (Commit 3 do plano) |
| Dois sistemas de template | Manutenção duplicada, schemas divergem | Unificar em `obsidian-adapter.ts` e deprecar `templates.ts` |
| Path por título | Registro Órfão no vault se título mudar via update | Migrar para `{id}.md` |
| v0.1 de `obsidian-adapter.ts` | Código novo sem testes | Adicionar testes antes de usar em produção |

---

## 3. Fase 2 — Aion Brain

Memória e aprendizado do Aion via Dexie/IndexedDB no navegador.

### ✅ Concluído

| Item | Arquivo |
|---|---|
| Dexie schema com 6 stores (memories, knowledge, searchCache, conversations, settings, records) | `lib/aion/brain/brainStore.ts` |
| Tipos: `AionBrainItem`, `AionBrainScoredItem`, `AionSearchCacheItem`, `SafeBrainItem`, `ConversationEntry` | `lib/aion/brain/types.ts` |
| `retrieveRelevantBrainContext()` — scoring por keywords+tags+recency+confidence | `lib/aion/brain/retrieval.ts` |
| `prepareBrainContextForApi()` — sanitização (filtra tags sensíveis, limite 5, 800 chars) | `lib/aion/brain/retrieval.ts:131-146` |
| `answerFromBrain()` — resposta do próprio Brain | `lib/aion/brain/knowledge.ts` |
| `learnFromInteraction()` — aprendizado client-side (confidence ≥ 0.65, pattern check, sensibilidade) | `lib/aion/brain/learning.ts` |
| Fluxo client→server: CommandCenter chama `retrieveRelevantBrainContext` → `prepareBrainContextForApi` → `/api/aion` | `components/CommandCenter.tsx` + `lib/aion/agent.ts` |
| Fluxo server→client: `agent.ts` retorna `learningCandidate` → CommandCenter chama `learnFromInteraction` | `lib/aion/agent.ts` + `components/CommandCenter.tsx` |
| Testes: 4 testes para retrieval (brain offline, db null, filtro sensível, limite 5, truncate) | `lib/aion/brain/__tests__/retrieval.test.ts` |

### ⚠️ Parcial

| Item | Problema |
|---|---|
| `records` store no Dexie | Schema definido, mas **nunca populado** — o fluxo de registro ainda usa localStorage |
| Aprendizado automático | `learnFromInteraction()` só roda **após** resposta da API — se o Smart Router resolver local, não aprendizado |
| `answerFromBrain()` | Server-side, só funciona se `brainContextFromClient` for enviado na request. Sem dados do Brain, cai no fallback da API |

### ❌ Pendente

| Item | Arquivo alvo | Por que |
|---|---|---|
| Popular `records` store do Dexie | `lib/aion/brain/brainStore.ts` + integração com `storageProvider` | Dexie tem a store mas ninguém escreve nela |
| Tela de memória do Aion | — | Não existe UI para ver/gerenciar o que o Brain aprendeu |
| Cache de pesquisa com TTL | `lib/aion/brain/searchCache.ts` | Código existe mas nunca é chamado |
| Testes de `answerFromBrain`, `learnFromInteraction` | — | Só retrieval tem testes |

### 🔴 Risco

| Risco | Impacto | Mitigação |
|---|---|---|
| Brain só no client-side | Server-side sempre retorna `[]` para `retrieveRelevantBrainContext` | Decisão arquitetural consciente, mas limita uso do Brain em chamadas server-render |
| `records` store inativa | 1 store de 6 nunca usada | Remover ou integrar — decisão pendente |
| Sem fallback no aprendizado | Se CommandCenter não chamar `learnFromInteraction`, o aprendizado não acontece | Garantir que todo fluxo (local + api) chame aprendizado |

---

## 4. Fase 3 — Aion Raciocínio

Classificação local (Smart Router) + provedores de IA externos.

### ✅ Concluído

| Item | Arquivo |
|---|---|
| Smart Router: classifica tasks, expenses, ideas, greetings, dates, ajuda, empty | `lib/aion/router.ts` |
| `cleanTaskTitle()` — remove prefixos, datas, artigos soltos | `lib/aion/router.ts:137-159` |
| `inferCategory()` — categoriza por tipo (contas, trabalho, saúde, estudos, alimentação, transporte) | `lib/aion/router.ts:161-193` |
| `resolveRelativeDatePtBR()` — "amanhã", "depois de amanhã", "sexta", "semana que vem", etc. | `lib/aion/dateResolver.ts` |
| `formatDatePtBR()` — ISO → DD/MM/AAAA sem timezone bug | `lib/aion/router.ts:132-135` |
| Provedores: Groq, NVIDIA, OpenRouter, Gemini, OpenCode, mock | `lib/ai/providers/*.ts` (6 arquivos) |
| Rota `/api/aion` — orquestra Smart Router → Brain → provedores | `app/api/aion/route.ts` |
| `agent.ts` — runAgent com learningCandidate, fallback, debug | `lib/aion/agent.ts` |
| Testes: 5 testes router (task, expense, idea, greeting, empty) + 9 testes dateResolver | `lib/aion/__tests__/*.test.ts` |
| Vitest configurado + CI no GitHub Actions | `vitest.config.ts`, `.github/workflows/ci.yml` |

### ⚠️ Parcial

| Item | Problema |
|---|---|
| Prioridade urgente | O router só marca `high` se mensagem contém "urgente", "imediatamente", etc. — mas não há tratamento especial na reply (só adiciona "Marquei como urgente!") |
| Categoria de gastos | `inferCategory()` para expense inclui "restaurante" em alimentação, mas não detecta assinaturas (streaming, Netflix) — o template legado tinha essa categoria |
| `offlineFallbackResponse()` | Duplica a lógica de detecção de palavras do `smartRouter()` — se um dia os keywords mudarem, precisam ser alterados em dois lugares |

### ❌ Pendente

| Item | Por que |
|---|---|
| Pesquisa web integrada | O Smart Router nunca roteia para "web_search" — `action: "web_search"` existe no tipo mas nunca é usado |
| Briefing diário (`action: "read_dashboard"`) | Definido no enum mas sem implementação |
| Testes de agent.ts e provedores | Só router e dateResolver têm testes |

### 🔴 Risco

| Risco | Impacto | Mitigação |
|---|---|---|
| Duplicação `offlineFallbackResponse` | Manutenção: 2 lugares para manter keywords | Extrair detecção para função compartilhada |
| Sem cobertura de agent.ts | Quebra silenciosa na orquestração server-side | Adicionar testes de integração |
| API keys expostas em `.env.local` | Vazamento em deploy | Revisar variáveis `NEXT_PUBLIC_` vs server-side |

---

## 5. Ordem recomendada de correção

Prioridade baseada em: (a) bloqueia outras fases, (b) risco de segurança, (c) dívida técnica que acumula.

```
P0 — Crítico (fazer imediatamente)
  ├── 1. Proxy server-side para Obsidian REST API
  │     (app/api/obsidian/vault/[...path]/route.ts)
  │     Motivo: API key exposta no bundle client-side
  │
  ├── 2. Corrigir dupla escrita em localStorage
  │     (remover saveLocal() de obsidian/vaultStorage.ts)
  │     Motivo: dados inconsistentes, performance

P1 — Alta (fazer antes de nova feature)
  ├── 3. Migrar paths de {title}.md para {id}.md
  │     (lib/obsidian/paths.ts)
  │     Motivo: arquivos órfãos se título mudar
  │
  ├── 4. Unificar templates (deprecar lib/obsidian/templates.ts)
  │     Motivo: dois sistemas paralelos divergindo
  │
  ├── 5. Testes para obsidian-adapter.ts
  │     Motivo: código novo sem cobertura

P2 — Média
  ├── 6. Extrair detecção de palavras para função compartilhada
  │     (offlineFallbackResponse vs smartRouter)
  ├── 7. Integrar records store do Dexie (ou remover)
  ├── 8. Testes de agent.ts e provedores

P3 — Baixa (features futuras)
  ├── 9. Sync bidirecional (vault → Cortex)
  ├── 10. Tela de memória do Aion
  ├── 11. Pesquisa web integrada
  ├── 12. Briefing diário
```

---

## 6. O que não deve ser feito ainda

| Item | Motivo |
|---|---|
| Adicionar novo provedor de IA | 6 provedores já funcionam — sem demanda de usuário |
| UI de configuração avançada do Brain | Sem tela de memória do Aion, não faz sentido |
| Cache de pesquisa (searchCache.ts) | Ninguém chama — ativaria quando pesquisa web funcionar |
| Sync bidirecional avançado | Bloqueado pelo proxy (P0) e path por ID (P1) |
| Tema escuro / acessibilidade | Não relacionado ao core |
| Deploy em produção (Vercel, etc) | API keys expostas, proxy não implementado |

---

## 7. Critérios para considerar Fase 1 concluída

1. ✅ `localStorage` como camada primária — salva e lê sem depender de externo
2. ✅ Observabilidade: `isObsidianAvailable()` detecta corretamente Tauri ou REST URL
3. Falha silenciosa: se Obsidian estiver offline, app continua funcionando
4. ✅ Registro salvo em `localStorage` + nota `.md` no vault (quando disponível)
5. **Proxy server-side implementado** — API key nunca vai para o bundle
6. **Paths do vault usam `{id}.md`** — arquivos nunca ficam órfãos
7. **Sem dupla escrita** — `localStorage` é escrito exatamente 1 vez por save
8. **Sistema de template unificado** — apenas `obsidian-adapter.ts` gera frontmatter
9. **Sync vault → Cortex funcional** — é possível importar notas editadas no Obsidian
10. **Testes do adapter com cobertura > 70%**

Legenda: ✅ já atende | **negrito** pendente

---

## 8. Critérios para considerar Fase 2 concluída

1. ✅ `retrieveRelevantBrainContext()` retorna itens scoreados do Dexie
2. ✅ `prepareBrainContextForApi()` sanitiza antes de enviar ao provedor
3. ✅ `learnFromInteraction()` persiste aprendizado no IndexedDB
4. ✅ Fluxo client→server→learning: CommandCenter → API → learningCandidate → learnFromInteraction
5. **`records` store do Dexie populada** — não pode ser store morta
6. **Tela de memória do Aion** — usuário pode ver/gerenciar o que foi aprendido
7. **Testes de learning.ts e knowledge.ts** — cobertura mínima

---

## 9. Critérios para considerar Fase 3 concluída

1. ✅ Smart Router classifica tasks, expenses, ideas sem chamar API
2. ✅ `resolveRelativeDatePtBR()` resolve datas em português corretamente
3. ✅ `inferCategory()` categoriza por tipo (task/expense)
4. ✅ Respostas locais usam `record.dueDate` em vez de data atual
5. ✅ Pelo menos um provedor externo funcional (mock incluso)
6. ✅ `/api/aion` orquestra router → brain → provedor → resposta
7. ✅ 19+ testes passando
8. ✅ CI rodando lint + test + build em todo push
9. **offlineFallbackResponse e smartRouter compartilham detecção** — sem duplicação
10. **Testes de agent.ts** (mínimo: learningCandidate, fallback, brain context)
