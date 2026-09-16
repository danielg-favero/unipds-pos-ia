import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import { ApprovalNotFoundError, ApprovalNotPendingError } from "../../domain/approval.js";
import type { ApprovalTool, PendingApproval, PendingApprovalStatus } from "../../domain/approval.js";
import type { ApprovalStore, CreatePendingApprovalInput } from "../approval-port.js";
import { ensureApprovalSchema } from "./approval-schema.js";

type ApprovalRow = {
  id: string;
  conversation_id: string;
  tool: string;
  args: string;
  description: string;
  status: string;
  result: string | null;
  decided_at: string | null;
};

const toApproval = (row: ApprovalRow): PendingApproval => ({
  id: row.id,
  tool: row.tool as ApprovalTool,
  args: JSON.parse(row.args) as Record<string, unknown>,
  description: row.description,
  status: row.status as PendingApprovalStatus,
  result: row.result === null ? undefined : (JSON.parse(row.result) as unknown),
  decidedAt: row.decided_at ?? undefined,
});

/** Adaptador SQLite de `ApprovalStore` (016). Mesmo arquivo (`OPSPILOT_DB`) e padrão das demais stores. */
export class SqliteApprovalStore implements ApprovalStore {
  readonly #db: DatabaseSync;
  readonly #stmts: {
    readonly insert: StatementSync;
    readonly get: StatementSync;
    readonly decide: StatementSync;
  };

  constructor(path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    ensureApprovalSchema(this.#db);

    this.#stmts = {
      insert: this.#db.prepare(
        "INSERT INTO pending_approvals (id, conversation_id, tool, args, description) VALUES (?, ?, ?, ?, ?)",
      ),
      get: this.#db.prepare("SELECT * FROM pending_approvals WHERE id = ?"),
      decide: this.#db.prepare(`
        UPDATE pending_approvals SET
          status = ?,
          result = ?,
          decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
      `),
    };
  }

  async create(input: CreatePendingApprovalInput): Promise<PendingApproval> {
    this.#stmts.insert.run(
      input.id,
      input.conversationId,
      input.tool,
      JSON.stringify(input.args),
      input.description,
    );
    const approval = await this.get(input.id);
    if (approval === undefined) throw new ApprovalNotFoundError(input.id);
    return approval;
  }

  async get(id: string): Promise<PendingApproval | undefined> {
    const row = this.#stmts.get.get(id) as ApprovalRow | undefined;
    return row === undefined ? undefined : toApproval(row);
  }

  async getConversationId(id: string): Promise<string | undefined> {
    const row = this.#stmts.get.get(id) as ApprovalRow | undefined;
    return row?.conversation_id;
  }

  async decide(
    id: string,
    status: Exclude<PendingApprovalStatus, "pending">,
    result?: unknown,
  ): Promise<PendingApproval> {
    const current = await this.get(id);
    if (current === undefined) throw new ApprovalNotFoundError(id);
    if (current.status !== "pending") throw new ApprovalNotPendingError(current);

    this.#stmts.decide.run(status, result === undefined ? null : JSON.stringify(result), id);
    const updated = await this.get(id);
    if (updated === undefined) throw new ApprovalNotFoundError(id);
    return updated;
  }
}
