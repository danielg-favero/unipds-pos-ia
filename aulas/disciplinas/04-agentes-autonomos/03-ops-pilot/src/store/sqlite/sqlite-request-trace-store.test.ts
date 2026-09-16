import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TraceEvent } from "../../domain/strategy.js";
import { SqliteRequestTraceStore } from "./sqlite-request-trace-store.js";

const ZERO_BREAKDOWN = { history: 0, memories: 0, systemPrompt: 0, request: 0 };

describe("SqliteRequestTraceStore", () => {
  it("getRequestWithTrace retorna undefined para id inexistente", async () => {
    const store = new SqliteRequestTraceStore(":memory:");
    assert.equal(await store.getRequestWithTrace("nunca-existiu"), undefined);
  });

  it("grava requisição + métricas finais e disponibiliza tudo via getRequestWithTrace", async () => {
    const store = new SqliteRequestTraceStore(":memory:");
    const requestId = "req-1";
    const events: TraceEvent[] = [
      { type: "thought", text: "pensando" },
      { type: "action", tool: "list_alerts", args: { severity: "high" } },
      { type: "observation", ok: true, result: { alerts: [] } },
      { type: "answer", text: "pronto", partial: false },
    ];

    await store.startRequest(requestId, "conv-1");
    await store.appendTraceEvents(requestId, events);
    await store.finishRequest(requestId, {
      status: "ok",
      metrics: {
        llmCalls: 2,
        latencyMs: 42,
        historyMessages: 0,
        contextBreakdown: ZERO_BREAKDOWN,
        promptTokensReal: 100,
        modelUsed: "gpt-test",
      },
    });

    const found = await store.getRequestWithTrace(requestId);
    assert.ok(found);
    assert.equal(found.request.id, requestId);
    assert.equal(found.request.conversationId, "conv-1");
    assert.equal(found.request.status, "ok");
    assert.equal(found.request.llmCalls, 2);
    assert.equal(found.request.promptTokensReal, 100);
    assert.equal(found.request.modelUsed, "gpt-test");
    assert.ok(typeof found.request.durationMs === "number");
    assert.deepEqual(
      found.trace.map((item) => item.seq),
      [0, 1, 2, 3],
    );
  });

  it("rejeita duas gravações para a mesma posição (seq) da mesma requisição", async () => {
    const store = new SqliteRequestTraceStore(":memory:");
    const requestId = "req-dup";
    await store.startRequest(requestId, "conv-dup");
    await store.appendTraceEvents(requestId, [{ type: "thought", text: "primeiro" }]);
    await assert.rejects(() =>
      store.appendTraceEvents(requestId, [{ type: "thought", text: "duplicado" }]),
    );
  });

  it("preserva a ordem exata quando o trace inteiro é gravado numa única chamada (fluxo real)", async () => {
    const store = new SqliteRequestTraceStore(":memory:");
    const requestId = "req-2";
    const events: TraceEvent[] = [
      { type: "route", route: "react", reason: "pergunta direta", manual: false },
      { type: "action", tool: "open_incident", args: { serviceId: "svc-1" }, callId: "c1" },
      { type: "observation", callId: "c1", ok: false, error: "timeout" },
      { type: "answer", text: "não consegui completar", partial: true },
    ];

    await store.startRequest(requestId, "conv-2");
    await store.appendTraceEvents(requestId, events);
    await store.finishRequest(requestId, { status: "error", error: "timeout" });

    const found = await store.getRequestWithTrace(requestId);
    assert.ok(found);
    assert.equal(found.request.status, "error");
    assert.equal(found.request.error, "timeout");
    assert.deepEqual(
      found.trace.map((item) => item.seq),
      [0, 1, 2, 3],
    );
    assert.deepEqual(
      found.trace.map((item) => item.node),
      ["route", "action", "observation", "answer"],
    );
    assert.deepEqual(
      found.trace.map((item) => item.event),
      events,
    );
  });
});
