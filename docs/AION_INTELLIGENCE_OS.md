# AION Intelligence OS — Doutrina de Arquitetura

> **Versão:** 1.0.0  
> **Fase:** Pós-P10  
> **Última atualização:** Maio 2026

---

## 1. Visão Geral

### O que é o AION Intelligence OS

O AION é um **sistema operacional de inteligência e desenvolvimento**. Ele não é um chatbot, nem um aplicativo — ele é o motor que processa raciocínio, memória, aprendizado, estudo, planejamento de desenvolvimento e síntese de respostas para qualquer aplicação cliente que o invoque.

O AION opera em tempo real, é local-first, multi-inquilino, e foi projetado para funcionar sem depender de conexão com a nuvem para suas operações críticas.

### Motor, não app

Um app conversa. O AION raciocina, lembra, estuda, pesquisa, detecta padrões, ensina e planeja desenvolvimento de software. Um app exibe botões. O AION decide quais ações estão disponíveis, como responder, quando falar e o que aprender com cada interação.

A separação é deliberada: o motor evolui independentemente das carrocerias que o consomem.

### Relação AION Core e apps clientes

```
App Cliente (Cortex, NatuForce, WhatsApp bot, …)
    │
    │  POST /v1/core/chat
    │  { app_id, user_id, input, context }
    │  Authorization: Bearer <token>
    │
    ▼
AION Intelligence Core
    │
    ├── 1. Detectar intenção
    ├── 2. Buscar contexto emocional
    ├── 3. Montar contexto RAG (memórias + conhecimento)
    ├── 4. Classificar lacuna de conhecimento
    ├── 5. Decidir fonte (cache, LLM local, LLM nuvem)
    ├── 6. Executar aprendizado
    ├── 7. Executar ferramentas
    ├── 8. Atualizar estado emocional
    ├── 9. Persistir em SQLite + ChromaDB + Obsidian
    ├── 10. Enfileirar sync para Supabase
    └── 11. Responder com estrutura rica
    │
    ▼
App recebe: { ui_reply, voice_reply, should_speak, available_actions, follow_up, data, debug }
```

O app renderiza a resposta. O AION fez todo o resto.

---

## 2. Metáfora Oficial

```
┌──────────────────────────────────────────────────────────────┐
│                     AION INTELLIGENCE OS                      │
│                         O MOTOR                               │
│                                                               │
│  • Raciocínio e decisão                                       │
│  • Memória e aprendizado                                      │
│  • Detecção de intenção e padrões                             │
│  • Estudo e pesquisa                                          │
│  • Planejamento de desenvolvimento                            │
│  • Síntese de resposta                                        │
│  • Sync e persistência                                        │
│  • Políticas de segurança                                     │
│  • Ferramentas internas                                       │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            │ Protocolo HTTP/JSON
                            │ Bearer Token
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   CORTEX     │   │  NATUFORCE   │   │ WHATSAPP BOT │
│ (carroceria) │   │ (carroceria) │   │ (carroceria) │
│              │   │              │   │              │
│ • UI/UX      │   │ • UI/UX      │   │ • Interface  │
│ • Layout     │   │ • Layout     │   │   de mensagem│
│ • Botões     │   │ • Botões     │   │ • Botões     │
│ • Componentes│   │ • Componentes│   │   rápidos    │
│ • Rotas      │   │ • Rotas      │   │ • Áudio      │
│ • Chat UI    │   │ • Chat UI    │   │              │
└──────────────┘   └──────────────┘   └──────────────┘
```

**O motor decide. O app renderiza e executa conforme foi programado.**

Assim como um motor de carro não sabe se está numa picape ou num esportivo, o AION não sabe se está sendo usado por um chat web, um bot de WhatsApp ou um sistema de CRM. Ele apenas processa inteligência e devolve uma resposta estruturada.

---

## 3. Modos do AION

### 3.1 Chat Mode

Modo principal e permanente. Processa toda mensagem enviada por um app cliente através do pipeline completo:

1. **Detecção de intenção** — classifica a entrada em comandos (criar tarefa, salvar memória) ou conversa livre via regex + fallback LLM
2. **Contexto emocional** — recupera o estado emocional atual da sessão e a tendência das últimas horas
3. **RAG Context** — monta um contexto com memórias recentes, conhecimento relevante e busca semântica no ChromaDB
4. **Classificação de lacuna** — decide se a entrada contém conhecimento novo, decisão estratégica, evento recente, dado pessoal, etc.
5. **Decisão de fonte** — se o cache ou conhecimento local tem confiança alta, responde sem chamar LLM externo
6. **Aprendizado** — chama o Learning Engine que invoca o LLM, faz pesquisa on-demand se necessário, e salva no cérebro
7. **Ferramentas** — executa ferramentas como criar tarefa, salvar memória, pesquisar na web
8. **Atualização emocional** — detecta emoção com base em palavras-chave e salva snapshot
9. **Formatação da resposta** — monta `AionResponse` com texto para UI, texto para TTS, ações disponíveis, follow-up e debug

