# Data Model: Memória Semântica por Usuário

## Entidade: Memory (linha da tabela `memories`)

| Campo        | Tipo (SQLite) | Descrição                                                        |
|--------------|---------------|--------------------------------------------------------------------|
| `id`         | `TEXT` (PK)   | Identificador único da memória (`randomUUID()`, mesmo padrão de `messages.conversation_id`) |
| `user_id`    | `TEXT`        | Identificador do usuário dono do fato (FR-001); indexado para filtrar por usuário |
| `fact`       | `TEXT`        | Texto do fato memorizado (FR-012)                                  |
| `embedding`  | `BLOB`        | Vetor de embedding do `fact` (Float32Array serializado), normalizado (norma 1) |
| `created_at` | `TEXT`        | Timestamp ISO 8601 de criação (FR-012), `DEFAULT CURRENT_TIMESTAMP` |

**Chave primária**: `id`.

**Índice**: `CREATE INDEX idx_memories_user_id ON memories(user_id)` — toda leitura (`recall`,
verificação de dedup) filtra por `user_id` antes de calcular similaridade.

**Invariantes**:
- Duas memórias do mesmo `user_id` nunca coexistem com produto escalar de embeddings > 0.92
  (garantido em `remember`, não por constraint de banco — a checagem é semântica, não textual).
- `embedding` sempre tem o mesmo comprimento fixo (384 dimensões, saída de `all-MiniLM-L6-v2`) e é
  gravado apenas com o vetor já normalizado pelo pipeline (`normalize: true`).
- Memórias de usuários diferentes nunca são comparadas entre si (FR-001, isolamento).

**Relacionamentos**: nenhum FK formal com `messages`/`conversations` — `user_id` é um identificador
de aplicação, não referencia outra tabela do schema atual.

**Sem transições de estado**: uma memória existe (após `remember`) ou não existe mais (após
`forget`); não há edição in-place nesta versão (Assumptions da spec).

## Tipos TypeScript (contrato do store, não é o schema físico)

```ts
export type Memory = {
  readonly id: string;
  readonly userId: string;
  readonly fact: string;
  readonly createdAt: string; // ISO 8601
};

export type RecalledMemory = Memory & { readonly score: number };

export interface MemoryStore {
  remember(userId: string, fact: string): Promise<void>;
  recall(userId: string, query: string, limit?: number): Promise<readonly RecalledMemory[]>;
  forget(userId: string, memoryId: string): Promise<void>;
}
```

`recall` já aplica o corte mínimo de relevância (`score >= 0.3`) e o limite (`limit`, default 3)
internamente — quem chama nunca precisa filtrar de novo (FR-004, FR-005).
