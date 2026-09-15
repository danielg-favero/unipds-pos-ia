import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import type { ConversationSummary, ConversationSummaryStore } from "../conversation-summary-port.js";
import { ensureConversationSummarySchema } from "./conversation-summary-schema.js";

type SummaryRow = { summary: string; summarized_through: number };

/**
 * Adaptador SQLite de `ConversationSummaryStore`, sobre a tabela `conversation_summaries`. Mesmo
 * padrão de `SqliteConversationStore`: DDL idempotente no construtor, queries via prepared
 * statements, `save` é um UPSERT (substitui, nunca acumula linhas por conversa).
 */
export class SqliteConversationSummaryStore implements ConversationSummaryStore {
  readonly #db: DatabaseSync;
  readonly #stmts: {
    readonly get: StatementSync;
    readonly upsert: StatementSync;
  };

  constructor(path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    ensureConversationSummarySchema(this.#db);

    this.#stmts = {
      get: this.#db.prepare(
        "SELECT summary, summarized_through FROM conversation_summaries WHERE conversation_id = ?",
      ),
      upsert: this.#db.prepare(`
        INSERT INTO conversation_summaries (conversation_id, summary, summarized_through, updated_at)
        VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        ON CONFLICT (conversation_id) DO UPDATE SET
          summary = excluded.summary,
          summarized_through = excluded.summarized_through,
          updated_at = excluded.updated_at
      `),
    };
  }

  async get(conversationId: string): Promise<ConversationSummary | undefined> {
    const row = this.#stmts.get.get(conversationId) as SummaryRow | undefined;
    if (row === undefined) return undefined;
    return { summary: row.summary, summarizedThrough: row.summarized_through };
  }

  async save(conversationId: string, summary: ConversationSummary): Promise<void> {
    this.#stmts.upsert.run(conversationId, summary.summary, summary.summarizedThrough);
  }

  close(): void {
    this.#db.close();
  }
}