**Endpoint:** `POST /v1/core/chat`

### 3.2 Study Mode

Modo de estudo autônomo. O AION pode estudar tópicos automaticamente ou sob demanda:

- **Modo manual:** o usuário ou app envia uma lista de tópicos para estudar
- **Modo auto:** o AION detecta tópicos a partir do log de ações e lacunas de conhecimento
- **Profundidade:** light (só conhecimento local), normal (professor + pesquisa web se confiança < 80%), deep (professor + pesquisa web sempre)
- **Fluxo:** para cada tópico → RAG local → professor (se necessário) → pesquisa web (se necessário) → síntese LLM → salvar resultado → relatório

**Endpoints:** `POST /v1/tenant/{app_id}/study`, `GET /v1/tenant/{app_id}/study/{job_id}`, `GET /v1/tenant/{app_id}/study/last`

### 3.3 Desktop Study Agent

Extensão do Study Mode para sessões longas e imersivas:

- Sessões de duração configurável (padrão 30 min)
- Leitura de páginas web em tempo real com extração de conteúdo
- Integração com Teacher Adapters para aprofundamento
- Progresso contínuo com salvamento incremental a cada tópico
- Suporte a múltiplas fontes por sessão (web search + páginas + professor)

**Endpoints:** `POST /v1/tenant/{app_id}/study/desktop/start`, `POST .../stop`, `GET .../desktop/{session_id}`, `GET .../desktop/last-report`

### 3.4 Teacher Mode

O AION usa Large Language Models como "professores" para aprender tópicos novos:

- **Ollama** — professor local, gratuito, sempre disponível (modelo padrão: `llama3.2:3b`)
- **APIs externas** — Groq, Gemini, OpenAI como professores fortes, usados quando disponíveis
- **Roteamento automático** — tenta Ollama primeiro, depois API conforme disponibilidade
- **OpenCode** — professor técnico: importa lições técnicas de projetos via Markdown
- **Importação** — `POST /v1/tenant/{app_id}/teach/import` lê arquivos .md com frontmatter e salva como lição
- **Validação** — toda resposta do professor passa pelo cérebro do AION (avaliação de confiança + sanitização de dados sensíveis) antes de ser armazenada

### 3.5 Developer Mode

Modo que transforma o AION em um engenheiro de software assistente:

- **Analyze** — escaneia repositório, detecta stack (Next.js, Python/FastAPI, etc.), lê estrutura de diretórios, package.json e git status, e produz uma análise arquitetural com LLM
- **Plan** — a partir de um objetivo, gera um plano técnico detalhado com prompt formatado para OpenCode
- **Review** — lê git diff e produz revisão de código com sugestões, riscos e padrões detectados
- **Validate** — executa comandos de validação (lint, typecheck, testes) com segurança (bloqueia rm -rf, git reset --hard, etc.)
- **Save Lesson** — salva lições técnicas aprendidas durante o desenvolvimento no cérebro (SQLite + ChromaDB + Obsidian + Sync)

**Endpoints:** `POST /v1/tenant/{app_id}/dev/analyze`, `.../plan`, `.../review`, `.../validate`, `.../save-lesson`

### 3.6 Sync Mode

Sincronização local-first entre o cérebro local (SQLite) e o cérebro morno (Supabase):

- **Enqueue** — toda operação de salvamento (conhecimento, memória, relatório de estudo, lição técnica) enfileira um item de sync
- **Background scheduler** — a cada 15 minutos, o AION tenta enviar itens pendentes para o Supabase
- **Retry** — itens com falha são retentados (com limite de tentativas)
- **Isolamento por inquilino** — cada app_id tem sua própria fila
- **Segurança** — dados sensíveis são bloqueados antes de sair do SQLite

**Endpoints:** `POST /v1/tenant/{app_id}/sync`, `GET .../sync/status`, `POST .../sync/retry-failed`

### 3.7 Rebuild Mode

Recuperação do cérebro a partir de fontes frias ou mornas:

- **Fonte Supabase (warm):** baixa todos os dados do Supabase e recria SQLite + ChromaDB
- **Fonte Obsidian (cold):** lê todos os arquivos .md do vault e recria SQLite + ChromaDB
- **Modo auto:** tenta Supabase primeiro, cai para Obsidian se indisponível
- **Idempotente:** pode ser executado múltiplas vezes sem corromper dados

**Endpoint:** `POST /v1/tenant/{app_id}/rebuild`

### 3.8 Proactive Mode

O AION pode iniciar conversas proativamente, não apenas responder:

