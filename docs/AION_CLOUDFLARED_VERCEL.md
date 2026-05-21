# AION Core Local + Cloudflared + Cortex na Vercel

Modo temporário de teste: AION Core roda no seu PC, exposto via cloudflared,
e o Cortex publicado na Vercel consome essa URL pública.

```
Browser/Vercel → /api/aion/stream → cloudflared → AION Core (127.0.0.1:8000)
                 server-side proxy          tunnel    seu PC
```

## Pré-requisitos

- Python 3.11+ com virtualenv ativado em `aion-core/.venv/`
- Node.js 18+
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) instalado e no PATH
- Conta na [Vercel](https://vercel.com) com o Cortex já publicado (ou deploy fresh)

## Passo a passo

### 1. Iniciar o AION Core local

**Windows (cmd):**
```cmd
start-aion-core.bat
```

**Git Bash / Linux / macOS:**
```bash
./scripts/start-aion-core.sh
```

**Manual:**
```bash
cd aion-core
source .venv/Scripts/activate
PYTHONPATH=src python -m uvicorn aion.main:app --host 127.0.0.1 --port 8000 --reload
```

**Verificar:**
```bash
curl http://127.0.0.1:8000/health
# {"status":"ok","version":"1.0.0",...}
```

### 2. Iniciar o cloudflared

**Windows (cmd):**
```cmd
start-aion-tunnel.bat
```

**Git Bash / Linux / macOS:**
```bash
./scripts/start-aion-tunnel.sh
```

**Manual:**
```bash
cloudflared tunnel --url http://127.0.0.1:8000
```

O cloudflared exibirá algo como:
```
2026/05/21 22:30:00 URL https://blue-cat-123.trycloudflare.com
```

Copie essa URL (ex: `https://blue-cat-123.trycloudflare.com`).

### 3. Testar o túnel

```bash
./scripts/test-cloudflared-url.sh https://blue-cat-123.trycloudflare.com
```

O script testa:
- `GET /health` — deve retornar 200
- `POST /v1/core/chat` — deve responder com `ui_reply`

### 4. Configurar a Vercel

No dashboard da Vercel (`https://vercel.com/SEU-PROJETO/settings/environment-variables`),
adicione estas variáveis:

| Name | Value |
|------|-------|
| `AION_CORE_URL` | `https://blue-cat-123.trycloudflare.com` |
| `AION_CORE_API_KEY` | `supersecret-cortex-token` |

> **NÃO** use `NEXT_PUBLIC_` para essas variáveis — elas são usadas apenas
> server-side pelas API routes (`/api/aion/stream`, `/api/aion`, `/api/aion/health`).
> `NEXT_PUBLIC_AION_CORE_API_KEY` exporia a chave no bundle do navegador.

### 5. Redeploy na Vercel

- Vá em **Deployments**, clique em "..." no último deploy e selecione **Redeploy**.
- Ou faça um novo `git push` (se estiver com CI ativada).

### 6. Testar a integração

```bash
curl https://SEU-PROJETO.vercel.app/api/aion/health
# {"status":"ok","source":"core"}
```

Se retornar `{"status":"ok","source":"core"}`, o Cortex está chamando o Core via cloudflared.

### 7. Enviar uma mensagem

```bash
curl -X POST https://SEU-PROJETO.vercel.app/api/aion \
  -H "Content-Type: application/json" \
  -d '{"message":"quem é o técnico da seleção brasileira?"}'
```

Fluxo esperado:
1. Cortex recebe a requisição na Vercel
2. `POST /api/aion` chama `callCoreChat()` (server-side)
3. `coreProxy.ts` faz `fetch(AION_CORE_URL/v1/core/chat)` via cloudflared
4. AION Core local responde
5. Resposta volta pela Vercel para o cliente

Para ver confirmar no terminal do AION Core:
```
POST /v1/core/chat
```

## Limitações

1. **Temporário**: só funciona enquanto seu PC, AION Core e cloudflared estiverem ligados.
2. **Latência**: cloudflared adiciona ~100-300ms por requisição.
3. **Sem Volumes**: dados do Core (SQLite, ChromaDB) ficam no seu PC; se o PC desligar, o estado não persiste na nuvem.
4. **IP Dinâmico**: a URL do cloudflared muda cada vez que o túnel reinicia; precisa atualizar na Vercel.
5. **Rate Limit**: cloudflared gratuito tem limites de conexão simultânea.
6. **HTTPS**: cloudflared fornece TLS automaticamente.
7. **Fallback local**: se o Core estiver offline, o Cortex cai para o fallback local na Vercel (respostas sem dados atuais).

## Scripts disponíveis

| Script | Função |
|--------|--------|
| `start-aion-core.bat` | Inicia AION Core (Windows) |
| `start-aion-tunnel.bat` | Inicia cloudflared (Windows) |
| `scripts/start-aion-core.sh` | Inicia AION Core (Git Bash / Linux / macOS) |
| `scripts/start-aion-tunnel.sh` | Inicia cloudflared (Git Bash / Linux / macOS) |
| `scripts/test-cloudflared-url.sh` | Testa URL pública do cloudflared |

## Segurança

- A chave `AION_CORE_API_KEY` trafega entre Vercel e cloudflared → Core.
- O cloudflared expõe o Core publicamente. Qualquer um com a URL pode tentar
  acessar, mas sem o token (enviado apenas pelo servidor Vercel) não conseguem
  chamar `/v1/core/chat`.
- Nunca commitar a URL temporária do cloudflared.
- Nunca usar `NEXT_PUBLIC_AION_CORE_API_KEY` — ela vaza a chave para o navegador.
