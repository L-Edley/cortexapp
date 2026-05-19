# P7.0 — Supabase Foundation do Cortex

Este documento detalha o design, segurança e estrutura de integração da camada **Supabase** instalada como fundação segura de sincronização na nuvem para o ecossistema Cortex/Aion.

---

## 1. Princípio de Arquitetura: Local-First Preservado

A inserção da fundação Supabase segue rigidamente o princípio **Local-First / Offline-First**:
1. **O LocalDB (IndexedDB via Dexie) continua sendo a fonte primária da verdade**: Nenhuma operação direta de UI ou de raciocínio do Aion (`reason()`) depende da nuvem para leitura ou escrita.
2. **Resiliência a Falhas e Ausência de Rede**: Caso o usuário esteja desconectado ou as credenciais do Supabase não estejam preenchidas, a aplicação opera integralmente em modo **local-only** sem qualquer quebra ou degradação na experiência do cockpit.
3. **Lazy Initialization**: Os clientes do Supabase são inicializados sob demanda, impedindo instanciacões precoces ou quebras em tempo de compilação.

---

## 2. Variáveis de Ambiente

As seguintes variáveis de ambiente foram mapeadas em `.env.example` e devem ser configuradas para ativar a comunicação com a nuvem:

```bash
# Supabase (opcional - Fase 7)
NEXT_PUBLIC_SUPABASE_URL=            # URL do seu projeto Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # Chave anônima pública (segura para o navegador)
SUPABASE_SERVICE_ROLE_KEY=           # Chave administrativa privada (server-only)
```

---

## 3. Segurança e Isolamento (Público vs. Server-Only)

Para manter a segurança de nível industrial, dividimos a inicialização em duas frentes hermeticamente separadas:

### 3.1 Cliente do Navegador (Client-side)
*   **Arquivo**: [`lib/supabase/client.ts`](file:///c:/Users/edley/Downloads/c%C3%B3rtex-operacional%20%281%29/lib/supabase/client.ts)
*   **Segurança**: Importa apenas as variáveis públicas `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
*   **Comportamento**: Retorna a instância do cliente Supabase. Se as variáveis de ambiente públicas estiverem ausentes, ele retorna `null` **silenciosamente**, exibindo apenas um aviso amigável no console de depuração e **nunca** lançando exceções fatais que possam quebrar a renderização da interface React.
*   **Service Role Key**: O arquivo **nunca** importa ou consome a chave administrativa `SUPABASE_SERVICE_ROLE_KEY`.

### 3.2 Cliente do Servidor (Server-side Only)
*   **Arquivo**: [`lib/supabase/server.ts`](file:///c:/Users/edley/Downloads/c%C3%B3rtex-operacional%20%281%29/lib/supabase/server.ts)
*   **Segurança**: Protegido com o pacote `import "server-only"` e verificação explícita `typeof window !== "undefined"`.
*   **Comportamento**: Lança uma exceção impeditiva imediatamente se houver qualquer tentativa de importá-lo no bundle enviado ao navegador do usuário.
*   **Service Role Key**: Consome de forma restrita a chave administrativa `SUPABASE_SERVICE_ROLE_KEY`, que ignora as regras de segurança RLS (Row Level Security) do Postgres para execução rápida de lotes de sincronização a partir de API Routes do Next.js.

---

## 4. Estrutura de Tipos (TypeScript)

As entidades de dados de sincronização foram estritamente mapeadas em [`lib/supabase/types.ts`](file:///c:/Users/edley/Downloads/c%C3%B3rtex-operacional%20%281%29/lib/supabase/types.ts), preparando o ecossistema para o push/pull sem exigir transformações ou mapeamentos pesados de dados locais:

1.  **`SupabaseRecord`**: Mapeamento completo dos dados de notas e eventos (Tasks, Expenses, Ideas, etc.), mantendo a compatibilidade direta com `CortexRecord`.
2.  **`SupabaseMemory`**: Entidade de aprendizado cognitivo e fatos aprendidos pelo cérebro do Aion (`AionBrainItem`).
3.  **`SupabaseProfile`**: Snapshot sincronizável do perfil estratégico do usuário (`AionProfile`).
4.  **`SupabaseSyncQueueItem`**: Representação de fila de sincronização de pendências locais acumuladas offline.
5.  **`SupabaseDevice`**: Registro de metadados dos dispositivos ativos do usuário (Mobile, Desktop, Web).
6.  **`SupabaseSyncLog`**: Log de auditoria matemática dos pacotes trafegados de push/pull e conflitos resolvidos.

Todas as entidades expõem variantes do tipo base para cenários de inserção (`Insert`) e atualização (`Update`).

---

## 5. Status e Validação da Fundação (Health Check)

Utilidades seguras e de telemetria foram implementadas em [`lib/supabase/config.ts`](file:///c:/Users/edley/Downloads/c%C3%B3rtex-operacional%20%281%29/lib/supabase/config.ts):

*   **`isSupabaseConfigured(): boolean`**: Retorna se o cliente público está elegível para comunicação (URL + Anon Key preenchidos).
*   **`getSupabaseStatus(): SupabaseStatus`**: Retorna o status detalhado das variáveis de ambiente de forma segura, informando apenas a presença (`true` / `false`) das credenciais sem expor nenhuma informação real ou substrings das chaves.

---

## 6. Próximos Passos (Entregável P7.1 — Cloud Sync Engine)

Com a fundação estruturada, segura e 100% blindada por testes unitários, os próximos passos lógicos serão:

1.  **Dexie Sync Queue Table**: Evolução da base do Dexie local para incluir a tabela local `syncQueue`.
2.  **Local Sync Queue Adapter**: Implementação do `LocalAdapter` em `lib/sync/localAdapter.ts` para ler/escrever pendências locais na fila do Dexie.
3.  **Supabase Sync Adapter**: Implementação do `SupabaseAdapter` em `lib/sync/supabaseAdapter.ts` para lidar com requisições em lote de push/pull de dados.
4.  **Conflict Resolution Engine (LWW)**: Motor simples de "Last-Writer-Wins" baseado na marca temporal `updated_at`.
5.  **Sync Engine Orchestrator**: Orquestração assíncrona bidirecional (non-blocking) acionada automaticamente a cada modificação local (com debounce de 2s) ou manualmente através de botão visual no Cockpit.
