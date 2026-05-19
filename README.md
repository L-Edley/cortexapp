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
