import type { DatabaseSync } from "node:sqlite";

/**
 * DDL idempotente da tabela `messages`. Sem tabela `conversations` própria: uma
 * conversa "existe" a partir da primeira mensagem gravada nela (ver research.md
 * §1 de 007-conversa-persistente).
 */
export function ensureConversationSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role            TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content         TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages (conversation_id, id);
  `);
}
