import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import type { RequestStatRow } from "../../domain/stats.js";
import type { RunMetrics, TraceEvent } from "../../domain/strategy.js";
import type {
  RequestRecord,
  RequestTraceStore,
  RequestWithTrace,
  TraceEventRecord,
} from "../request-trace-port.js";
import { ensureRequestTraceSchema } from "./request-trace-schema.js";

type RequestRow = {
  id: string;
  conversation_id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: string | null;
  llm_calls: number | null;
  prompt_tokens_real: number | null;
  model_used: string | null;
  route: string | null;
  cost_usd: number | null;
  error: string | null;
};

type TraceEventRow = { seq: number; node: string; payload: string; created_at: string };

type StatsRow = {
  route: string | null;
  model_used: string | null;
  status: string | null;
  duration_ms: number | null;
  prompt_tokens_real: number | null;
  cost_usd: number | null;
};

const toRequestRecord = (row: RequestRow): RequestRecord => ({
  id: row.id,
  conversationId: row.conversation_id,
  startedAt: row.started_at,
  finishedAt: row.finished_at ?? undefined,
  durationMs: row.duration_ms ?? undefined,
  status: (row.status ?? "ok") as RequestRecord["status"],
  llmCalls: row.llm_calls ?? undefined,
  promptTokensReal: row.prompt_tokens_real ?? undefined,
  modelUsed: row.model_used ?? undefined,
  route: row.route ?? undefined,
  costUsd: row.cost_usd ?? undefined,
  error: row.error ?? undefined,
});

const toStatRow = (row: StatsRow): RequestStatRow => ({
  route: row.route ?? undefined,
  modelUsed: row.model_used ?? undefined,
  status: (row.status ?? "ok") as RequestStatRow["status"],
  durationMs: row.duration_ms ?? undefined,
  promptTokensReal: row.prompt_tokens_real ?? undefined,
  costUsd: row.cost_usd ?? undefined,
});

const toTraceEventRecord = (row: TraceEventRow): TraceEventRecord => ({
  seq: row.seq,
  node: row.node,
  event: JSON.parse(row.payload) as TraceEvent,
  createdAt: row.created_at,
});

/**
 * Adaptador SQLite de `RequestTraceStore` (015), sobre `requests`/`trace_events`.
 * Mesmo arquivo (`OPSPILOT_DB`) e mesmo padrão das demais stores: DDL idempotente
 * no construtor, toda query é prepared statement.
 */
export class SqliteRequestTraceStore implements RequestTraceStore {
  readonly #db: DatabaseSync;
  readonly #stmts: {
    readonly insertRequest: StatementSync;
    readonly finishRequest: StatementSync;
    readonly insertTraceEvent: StatementSync;
    readonly getRequest: StatementSync;
    readonly getTraceEvents: StatementSync;
    readonly statsSince: StatementSync;
  };

  constructor(path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    ensureRequestTraceSchema(this.#db);

    this.#stmts = {
      insertRequest: this.#db.prepare(
        "INSERT INTO requests (id, conversation_id, started_at) VALUES (?, ?, ?)",
      ),
      finishRequest: this.#db.prepare(`
        UPDATE requests SET
          finished_at = ?,
          duration_ms = ?,
          status = ?,
          llm_calls = ?,
          prompt_tokens_real = ?,
          model_used = ?,
          route = ?,
          cost_usd = ?,
          error = ?
        WHERE id = ?
      `),
      insertTraceEvent: this.#db.prepare(
        "INSERT INTO trace_events (request_id, seq, node, payload) VALUES (?, ?, ?, ?)",
      ),
      getRequest: this.#db.prepare("SELECT * FROM requests WHERE id = ?"),
      getTraceEvents: this.#db.prepare(
        "SELECT seq, node, payload, created_at FROM trace_events WHERE request_id = ? ORDER BY seq ASC",
      ),
      statsSince: this.#db.prepare(
        "SELECT route, model_used, status, duration_ms, prompt_tokens_real, cost_usd FROM requests WHERE started_at >= ?",
      ),
    };
  }

  async startRequest(id: string, conversationId: string): Promise<void> {
    this.#stmts.insertRequest.run(id, conversationId, new Date().toISOString());
  }

  async finishRequest(
    id: string,
    result: {
      readonly status: RequestRecord["status"];
      readonly metrics?: RunMetrics;
      readonly route?: string;
      readonly costUsd?: number;
      readonly error?: string;
    },
  ): Promise<void> {
    const request = this.#stmts.getRequest.get(id) as RequestRow | undefined;
    const finishedAt = new Date().toISOString();
    const durationMs =
      request === undefined ? null : Date.parse(finishedAt) - Date.parse(request.started_at);

    this.#stmts.finishRequest.run(
      finishedAt,
      durationMs,
      result.status,
      result.metrics?.llmCalls ?? null,
      result.metrics?.promptTokensReal ?? null,
      result.metrics?.modelUsed ?? null,
      result.route ?? null,
      result.costUsd ?? null,
      result.error ?? null,
      id,
    );
  }

  async appendTraceEvents(requestId: string, events: readonly TraceEvent[]): Promise<void> {
    events.forEach((event, seq) => {
      this.#stmts.insertTraceEvent.run(requestId, seq, event.type, JSON.stringify(event));
    });
  }

  async getRequestWithTrace(id: string): Promise<RequestWithTrace | undefined> {
    const row = this.#stmts.getRequest.get(id) as RequestRow | undefined;
    if (row === undefined) return undefined;

    const traceRows = this.#stmts.getTraceEvents.all(id) as TraceEventRow[];
    return { request: toRequestRecord(row), trace: traceRows.map(toTraceEventRecord) };
  }

  async statsSince(sinceIso: string): Promise<readonly RequestStatRow[]> {
    const rows = this.#stmts.statsSince.all(sinceIso) as StatsRow[];
    return rows.map(toStatRow);
  }

  close(): void {
    this.#db.close();
  }
}
