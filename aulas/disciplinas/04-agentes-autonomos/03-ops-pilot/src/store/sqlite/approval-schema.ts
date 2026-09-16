import type { DatabaseSync } from "node:sqlite";

/**
 * DDL idempotente de `pending_approvals` (016). `args`/`result` gravados como
 * JSON; `status` aceita só os três valores do modelo de estado (data-model.md).
 */
export function ensureApprovalSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_approvals (
      id               TEXT PRIMARY KEY,
      conversation_id  TEXT NOT NULL,
      tool             TEXT NOT NULL,
      args             TEXT NOT NULL,
      description      TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
      result           TEXT,
      created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      decided_at       TEXT
    );
  `);
}