- **Tipos de gatilho:** alerta crítico, tarefa atrasada, padrão detectado, briefing diário, pesquisa concluída, novo aprendizado, sugestão de estudo
- **Cooldown:** cada gatilho tem um intervalo mínimo entre disparos para evitar spam
- **Mensagem:** inclui texto, versão TTS, tipo de gatilho, ações sugeridas
- **Consumo:** o app cliente deve chamar `GET /v1/tenant/{app_id}/proactive` periodicamente para verificar se há mensagem

**Endpoint:** `GET /v1/tenant/{app_id}/proactive?user_id=...`

### 3.9 Voice/TTS Mode

Síntese de voz para respostas faladas:

- O Chat Mode já retorna `voice_reply` (texto otimizado para TTS, sem markdown) e `should_speak` (booleano)
- O app pode chamar o endpoint de TTS explicitamente para sintetizar qualquer texto
- **Provedores (por ordem de prioridade):** ElevenLabs → OpenAI TTS → gTTS → none
- **Otimização:** o `voice_reply_builder` reduz o texto para 2 frases, remove markdown e links

**Endpoint:** `POST /v1/tenant/{app_id}/speak`

### 3.10 Briefing Mode

Geração automática de briefing diário matinal:

- **Conteúdo:** resumo de atividades do dia anterior, riscos identificados, insights de padrões, resultados da pesquisa noturna
- **Geração:** chamada LLM que sintetiza todas as fontes em um briefing estruturado
- **Cache:** o briefing é gerado uma vez por dia e armazenado em cache + SQLite
- **Consumo:** o app chama `GET /v1/tenant/{app_id}/briefing` para exibir

### 3.11 Night Research Mode

Pesquisa noturna autônoma:

- **Agendamento:** executada automaticamente às 03:00 via APScheduler
- **Tópicos:** extraídos do conhecimento existente, decisões e log de ações
- **Fluxo:** gera perguntas de pesquisa via LLM → busca web → abre páginas → resume → salva como conhecimento
- **Dedup:** verificação de similaridade vetorial antes de salvar para evitar duplicatas
- **Relatório:** salva relatório da pesquisa no SQLite + Obsidian

### 3.12 Reteaching Mode

Reensino periódico para manter o conhecimento saudável:

- **Health check:** avalia a saúde do conhecimento (quantidade, última atualização)
- **Tópicos fracos:** identifica tópicos com baixa confiança ou desatualizados via LLM
- **Reensino:** gera perguntas e respostas para cada tópico fraco, salva como novo conhecimento
- **Agendamento:** loop configurável via API (padrão: análise a cada ciclo)

---

## 4. Arquitetura do Cérebro (Brain Architecture)

```
┌────────────────────────────────────────────────────────────────────┐
│                        HOT BRAIN (Volátil)                         │
│                                                                    │
│  • Cache de contexto emocional (dict em memória)                   │
│  • Estado de cooldown proativo (dict em memória)                   │
│  • Cache de briefing diário                                        │
│  • Cache de tópicos de pesquisa noturna                            │
│  • Cache de sumário de preflight                                   │
│  • Cache de padrões detectados                                     │
│  • Jobs ativos: rebuild, estudo, desktop study (dicts em memória)  │
│  • Estado dos schedulers APScheduler                               │
│  • RAG context montado por requisição (volátil)                    │
├────────────────────────────────────────────────────────────────────┤
│                       WARM BRAIN (Local-First)                     │
│                                                                    │
│  ┌─────────────────────────────┐  ┌──────────────────────────────┐ │
│  │         SQLite              │  │         ChromaDB             │ │
│  │  (por inquilino)            │  │  (por inquilino)             │ │
│  │                             │  │                              │ │
│  │  memories                   │  │  Coleção: tenant_{app_id}    │ │
│  │  knowledge                  │  │                              │ │
│  │  decisions                  │  │  • add_memory(text)          │ │
│  │  actions_log                │  │  • add_knowledge(text)       │ │
│  │  emotional_states           │  │  • semantic_search(query)    │ │
│  │  study_reports              │  │  • delete_vector(id)         │ │
│  │  study_jobs                 │  │  • cosine_similarity(a, b)   │ │
│  │  sync_queue                 │  │                              │ │
│  │  desktop_study_sessions     │  │  Modelo: SentenceTransformer │ │
│  │  desktop_study_reports      │  │  (all-MiniLM-L6-v2)          │ │
│  │  morning_briefings          │  │                              │ │
│  │  night_research_reports     │  │  Persistência: local/        │ │
│  │  detected_patterns          │  │                              │ │
│  └─────────────────────────────┘  └──────────────────────────────┘ │
│                                                                    │
│  Lock rigoroso: "Nunca abrir duas conexões simultâneas do mesmo   │
│  inquilino." Garantido por asyncio.Lock por tenant.               │
├────────────────────────────────────────────────────────────────────┤
│                      WARM BRAIN (Cloud, Opcional)                  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                       Supabase                                │  │
│  │                                                               │  │
│  │  Tabelas: aion_memories, aion_knowledge, aion_decisions,      │  │
│  │  study_reports, desktop_study_reports, teacher_lessons,       │  │
│  │  dev_lessons, sync_log                                        │  │
│  │                                                               │  │
│  │  Funcionalidades: sync push, pull, search_semantic            │  │
│  │  (via pgvector futuramente)                                   │  │
│  │                                                               │  │
│  │  Contrato: se desabilitado ou offline, nada quebra.           │  │
│  │  Sync continua tentando em background sem afetar chat.        │  │
│  └──────────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────────┤
│                       COLD BRAIN (Auditável)                       │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Obsidian Vault                              │  │
│  │                                                               │  │
│  │  Estrutura: obsidian/{tenant_id}/                              │  │
│  │    ├── memory/{YYYY-MM}/{timestamp}.md                        │  │
│  │    ├── knowledge/{YYYY-MM}/{timestamp}.md                     │  │
│  │    ├── decisions/{YYYY-MM}/{timestamp}.md                     │  │
│  │    ├── actions/{YYYY-MM-DD}.md                                │  │
│  │    ├── study/{YYYY-MM}/{timestamp}.md                         │  │
│  │    ├── study/desktop/{YYYY-MM}/{timestamp}.md                 │  │
│  │    ├── teachers/{YYYY-MM}/{timestamp}.md                      │  │
│  │    ├── dev/{YYYY-MM}/{timestamp}.md                           │  │
│  │    ├── research/{YYYY-MM-DD}.md                               │  │
│  │    └── knowledge/preflight.md                                 │  │
│  │                                                               │  │
│  │  File format: YAML frontmatter + Markdown body                │  │
│  │  Todo .md é: legível por humanos, pesquisável, versionável    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### Fluxo de persistência

```
Learning Engine / Study / Dev / Teacher
    │
    ├──▶ SQLite (sempre) — fonte primária local
    ├──▶ ChromaDB (sempre) — busca semântica
    ├──▶ Obsidian (sempre, se configurado) — backup frio auditável
    └──▶ Sync Queue (sempre) — para eventual push ao Supabase
           │
           └──▶ Supabase (async, background, falha silenciosa)
