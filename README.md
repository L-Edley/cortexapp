# Cortex

Motor de organização pessoal, financeira e estratégica — com IA local.

## Stack

- **Framework:** Next.js App Router (React 19)
- **IA:** Aion — classificador inteligente integrado
- **Estilo:** Tailwind CSS v4 + Lucide icons
- **Persistência:** localStorage + Obsidian vault (opcional via REST API)
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

### Obsidian Local REST API

O Cortex pode escrever registros diretamente no vault Obsidian via plugin `obsidian-local-rest-api`.

#### Configuração

1. No Obsidian, instale o plugin **Local REST API** (Community Plugins)
2. Ative o plugin em **Settings → Community Plugins → Local REST API**
3. Copie a **API Key** gerada pelo plugin
4. No Cortex, crie `.env.local`:

```env
NEXT_PUBLIC_OBSIDIAN_REST_ENABLED=true
NEXT_PUBLIC_OBSIDIAN_REST_URL=http://127.0.0.1:27123
NEXT_PUBLIC_OBSIDIAN_API_KEY=sua-chave-aqui
```

5. Reinicie o servidor do Cortex (`npm run dev`)
6. Vá em **Configurações → Obsidian Vault Sync** e clique **Testar**

#### Como funciona

- Se o Obsidian REST estiver configurado e online:
  - cada registro salvo vai para o **localStorage** + **vault** simultaneamente
- Se estiver offline ou desabilitado:
  - tudo continua funcionando apenas com localStorage
- Em **Configurações**, é possível sincronizar todos os registros locais existentes para o vault manualmente

#### Aviso

> A API key do Obsidian REST fica exposta no frontend (`NEXT_PUBLIC_`). Isso é aceitável apenas porque o plugin roda exclusivamente em `127.0.0.1` (localhost). **Não use essa configuração em ambiente público ou hospedado.**
>
> Em deploy na Vercel ou similar, a conexão com `127.0.0.1` não funcionará devido a restrições de rede/CORS. Para uso com Obsidian, rode o Cortex localmente com `npm run dev`.
>
> No futuro, considerar Tauri ou Electron para acesso local mais robusto ao vault.

### Próximo passo

Integração direta entre Cortex e o vault Obsidian — via sincronização com pastas locais ou Git.
Sincronização bidirecional (Cortex → Obsidian e Obsidian → Cortex).

## Build

```bash
npm run build
npm run lint
```
