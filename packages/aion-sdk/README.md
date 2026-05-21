# @aion/sdk

SDK TypeScript do **AION Intelligence Core** — motor de IA autônomo, headless e multi-tenant.

## Instalação

```bash
npm install @aion/sdk
```

> React é opcional — o hook `useAion` só funciona se React estiver instalado.

## Uso básico (Node.js / Browser)

```typescript
import { AionClient } from "@aion/sdk";

const aion = new AionClient({
  baseUrl: "http://localhost:8000",
  appId: "cortex",
  apiKey: "seu-token-aqui",
  timeout: 10_000,
  fallback: false,
});

// Chat
const res = await aion.chat("Qual a previsão do tempo?", "user-123");
console.log(res.ui_reply);

// Verificar disponibilidade
const available = await aion.isAvailable();
console.log("Core online?", available);

// Estatísticas do tenant
const stats = await aion.getTenantStats();
console.log("Memórias:", stats.memories);

// Saúde do conhecimento
const health = await aion.getKnowledgeHealth();
console.log("Conhecimento saudável:", health.healthy_count);

// Gatilho de re-ensino
const result = await aion.triggerReteach("Minha app");
console.log(result.status); // "accepted"
```

## Modo fallback

Com `fallback: true`, o SDK não lança exceções se o core estiver offline — retorna uma resposta vazia com `status: "fallback"`.

```typescript
const aion = new AionClient({
  baseUrl: "http://localhost:8000",
  appId: "cortex",
  apiKey: "token",
  fallback: true,
});

const res = await aion.chat("oi", "user-1");
if (res.status === "fallback") {
  console.log("Core offline, exibindo UI padrão");
}
```

## Hook React

```tsx
import { useAion } from "@aion/sdk";

function ChatBox() {
  const { chat, isLoading, lastResponse, error } = useAion({
    baseUrl: "http://localhost:8000",
    appId: "cortex",
    apiKey: "token",
  });

  async function handleSend(msg: string) {
    const res = await chat(msg, "user-1");
    console.log(res.ui_reply);
  }

  return (
    <div>
      {isLoading && <p>Processando...</p>}
      {error && <p style={{ color: "red" }}>{error.message}</p>}
      {lastResponse && <p>{lastResponse.ui_reply}</p>}
      <button onClick={() => handleSend("Olá!")}>Enviar</button>
    </div>
  );
}
```

## API

### `AionClient`

| Método                        | Descrição                                      |
|-------------------------------|------------------------------------------------|
| `chat(input, userId, ctx?)`   | Envia mensagem ao motor de IA                  |
| `isAvailable()`               | Verifica se o core está online                 |
| `getTenantStats()`            | Estatísticas do tenant (memórias, decisões…)   |
| `getKnowledgeHealth()`        | Saúde do conhecimento (expirados, baixa conf.) |
| `triggerReteach(description?)`| Dispara re-ensino em background                |

### `useAion(config)`

| Retorno        | Descrição                                    |
|----------------|----------------------------------------------|
| `chat`         | Função para enviar mensagens                 |
| `isAvailable`  | Função para verificar disponibilidade        |
| `isLoading`    | `true` enquanto uma requisição está em curso |
| `lastResponse` | Última resposta recebida                     |
| `error`        | Último erro capturado                        |

## Desenvolvimento

```bash
npm install
npm test        # vitest run
npm run build   # tsc
```