```

### Fluxo de rebuild

```
Cold (Obsidian) ──▶ Rebuild Mode ──▶ Warm (SQLite + ChromaDB)
Warm (Supabase) ──▶ Rebuild Mode ──▶ Warm (SQLite + ChromaDB)
```

---

## 5. Arquitetura dos Professores (Teacher Architecture)

O AION aprende com múltiplas fontes de "professores", cada uma com características diferentes:

```
┌───────────────────────────────────────────────────────────────┐
│                    TEACHER ARCHITECTURE                       │
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌─────────────────┐ │
│  │   OLLAMA     │    │ APIs Fortes  │    │   WEB SEARCH    │ │
│  │  (Local)     │    │ (Groq/Gemini/│    │  (Biblioteca)   │ │
│  │              │    │  OpenAI)     │    │                 │ │
│  │ • Gratuito   │    │              │    │ • Tavily/DDG/   │ │
│  │ • Sempre ok  │    │ • Preciso    │    │   Wikipedia     │ │
│  │ • Rápido     │    │ • Pago       │    │ • Dados atuais  │ │
│  │ • 3B params  │    │ • Requer chave│   │ • Público       │ │
│  └──────┬───────┘    └──────┬───────┘    └────────┬────────┘ │
│         │                   │                      │          │
│         └───────────┬───────┴──────────┐          │          │
│                     │                  │           │          │
│                     ▼                  ▼           ▼          │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              AION (Aluno/Motor)                         │ │
│  │                                                         │ │
│  │  1. Recebe resposta do professor                        │ │
│  │  2. Avalia confiança                                    │ │
│  │  3. Sanitiza dados sensíveis                            │ │
│  │  4. Resume e salva como conhecimento                    │ │
│  │  5. Persiste em SQLite + ChromaDB + Obsidian + Sync     │ │
│  │  6. Usa depois em RAG context                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              OPENCODE (Professor Técnico)               │ │
│  │                                                         │ │
│  │  • Importa lições de desenvolvimento via .md            │ │
│  │  • Lê frontmatter (título, resumo, tags)               │ │
│  │  • Salva como conhecimento técnico                     │ │
│  │  • Disponível como provedor "opencode" no Teacher Mode │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

### Contrato do Professor

```python
TeacherAnswer(
    provider="ollama" | "groq" | "gemini" | "openai" | "opencode",
    answer=str,           # Conteúdo da resposta
    confidence=float,     # Confiança do professor
    should_save=bool,     # Se o AION deve persistir
    model_used=str        # Modelo específico usado
)
```

### Regras do Aluno (AION)

