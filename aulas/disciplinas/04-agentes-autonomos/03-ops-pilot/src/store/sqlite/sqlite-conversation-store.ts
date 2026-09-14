import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import type { ConversationMessage, ConversationStore } from "../conversation-port.js";
import { ensureConversationSchema } from "./conversation-schema.js";

type MessageRow = { role: string; content: string };

const toMessage = (row: MessageRow): ConversationMessage => ({
  role: row.role as ConversationMessage["role"],
  content: row.content,
});

/**
 * Adaptador SQLite de `ConversationStore`, sobre a tabela `messages`. Mesmo
 * arquivo (`OPSPILOT_DB`) e mesmo padrão de `SqliteOpsStore`: DDL idempotente
 * no construtor, toda query é prepared statement.
 */
export class SqliteConversationStore implements ConversationStore {
  readonly #db: DatabaseSync;
  readonly #stmts: {
    readonly insertMessage: StatementSync;
    readonly lastMessages: StatementSync;
  };

  constructor(path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    ensureConversationSchema(this.#db);

    this.#stmts = {
      insertMessage: this.#db.prepare(
        "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
      ),
      lastMessages: this.#db.prepare(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?",
      ),
    };
  }

  async create(): Promise<string> {
    return randomUUID();
  }

  async append(conversationId: string, message: ConversationMessage): Promise<void> {
    this.#stmts.insertMessage.run(conversationId, message.role, message.content);
  }

  async lastMessages(
    conversationId: string,
    limit: number,
  ): Promise<readonly ConversationMessage[]> {
    const rows = this.#stmts.lastMessages.all(conversationId, limit) as MessageRow[];
    return rows.map(toMessage).reverse();
  }

  close(): void {
    this.#db.close();
  }
}
