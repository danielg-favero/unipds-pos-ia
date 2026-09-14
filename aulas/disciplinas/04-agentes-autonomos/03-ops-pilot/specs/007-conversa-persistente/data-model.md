# Data Model: Conversa Persistente

## Entities

### Conversation

Sem tabela própria (ver [research.md](./research.md) §1) — identificada apenas por `id: string`
(UUID gerado por `create()`). Uma conversa "existe" no sentido prático assim que a primeira mensagem é
gravada nela; um id sem mensagens tem histórico vazio, indistinguível de um id inexistente.

### Message

| Campo             | Tipo                        | Notas                                                            |
|--------------------|-----------------------------|-------------------------------------------------------------------|
| `id`               | `number` (autoincrement)    | Ordena as mensagens dentro de uma conversa; não exposto na API   |
| `conversationId`   | `string`                    | FK lógica — id gerado por `ConversationStore.create()`           |
| `role`             | `"user" \| "assistant"`     | Autor da mensagem                                                 |
| `content`          | `string`                    | Texto da mensagem, sem tamanho máximo imposto pela feature        |
| `createdAt`        | `string` (ISO 8601)         | Momento de gravação, atribuído pelo store                         |

**Validation rules**:
- `role` restrito a `"user" | "assistant"` (CHECK no SQLite; união de tipo no fake/TypeScript).
- `content` não pode ser string vazia (mesma regra de `message` em `chatRequestSchema` para o lado do
  usuário; respostas do assistente que forem vazias — resposta parcial — simplesmente não são
  gravadas, ver Edge Cases do spec).

**State transitions**: nenhuma — mensagens são apenas append-only, nunca editadas ou removidas por
esta feature.

## Port: `ConversationStore`

```ts
export type ConversationRole = "user" | "assistant";

export type ConversationMessage = {
  readonly role: ConversationRole;
  readonly content: string;
};

export interface ConversationStore {
  /** Gera um novo identificador de conversa. Não grava nada até o primeiro `append`. */
  create(): Promise<string>;
  /** Acrescenta uma mensagem ao fim da conversa `conversationId`. */
  append(conversationId: string, message: ConversationMessage): Promise<void>;
  /** As `limit` mensagens mais recentes da conversa, em ordem cronológica. Vazio se a conversa não tem mensagens. */
  lastMessages(conversationId: string, limit: number): Promise<readonly ConversationMessage[]>;
}
```

Implementações: `SqliteConversationStore` (produção, tabela `messages`) e `MemoryConversationStore`
(fake, testes) — mesmo padrão de `OpsStore`/`SqliteOpsStore`/`MemoryOpsStore`.

## Schema SQLite (`messages`)

```sql
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, id);
```

DDL idempotente, criada no construtor do store — mesmo padrão de `ensureSchema` em
`src/store/sqlite/schema.ts`. Mesmo arquivo de banco (`OPSPILOT_DB`) das demais tabelas; sem FK
declarada para `conversation_id` porque não existe tabela `conversations` (ver research.md §1).

## Extensões a tipos existentes

### `StrategyInput` (`src/domain/strategy.ts`)

```ts
export type StrategyInput = {
  readonly request: string;
  readonly maxIterations: number;
  readonly store: OpsStore;
  readonly history?: readonly ConversationMessage[]; // novo, opcional — default: sem histórico
};
```

### `RunMetrics` (`src/domain/strategy.ts`)

```ts
export type RunMetrics = {
  readonly llmCalls: number;
  readonly latencyMs: number;
  readonly historyMessages: number; // novo
};
```

### `ChatRequest` (`src/http/schemas.ts`)

```ts
export const chatRequestSchema = z
  .object({
    message: z.string().min(1),
    strategy: z.string().min(1).optional(),
    reflect: z.boolean().optional().default(false),
    conversation: z.string().min(1).optional(), // novo
  })
  .strict();
```

### Resposta de `POST /chat`

```ts
// StrategyRun existente + conversation
{
  answer: string;
  trace: TraceEvent[];
  metrics: RunMetrics; // agora inclui historyMessages
  conversation: string; // novo — sempre presente
}
```