1. Toda resposta de professor passa por avaliação do cérebro do AION antes de ser salva
2. Dados sensíveis (CPF, senhas, tokens, API keys) são bloqueados na fonte
3. O professor local (Ollama) é sempre tentado primeiro; APIs externas são fallback
4. Se nenhum professor responder, o AION usa seu conhecimento existente
5. Lições do OpenCode têm prioridade alta como conhecimento técnico

---

## 6. Arquitetura do Desenvolvedor (Developer Architecture)

```
┌──────────────────────────────────────────────────────────────┐
│                   DEVELOPER MODE                             │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │ PROJECT READER │  │  SAFETY GUARD  │  │  DEV MODE      │ │
│  │                │  │                │  │  Orchestrator   │ │
│  │ • scan dirs    │  │ • validate     │  │                │ │
│  │ • detect stack │  │   project path │  │ • analyze()    │ │
│  │ • find key     │  │ • block        │  │ • plan()       │ │
│  │   files        │  │   dangerous    │  │ • review()     │ │
│  │ • read package │  │   commands     │  │ • validate()   │ │
│  │   scripts      │  │ • detect       │  │ • save_lesson()│ │
│  │ • git status   │  │   secrets in   │  │ • commit_sum-  │ │
│  │                │  │   code         │  │   mary()       │ │
│  │ Suporte:       │  │ • detect       │  └────────┬───────┘ │
│  │ Next.js,       │  │   sensitive    │           │          │
│  │ Python/FastAPI,│  │   paths        │           │          │
│  │ React, Node.js │  └────────────────┘           │          │
│  └────────────────┘                               │          │
│                                                   │          │
│  ┌────────────────┐  ┌────────────────┐           │          │
│  │  OPENCODE TASK  │  │   VALIDATION   │           │          │
│  │    GENERATOR    │  │    RUNNER      │           │          │
│  │                 │  │                │           │          │
│  │ • build_opencode│  │ • npm run      │           │          │
│  │   _prompt()     │  │   build        │           │          │
│  │ • build_review  │  │ • npm run lint │           │          │
│  │   _prompt()     │  │ • npm run      │           │          │
│  │ • prompt para   │  │   typecheck    │           │          │
│  │   OpenCode CLI  │  │ • pytest       │           │          │
│  └────────────────┘  └────────────────┘           │          │
│                                                   │          │
│                                                   ▼          │
│  ┌──────────────────────────────────────────────────────────┐│
│  │              TECHNICAL LESSONS                           ││
│  │                                                          ││
│  │  O que o Dev Mode aprende durante o desenvolvimento é   ││
│  │  salvo como lição técnica no cérebro:                   ││
│  │  SQLite + ChromaDB + Obsidian + Sync                    ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### Limites de Segurança

1. **`validate_project_path`** — recusa paths que não existem ou estão fora do permitido
2. **`is_sensitive_path`** — bloqueia `.env`, `*.sqlite`, `credentials`, `node_modules`, `.git`
3. **`block_dangerous_command`** — bloqueia `rm -rf`, `git reset --hard`, `npm publish`, `> /dev/sda`, `dd`, `chmod 777`
4. **`check_for_secrets`** — detecta tokens, API keys, senhas em código revisado
5. **`require_confirmation_for_destructive_action`** — exige confirmação para comandos destrutivos
6. **`_sanitize_sensitive`** — remove dados sensíveis de lições técnicas antes de persistir

---

## 7. Modelo de Integração de Apps (App Integration Model)

### Contrato Único

Todo app cliente se comunica com o AION através de um único endpoint principal:

```http
POST /v1/core/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "app_id": "cortex",
  "user_id": "user_abc123",
  "input": "Qual o status do projeto X?",
  "context": {
    "timezone": "America/Sao_Paulo",
    "locale": "pt-BR",
    "session_id": "sess_xyz"
  }
}
```

### Resposta Padrão

```json
{
  "ui_reply": "O projeto X está em desenvolvimento. Atualmente...",
  "voice_reply": "O projeto X está em desenvolvimento.",
  "should_speak": true,
  "available_actions": [
    {"id": "save_memory", "label": "Salvar memória"},
    {"id": "create_task", "label": "Criar tarefa", "params": ["title"]}
  ],
  "follow_up": "Quer que eu estude mais sobre o projeto X?",
  "data": {
    "source": "knowledge",
    "confidence": 0.87,
    "provider": "cache"
  },
  "debug": {
    "intent": "question",
    "gap_type": "stable_knowledge",
    "emotion": "neutral",
    "rag_items": 3,
    "elapsed_ms": 342
  }
}
```

### Por que um contrato único?

- O app **não precisa saber** se a resposta veio do cache, do LLM local ou do professor
- O app **não precisa gerenciar** memória, estudo, sync ou aprendizado
- O app só precisa renderizar o que o AION devolveu
- Se o AION evoluir (novos provedores, novos modos), o app continua funcionando sem mudanças

### Endpoints Especializados

Além do chat, o AION expõe endpoints para operações específicas que os apps podem chamar:

| Endpoint | Quando usar |
|----------|-------------|
| `POST /v1/tenant/{app_id}/study` | Quando o app quer iniciar um estudo autônomo |
| `POST /v1/tenant/{app_id}/teach/ask` | Quando o app quer ensinar algo explicitamente ao AION |
| `POST /v1/tenant/{app_id}/dev/analyze` | Quando o app quer análise de um repositório |
| `GET /v1/tenant/{app_id}/briefing` | Quando o app quer exibir o briefing diário |
| `GET /v1/tenant/{app_id}/proactive` | Quando o app quer verificar mensagens proativas |
| `POST /v1/tenant/{app_id}/speak` | Quando o app precisa sintetizar áudio |
| `GET /v1/tenant/{app_id}/stats` | Quando o app quer métricas do inquilino |

### Mecanismo de Inquilino (Tenant)

- Cada app cliente é um inquilino identificado por `app_id`
- Cada inquilino tem seu próprio banco SQLite, sua própria coleção ChromaDB e seu próprio token de autenticação
- Isolamento total: um inquilino nunca vê dados de outro
- O token é resolvido automaticamente pelo middleware de autenticação a partir do `app_id`

---

## 8. O que pertence ao AION Core

```
┌──────────────────────────────────────────────────────────────┐
│                    AION CORE RESPONSIBILITIES                │
│                                                              │
│  RACIOCÍNIO                                                  │
│  • Pipeline completo de chat (intenção → resposta)           │
│  • RAG context builder                                       │
│  • Decisão de fonte (cache vs LLM)                           │
│  • Síntese de respostas                                      │
│                                                              │
│  MEMÓRIA                                                     │
│  • Armazenamento SQLite (primário)                           │
│  • Busca semântica ChromaDB                                  │
│  • Embeddings (SentenceTransformer)                          │
│  • Cache de contexto emocional                               │
│                                                              │
│  INTENÇÃO                                                    │
│  • Classificação de intenção (regex + LLM)                   │
│  • Detecção de comando vs conversa                           │
│                                                              │
│  APRENDIZADO                                                 │
│  • Knowledge Gap classification (8 tipos)                    │
│  • Learning Engine (LLM → salva → Obsidian)                  │
│  • Self-teaching (preflight)                                 │
│  • Reteaching (periódico)                                    │
│                                                              │
│  ESTUDO                                                      │
│  • Study mode (manual + auto)                                │
│  • Desktop study agent (sessões longas)                      │
│  • Teacher adapters (Ollama, APIs, OpenCode)                 │
│  • Web research (Tavily, DDG, Wikipedia)                     │
│  • Night research (agendado)                                 │
│  • Research on demand                                        │
│                                                              │
│  SINCRONIA                                                   │
│  • Sync queue (local-first)                                  │
│  • Cloud sync (Supabase push)                                │
│  • Sync scheduler (background a cada 15 min)                 │
│                                                              │
│  DEV PLANNING                                                │
│  • Project reader (stack detection)                          │
│  • Dev mode (analyze, plan, review, validate)                │
│  • OpenCode task generator                                   │
│  • Technical lessons                                         │
│                                                              │
│  RESPOSTA ESTRUTURADA                                        │
│  • AionResponse (ui_reply, voice_reply, actions, etc.)       │
│  • Response formatter                                        │
│  • Voice reply builder (TTS optimization)                    │
│  • TTS engine (ElevenLabs / OpenAI / gTTS)                   │
│                                                              │
│  FERRAMENTAS                                                 │
│  • Tool registry (create_task, save_memory, web_search)      │
│  • Validação de parâmetros (Pydantic)                        │
│  • Timeout handling                                          │
│  • Audit logging                                             │
│                                                              │
│  POLÍTICAS DE SEGURANÇA                                      │
│  • Autenticação (Bearer token por inquilino)                 │
│  • Rate limiting (100 req/min/inquilino)                     │
│  • Filtro de dados sensíveis (CPF, senhas, tokens)          │
│  • Path traversal prevention                                 │
│  • Sanitização de conteúdo (XSS, scripts)                    │
│  • Comandos perigosos bloqueados (Dev Mode)                  │
│  • Captcha/paywall detection (browser research)              │
│                                                              │
│  PERSONALIDADE                                               │
│  • Identidade do AION (core identity + hard rules)           │
│  • System prompt builder (dinâmico por contexto)             │
│  • Emotional memory (detecção + snapshots + tendência)       │
│  • Proactive engine (disparo + cooldown)                     │
│                                                              │
│  ANÁLISE                                                     │
│  • Pattern detector (7 algoritmos)                           │
│  • Morning briefing (síntese diária)                         │
│  • Knowledge health check                                    │
│  • Tenant stats                                              │
│                                                              │
│  RECUPERAÇÃO                                                 │
│  • Rebuild mode (Supabase → SQLite ou Obsidian → SQLite)    │
│  • Obsidian writer (10 tipos de arquivo)                    │
│  • Obsidian reader (frontmatter parser)                     │
└──────────────────────────────────────────────────────────────┘
```

---

## 9. O que pertence aos Apps

```
┌──────────────────────────────────────────────────────────────┐
│                    APP CLIENT RESPONSIBILITIES               │
│                                                              │
│  INTERFACE                                                   │
│  • UI/UX de conversa                                         │
│  • Layout e componentes visuais                              │
│  • Botões e controles                                        │
│  • Renderização de markdown/texto                            │
│  • Indicadores de digitação ("..." enquanto AION processa)   │
│                                                              │
│  EXPERIÊNCIA                                                 │
│  • Tema, cores, identidade visual                            │
│  • Fluxo de telas e navegação                                │
│  • Animações e transições                                    │
│  • Responsividade (mobile/desktop)                           │
│                                                              │
│  INTERAÇÕES ESPECÍFICAS DO DOMÍNIO                           │
│  • Regras de negócio do app (ex: agendamento no Cortex)      │
│  • Dados específicos do domínio do app                       │
│  • Integrações próprias do app (Firebase, WebSocket, etc.)   │
│                                                              │
│  EXECUÇÃO VISUAL                                             │
│  • Exibir ações disponíveis como botões                      │
│  • Reproduzir áudio (TTS)                                    │
│  • Mostrar follow-up como sugestão de clique                 │
│  • Exibir debug info (se modo desenvolvedor ativo)           │
│  • Gerenciar estado de "mensagem proativa recebida"          │
│                                                              │
│  OBS: O app nunca precisa:                                   │
│  • Gerenciar banco de dados de memória                      │
│  • Chamar LLM diretamente                                    │
│  • Decidir o que aprender                                    │
│  • Sincronizar dados com a nuvem                             │
│  • Gerenciar autenticação de LLM providers                  │
│  • Saber qual provider foi usado                            │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. Central de Controle (Control Center)

