# Cortex

Motor de organização pessoal, financeira e estratégica — com IA local.

## Stack

- **Framework:** Next.js App Router (React 19)
- **IA:** Aion — classificador inteligente integrado
- **Estilo:** Tailwind CSS v4 + Lucide icons
- **Persistência:** localStorage (sem banco externo)
- **PWA:** Suporte offline com service worker

## Como rodar

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Como testar sem IA real

O mock local já é o padrão. Basta rodar `npm run dev` e usar o Command Center.

Exemplos de entrada:
- "Gastei R$32 no almoço"
- "Ideia: criar agente SDR para negócios locais"
- "Preciso revisar o dashboard amanhã"
- "Estou travado, o que faço agora?"

O mock classifica por palavras-chave e os registros são salvos no navegador.

## Como configurar IA depois

Crie um arquivo `.env.local` na raiz:

```env
AI_PROVIDER=openai
AI_API_KEY=sua-chave-aqui
AI_BASE_URL=
AI_MODEL=gpt-4o-mini
```

Providers suportados:
- `mock` (padrão, sem chave necessária)
- `openai` (qualquer API compatível com OpenAI)
- `gemini` (Google Gemini)

## Como funciona o localStorage

Todas as entradas são salvas no navegador em `cortex_records`.

Funções disponíveis em `lib/storage.ts`:
- `getRecords()` — lista todos os registros
- `saveRecord(record)` — salva um registro
- `updateRecord(id, patch)` — atualiza parcialmente
- `deleteRecord(id)` — remove um registro
- `clearRecords()` — limpa tudo
- `getRecordsByType(type)` — filtra por tipo
- `getTodaysRecords()`, `getSpentToday()`, `getTopPendingTasks()` — consultas auxiliares

Para limpar os dados, vá em **Configurações → Limpar dados locais**.

## Obsidian como cérebro central

O Cortex pode exportar todos os registros como Markdown compatível com Obsidian.

Nesta etapa, os dados ainda ficam no **localStorage**. A exportação gera arquivos `.md` prontos para
um vault Obsidian — sem escrever diretamente no disco ainda.

### Como exportar

Vá em **Configurações → Obsidian Export** e escolha:

- **Exportar todos os registros** — baixa um `.md` com todos os registros formatados
- **Exportar Dashboard.md** — visão geral com blocos Dataview
- **Exportar nota diária de hoje** — nota no formato `Daily/YYYY-MM-DD.md`
- **Copiar estrutura recomendada do vault** — README com pastas e plugins

### Estrutura do vault

```
vault/
├── Daily/          — Notas diárias e pedidos de foco
├── Financeiro/     — Gastos e despesas
├── Ideias/         — Ideias em quarentena
├── Inbox/          — Registros não classificados
├── ProjectNotes/   — Notas de projetos
├── Tarefas/        — Tarefas pendentes e concluídas
├── Dashboard.md    — Visão geral com Dataview
```

### Plugins recomendados para Obsidian

- **Dataview** — Consultas SQL-like nas notas
- **Tasks** — Gerenciamento de tarefas com checkboxes
- **Periodic Notes** — Criação automática de notas diárias
- **Templater** — Templates avançados
- **Obsidian Git** — Versionamento do vault (próxima etapa)

### Próximo passo

Integração direta entre Cortex e o vault Obsidian — via sincronização com pastas locais ou Git.

## Build

```bash
npm run build
npm run lint
```
