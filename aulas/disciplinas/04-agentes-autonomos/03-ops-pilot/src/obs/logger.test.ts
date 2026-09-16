import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TraceEvent } from "../domain/strategy.js";
import { formatLogLine } from "./logger.js";

const ALLOWED_KEYS = new Set(["requestId", "seq", "node", "status", "ts"]);

describe("formatLogLine", () => {
  it("contém exatamente requestId, seq, node, status e ts", () => {
    const event: TraceEvent = { type: "thought", text: "texto sensível que não deve vazar" };
    const line = formatLogLine("req-1", 0, event);
    const parsed = JSON.parse(line) as Record<string, unknown>;

    assert.deepEqual(new Set(Object.keys(parsed)), ALLOWED_KEYS);
    assert.equal(parsed.requestId, "req-1");
    assert.equal(parsed.seq, 0);
    assert.equal(parsed.node, "thought");
    assert.equal(parsed.status, "ok");
    assert.equal(typeof parsed.ts, "string");
  });

  it("nunca inclui campos de payload do evento original", () => {
    const event: TraceEvent = {
      type: "action",
      tool: "open_incident",
      args: { serviceId: "svc-1", note: "detalhe interno" },
    };
    const line = formatLogLine("req-2", 1, event);
    assert.equal(line.includes("svc-1"), false);
    assert.equal(line.includes("detalhe interno"), false);
    assert.equal(line.includes("open_incident"), false);
  });

  it("status é 'error' para observation malsucedida", () => {
    const event: TraceEvent = { type: "observation", ok: false, error: "timeout" };
    const parsed = JSON.parse(formatLogLine("req-3", 2, event)) as Record<string, unknown>;
    assert.equal(parsed.status, "error");
    assert.equal(parsed.node, "observation");
  });

  it("status é 'ok' para observation bem-sucedida", () => {
    const event: TraceEvent = { type: "observation", ok: true, result: { total: 3 } };
    const parsed = JSON.parse(formatLogLine("req-4", 3, event)) as Record<string, unknown>;
    assert.equal(parsed.status, "ok");
  });

  it("produz uma única linha (sem quebras internas)", () => {
    const event: TraceEvent = {
      type: "plan",
      steps: ["passo 1\ncom quebra", "passo 2"],
    };
    const line = formatLogLine("req-5", 4, event);
    assert.equal(line.split("\n").length, 1);
  });
});