*A Central de Controle é o painel futuro que consolida a operação do AION. Segue a visão de design e funcionalidades planejadas.*

### Visão Geral

```
┌──────────────────────────────────────────────────────────────┐
│                    AION CONTROL CENTER                       │
│                    Status Dashboard                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  PROVEDORES   │  │  JOBS ATIVOS │  │   INQUILINOS       │ │
│  │              │  │              │  │                    │ │
│  │ ● Groq    ok │  │ Study   2    │  │ ● cortex          │ │
│  │ ● Gemini  ok │  │ Desktop 1   │  │ ● natuforce       │ │
│  │ ● OpenAI  ok │  │ Sync    0   │  │ ● whatsapp_bot    │ │
│  │ ● Ollama  ok │  │ Rebuild 0   │  │ ● dev_proj_x      │ │
│  │ ● Mock   ativo│ │ Reteach 0   │  │                    │ │
│  └──────────────┘  └──────────────┘  └────────────────────┘ │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │  CÉREBRO      │  │    SYNC      │  │   ESTUDO           │ │
│  │              │  │              │  │                    │ │
│  │ SQLite    ok │  │ Queue   12   │  │ Último: hoje 09:00 │ │
│  │ ChromaDB  ok │  │ Pending 3   │  │ Tópicos: 5         │ │
│  │ Obsidian  ok │  │ Failed  0   │  │ Status: concluído  │ │
│  │ Supabase  -  │  │ Synced  9   │  │ Confiança: 0.82    │ │
│  └──────────────┘  └──────────────┘  └────────────────────┘ │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  ATIVIDADE RECENTE                                    │   │
│  │                                                       │   │
│  │  09:15:23  cortex  Chat concluído (237ms, cache)      │   │
│  │  09:14:50  cortex  Estudo: "Machine Learning" salvo   │   │
│  │  09:12:00  cortex  Teacher: Ollama respondeu          │   │
│  │  09:10:30  cortex  Sync: 3 itens enviados ao Supabase │   │
│  │  09:08:00  dev_x   Dev: analyze concluída             │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Indicadores Planejados

| Indicador | Fonte | Descrição |
|-----------|-------|-----------|
| Saúde dos providers | `llm/factory.py` | Status de cada provedor LLM (groq, gemini, openai, ollama, mock) |
| Jobs ativos | `dicts em memória` | `STUDY_JOBS`, `ACTIVE_DESKTOP_STUDY`, `REBUILD_JOBS` |
| Fila de sync | `sync_queue` | Total, pending, failed, synced por inquilino |
| Sessões de estudo | `study_reports` | Último relatório, tópicos, confiança |
| Status Obsidian | `obsidian/writer.py` | Vault configurado? Caminho válido? |
| Status Supabase | `supabase_store.py` | Habilitado? Conexão OK? |
| Status Ollama | `llm/providers/ollama.py` | Online? Modelo carregado? |
| Status Dev Mode | `dev/dev_mode.py` | Sessão ativa? Última análise? |
| Atividade recente | `actions_log` | Feed em tempo real das ações do AION |
| Conhecimento por inquilino | `sqlite_store` | Total de memórias, conhecimentos, decisões |

---

## 11. Princípios Permanentes

### Local-First

O SQLite é a fonte primária e única verdade. Toda operação de leitura e escrita passa primeiro pelo SQLite. O AION funciona 100% offline. A nuvem é um espelho, não uma dependência.

### Cloud-Sync Depois

A sincronização com a nuvem (Supabase) é assíncrona, em background e não-bloqueante. Se o Supabase estiver fora do ar, o AION continua funcionando. Os itens aguardam na fila local e são enviados quando a conexão for restabelecida.

### Nunca Depender da Nuvem Para Aprender

O aprendizado do AION nunca depende de conexão com a nuvem. O professor local (Ollama) e o conhecimento existente são sempre suficientes para operação básica. APIs externas são aceleração, não necessidade.

### Nunca Salvar Secrets

Dados sensíveis — CPF, cartão de crédito, senhas, tokens de API, chaves privadas — são detectados e bloqueados em múltiplas camadas antes de qualquer persistência:
1. Filtro no `sync_queue` antes de enfileirar
2. Filtro no `study_mode` antes de salvar resultado
3. Filtro no `supabase_store` antes de enviar à nuvem
4. Filtro no `knowledge_gap` na classificação de entrada
5. Filtro no `safety_guard` durante revisão de código

### Nunca Quebrar Chat por Falha de Estudo/Sync

Se o estudo falhar, o chat continua. Se o sync falhar, o chat continua. Se o professor não responder, o chat continua. Se o Obsidian estiver indisponível, o chat continua. O chat é a operação crítica número 1. Nada pode quebrá-lo.

### Nunca Automatizar Login/Captcha/Paywall

O browser research detecta páginas de login, captcha e paywall e aborta automaticamente com segurança. O AION nunca tenta fazer login, resolver captcha ou contornar paywalls.

### Apps Consomem o AION, Não o Contrário

O AION não sabe e não precisa saber qual app o está consumindo. O contrato é um POST com JSON. O app é responsável por sua UI, suas rotas e sua experiência. O AION é responsável pelo raciocínio, memória e decisão.

### O AION Aprende Com o Uso

Cada interação no Chat Mode é uma oportunidade de aprendizado. O pipeline de lacuna de conhecimento classifica cada entrada e decide se deve salvar como memória pessoal, decisão de projeto, conhecimento estável, informação fresca, etc. Com o tempo, o AION fica mais inteligente porque foi mais usado — não porque foi mais programado.

---

## 12. Roadmap Pós-P10

### Control Center (Prioridade Alta)

Painel web para monitorar a operação do AION em tempo real:
- Dashboard de status com todos os indicadores da seção 10
- Visualização dos jobs ativos
- Logs de atividade por inquilino
- Controles manuais (trigger sync, trigger study, trigger rebuild)
- Configuração visual de providers, professores e schedules

### Dev Mode v2

- Suporte a mais stacks (Java/Spring, Go, Rust, PHP/Laravel)
- Análise comparativa entre branches
- Integração contínua: gerar PR description automaticamente
- Sugestão automática de refatoração com base em padrões detectados
- Modo "pair programming": o AION sugere mudanças enquanto o desenvolvedor codifica

### Supabase pgvector Provider

- Migrar busca semântica do ChromaDB para pgvector no Supabase
- Permitir busca semântica unificada entre dispositivos
- Manter ChromaDB como fallback local quando offline

### AION Desktop Runtime

- Aplicação desktop standalone (Electron/Tauri)
- Não precisa de Next.js, Firebase ou Vercel
- O AION Core roda embutido no processo desktop
- Interface nativa com os mesmos contratos

### AION App SDK

- SDK para facilitar a criação de novos apps clientes
- Tratamento automático de autenticação
- Cliente HTTP com tipagem para todos os endpoints
- Handler para mensagens proativas
- Componentes UI reutilizáveis

### AION Native/Local Server

- Build nativo (PyInstaller ou Nuitka) do AION Core
- Distribuição como executável único sem dependência Python
- Instalação com um comando
- Modo headless para servidores

### Fine-Tuning Dataset Exporter

- Exportar o conhecimento acumulado (SQLite + ChromaDB) como dataset de fine-tuning
- Formato: perguntas e respostas extraídas do conhecimento do AION
- Preparação para fine-tuning de modelos locais (Ollama, Llama.cpp)
- O AION treina seu próprio professor

---

*Este documento é a doutrina oficial da arquitetura do AION Intelligence OS. Deve ser revisado e atualizado a cada nova fase do projeto.*
