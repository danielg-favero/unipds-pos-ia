# Contract: `MemoryStore`

Interface interna (não HTTP) implementada por `SqliteMemoryStore` em `src/store/sqlite/`, seguindo o
mesmo padrão de `ConversationStore`/`OpsStore`.

```ts
interface MemoryStore {
  remember(userId: string, fact: string): Promise<void>;
  recall(userId: string, query: string, limit?: number): Promise<readonly RecalledMemory[]>;
  forget(userId: string, memoryId: string): Promise<void>;
}
```

## `remember(userId, fact)`

- Gera o embedding de `fact`.
- Compara (produto escalar) contra os embeddings de todas as memórias existentes desse `userId`.
- Se algum score for `> 0.92`: não grava nada (dedup, FR-003).
- Caso contrário: insere uma nova linha (`id`, `userId`, `fact`, `embedding`, `createdAt`).
- Nunca lança erro para "fato duplicado" — dedup é silencioso (idempotente do ponto de vista do
  chamador).

## `recall(userId, query, limit = 3)`

- Gera o embedding de `query`.
- Calcula produto escalar contra os embeddings de todas as memórias de `userId` (nunca de outro
  usuário — FR-001, SC-005).
- Descarta scores `< 0.3` (FR-005).
- Ordena por score desc, retorna os `limit` primeiros (FR-004; default 3).
- Sem memórias, ou sem nenhuma acima do corte: retorna array vazio (não é erro) — consumidor (o
  `/chat`) trata array vazio como "sem contexto de memória" (FR-011).

## `forget(userId, memoryId)`

- Remove a linha `(userId, memoryId)` se existir.
- Se não existir (id inválido ou já removido, ou pertence a outro `userId`): não lança erro,
  simplesmente não afeta nenhuma linha (FR-008, idempotente).

---

# Contract: `POST /chat` (alterações)

Corpo da requisição (Zod, `src/http/schemas.ts`) ganha um campo novo obrigatório:

```jsonc
{
  "message": "string, obrigatório",
  "userId": "string, obrigatório (novo)",
  "strategy": "string, opcional",
  "reflect": "boolean, opcional (default false)",
  "conversation": "string, opcional"
}
```

- Requisição sem `userId` (ausente, vazio ou tipo errado): `400`, mesmo formato de erro já usado
  para corpo inválido (`{ error, issues }`).
- Comportamento de resposta (`200`, `422`, `500`, `504`) não muda de formato — apenas o processamento
  interno passa a chamar `recall` antes de `strategy.run(...)` e `remember` após uma resposta bem
  sucedida (best-effort: falha ao memorizar não deve derrubar a resposta ao usuário).
