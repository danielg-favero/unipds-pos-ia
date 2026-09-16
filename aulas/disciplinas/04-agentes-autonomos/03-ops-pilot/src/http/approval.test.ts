import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";

import type { OpsStore } from "../store/port.js";
import type { ReasoningStrategy, StrategyInput, StrategyRun } from "../domain/strategy.js";
import { MemoryConversationStore } from "../store/memory-conversation.js";
import { MemoryConversationSummaryStore } from "../store/memory-conversation-summary.js";
import { MemoryOpsStore } from "../store/memory.js";
import { SqliteApprovalStore } from "../store/sqlite/sqlite-approval-store.js";
import { SqliteMemoryStore } from "../store/sqlite/sqlite-memory-store.js";
import { SqliteRequestTraceStore } from "../store/sqlite/sqlite-request-trace-store.js";
import type { ServerDeps } from "./server.js";
import { createServer } from "./server.js";

const ZERO_BREAKDOWN = { history: 0, memories: 0, systemPrompt: 0, request: 0 };

/**
 * Estratégia fake que, em vez de rodar um grafo de verdade, chama a tool
 * sensível diretamente contra o `store` recebido em `input` — exercitando o
 * guardrail (016) do mesmo jeito que o grafo real faria via `agents/tools.ts`.
 */
function resolveIncidentStrategy(incidentId: string): ReasoningStrategy {
  return {
    name: "resolve-fake",
    async run(input: StrategyInput): Promise<StrategyRun> {
      try {
        await input.store.resolveIncident(incidentId);
        return {
          answer: "incidente resolvido",
          trace: [{ type: "answer", text: "incidente resolvido", partial: false }],
          metrics: { llmCalls: 1, latencyMs: 1, historyMessages: 0, contextBreakdown: ZERO_BREAKDOWN },
        };
      } catch (error) {
        const answer = `não consegui: ${(error as Error).message}`;
        return {
          answer,
          trace: [
            { type: "observation", ok: false, error: (error as Error).message },
            { type: "answer", text: answer, partial: false },
          ],
          metrics: { llmCalls: 1, latencyMs: 1, historyMessages: 0, contextBreakdown: ZERO_BREAKDOWN },
        };
      }
    },
  };
}

async function startServer(deps: ServerDeps): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = createServer(deps);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/opspilot`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function baseDeps(store: OpsStore, strategy: ReasoningStrategy): ServerDeps {
  return {
    strategies: { react: strategy },
    store,
    conversationStore: new MemoryConversationStore(),
    summaryStore: new MemoryConversationSummaryStore(),
    memoryStore: new SqliteMemoryStore(":memory:"),
    requestTraceStore: new SqliteRequestTraceStore(":memory:"),
    approvalStore: new SqliteApprovalStore(":memory:"),
  };
}

const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

describe("Guardrail de aprovação (016)", () => {
  let close: () => Promise<void>;
  afterEach(async () => {
    await close?.();
  });

  it("POST /chat responde 202 com pendingApproval quando a estratégia tenta resolve_incident", async () => {
    const store = new MemoryOpsStore();
    const opened = await store.openIncident({ title: "x", serviceId: "checkout-api", severity: "high" });
    const server = await startServer(baseDeps(store, resolveIncidentStrategy(opened.id)));
    close = server.close;

    const res = await fetch(`${server.baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "resolva", userId: "u1" }),
    });

    assert.equal(res.status, 202);
    const body = asRecord(await res.json());
    const pending = asRecord(body.pendingApproval);
    assert.equal(pending.status, "pending");
    assert.equal(pending.tool, "resolve_incident");
    assert.equal(pending.id, body.requestId);

    // A ação nunca foi executada de fato — o incidente continua aberto.
    const stillOpen = await store.getIncident(opened.id);
    assert.equal(stillOpen?.status, "open");
  });

  it("POST /chat/:requestId/decision approve executa a ação e responde 200", async () => {
    const store = new MemoryOpsStore();
    const opened = await store.openIncident({ title: "x", serviceId: "checkout-api", severity: "high" });
    const server = await startServer(baseDeps(store, resolveIncidentStrategy(opened.id)));
    close = server.close;

    const chatRes = await fetch(`${server.baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "resolva", userId: "u1" }),
    });
    const { requestId } = asRecord(await chatRes.json());

    const decisionRes = await fetch(`${server.baseUrl}/chat/${requestId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(decisionRes.status, 200);
    const decided = asRecord(await decisionRes.json());
    assert.match(String(decided.answer), /aprovada e executada/);

    const resolved = await store.getIncident(opened.id);
    assert.equal(resolved?.status, "resolved");
  });

  it("POST /chat/:requestId/decision deny não executa a ação", async () => {
    const store = new MemoryOpsStore();
    const opened = await store.openIncident({ title: "x", serviceId: "checkout-api", severity: "high" });
    const server = await startServer(baseDeps(store, resolveIncidentStrategy(opened.id)));
    close = server.close;

    const chatRes = await fetch(`${server.baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "resolva", userId: "u1" }),
    });
    const { requestId } = asRecord(await chatRes.json());

    const decisionRes = await fetch(`${server.baseUrl}/chat/${requestId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "deny" }),
    });
    assert.equal(decisionRes.status, 200);
    const denied = asRecord(await decisionRes.json());
    assert.match(String(denied.answer), /negada/);

    const stillOpen = await store.getIncident(opened.id);
    assert.equal(stillOpen?.status, "open");
  });

  it("decisão repetida responde 409 com a decisão já registrada", async () => {
    const store = new MemoryOpsStore();
    const opened = await store.openIncident({ title: "x", serviceId: "checkout-api", severity: "high" });
    const server = await startServer(baseDeps(store, resolveIncidentStrategy(opened.id)));
    close = server.close;

    const chatRes = await fetch(`${server.baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "resolva", userId: "u1" }),
    });
    const { requestId } = asRecord(await chatRes.json());

    await fetch(`${server.baseUrl}/chat/${requestId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });

    const second = await fetch(`${server.baseUrl}/chat/${requestId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "deny" }),
    });
    assert.equal(second.status, 409);
    const body = asRecord(await second.json());
    assert.equal(asRecord(body.pendingApproval).status, "approved");
  });

  it("requestId desconhecido responde 404", async () => {
    const store = new MemoryOpsStore();
    const server = await startServer(baseDeps(store, resolveIncidentStrategy("inc-1")));
    close = server.close;

    const res = await fetch(`${server.baseUrl}/chat/nunca-existiu/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(res.status, 404);
  });
});

describe("CORS (016)", () => {
  let close: () => Promise<void>;
  afterEach(async () => {
    await close?.();
  });

  it("sem webOrigin configurado, nenhum header de CORS é enviado", async () => {
    const store = new MemoryOpsStore();
    const server = await startServer(baseDeps(store, resolveIncidentStrategy("inc-1")));
    close = server.close;

    const res = await fetch(`${server.baseUrl}/stats`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  it("com webOrigin configurado, a origem liberada recebe o header de CORS", async () => {
    const store = new MemoryOpsStore();
    const deps = { ...baseDeps(store, resolveIncidentStrategy("inc-1")), webOrigin: "http://localhost:5173" };
    const server = await startServer(deps);
    close = server.close;

    const res = await fetch(`${server.baseUrl}/stats`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
  });
});
