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

## Firebase como camada de dados primária

O Cortex pode usar **Firebase Firestore** como camada de dados primária, com localStorage como cache local e Obsidian como backup/export.

### Arquitetura

```
Command Center / Views
        │
        ▼
  Storage Provider (lib/storageProvider.ts)
        │
        ├── localStorage (cache local síncrono)
        ├── Firebase/Firestore (cloud, auth obrigatório)
        └── Obsidian REST API (backup/export híbrido)
```

### Modos de armazenamento

| Modo | Descrição |
|------|-----------|
| `local` | Apenas localStorage (comportamento padrão) |
| `firebase` | Firebase como primário, localStorage como cache |
| `hybrid` | Firebase + localStorage + Obsidian simultaneamente |

### Configuração

1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com)
2. Ative **Authentication** → Google provider
3. Ative **Firestore Database** em modo de teste (ou produza com as regras em `firebase/firestore.rules`)
4. Copie as credenciais do Web SDK e adicione ao `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=xxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=xxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=xxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=xxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=xxx
NEXT_PUBLIC_FIREBASE_APP_ID=xxx
```

5. Faça login com Google no Cortex (Configurações → Firebase Sync)
6. Escolha o modo de armazenamento e clique em **Migrar registros locais para Firebase**

### Regras do Firestore

O arquivo `firebase/firestore.rules` garante que cada usuário só acesse sua própria subcoleção.

### Provider de armazenamento

Todas as operações de escrita passam pelo `lib/storageProvider.ts`, que:
- Salva sempre no **localStorage** primeiro (leitura instantânea)
- Se Firebase estiver configurado e logado: envia para o **Firestore**
- Se modo **híbrido**: também salva no **Obsidian vault** via REST API

Funções expostas:
- `saveRecord(record)` — salva em todas as camadas ativas
- `updateRecord(id, patch)` — atualiza em todas as camadas
- `deleteRecord(id)` — remove de todas as camadas
- `migrateLocalToFirebase()` — envia localStorage → Firestore
- `pullFromFirebase()` — importa Firestore → localStorage
- `getCurrentMode()`, `setStorageMode(mode)` — controle do modo

### Próximo passo

Integração direta entre Cortex e o vault Obsidian — via sincronização com pastas locais ou Git.
Sincronização bidirecional (Cortex → Obsidian e Obsidian → Cortex).

## Build

```bash
npm run build
npm run lint
```
