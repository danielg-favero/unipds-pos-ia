import type { DatabaseSync } from "node:sqlite";

type ColumnInfoRow = { name: string };

/** Colunas adicionadas depois da criação inicial da tabela — `ALTER TABLE ADD COLUMN` não tem `IF NOT EXISTS`. */
const ADDED_COLUMNS: readonly { readonly table: string; readonly ddl: string }[] = [
  { table: "requests", ddl: "route TEXT" },
  { table: "requests", ddl: "cost_usd REAL" },
];

const addMissingColumns = (db: DatabaseSync): void => {
  for (const { table, ddl } of ADDED_COLUMNS) {
    const columnName = ddl.split(" ", 1)[0]!;
    const existing = db.prepare(`SELECT name FROM pragma_table_info(?)`).all(table) as ColumnInfoRow[];
    if (existing.some((column) => column.name === columnName)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
};

/**
 * DDL idempotente de `requests`/`trace_events` (015). `status` aceita `NULL`
 * porque `startRequest` grava a linha antes do resultado final ser conhecido;
 * `finishRequest` sempre completa com um dos três valores do CHECK.
 * `UNIQUE (request_id, seq)` garante que a ordem do trace nunca colide (FR-005).
 */
export function ensureRequestTraceSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id                 TEXT PRIMARY KEY,
      conversation_id    TEXT NOT NULL,
      started_at         TEXT NOT NULL,
      finished_at        TEXT,
      duration_ms        INTEGER,
      status             TEXT CHECK (status IS NULL OR status IN ('ok','error','timeout')),
      llm_calls          INTEGER,
      prompt_tokens_real INTEGER,
      model_used         TEXT,
      route              TEXT,
      cost_usd           REAL,
      error              TEXT
    );

    CREATE TABLE IF NOT EXISTS trace_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id  TEXT NOT NULL REFERENCES requests(id),
      seq         INTEGER NOT NULL,
      node        TEXT NOT NULL,
      payload     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE (request_id, seq)
    );

    CREATE INDEX IF NOT EXISTS idx_trace_events_request
      ON trace_events (request_id, seq);

    CREATE INDEX IF NOT EXISTS idx_requests_started_at
      ON requests (started_at);
  `);

  addMissingColumns(db);
}
