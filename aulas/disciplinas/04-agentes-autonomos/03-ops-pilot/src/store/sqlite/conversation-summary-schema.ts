import type { DatabaseSync } from "node:sqlite";

/**
 * DDL idempotente da tabela `conversation_summaries` (011-sumarizacao-historico). Uma linha por
 * conversa: `summary` é o resumo acumulado (mesclado a cada novo lote), `summarized_through` é a
 * quantidade de mensagens já incorporadas — cresce em múltiplos de 8 (ver data-model.md).
 */
export function ensureConversationSummarySchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_summaries (
      conversation_id     TEXT PRIMARY KEY,
      summary             TEXT NOT NULL,
      summarized_through  INTEGER NOT NULL DEFAULT 0,
      updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
}
