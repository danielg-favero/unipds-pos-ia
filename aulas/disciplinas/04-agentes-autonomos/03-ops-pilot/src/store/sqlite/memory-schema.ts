import type { DatabaseSync } from "node:sqlite";

/** DDL idempotente da tabela `memories` (memória semântica por usuário). */
export function ensureMemorySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      fact       TEXT NOT NULL,
      embedding  BLOB NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user_id
      ON memories (user_id);
  `);
}
