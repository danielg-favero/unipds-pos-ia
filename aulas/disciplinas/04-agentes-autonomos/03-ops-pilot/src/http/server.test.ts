import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import type { ReasoningStrategy, StrategyRun } from "../domain/strategy.js";
import { MemoryOpsStore } from "../store/memory.js";
import type { ServerDeps } from "./server.js";
import { createServer } from "./server.js";

/** Estratégia fake determinística: nenhuma chamada de rede/modelo. */
function fakeStrategy(name: string, run: StrategyRun): ReasoningStrategy & { calls: number } {
  const strategy = {
    name,
    calls: 0,
    async run(): Promise<StrategyRun> {
      strategy.calls += 1;
      return run;
    },
  };
  return strategy;
}

/** Estratégia fake que nunca resolve dentro do timeout de teste. */
function slowStrategy(name: string, delayMs: number, run: StrategyRun): ReasoningStrategy {
  return {
    name,
    async run(): Promise<StrategyRun> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return run;
    },
  };
}

const FAKE_RUN: StrategyRun = {
  answer: "resposta fake",
  trace: [{ type: "answer", text: "resposta fake", partial: false }],
  metrics: { llmCalls: 1, latencyMs: 5 },
};

const CRITIQUE_RUN: StrategyRun = {
  answer: "resposta revisada",
  trace: [
    { type: "critique", text: "aprovado" },
    { type: "answer", text: "resposta revisada", partial: false },
  ],
  metrics: { llmCalls: 2, latencyMs: 10 },
};

async function startServer(deps: ServerDeps): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const app = createServer(deps);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

const postChat = (baseUrl: string, body: unknown) =>
  fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

describe("POST /chat", () => {
  describe("User Story 1 - estratégia padrão", () => {
    let close: () => Promise<void>;
    let baseUrl: string;
    let react: ReturnType<typeof fakeStrategy>;

    before(async () => {
      react = fakeStrategy("react", FAKE_RUN);
      ({ baseUrl, close } = await startServer({
        strategies: { react },
        store: new MemoryOpsStore(),
      }));
    });
    after(() => close());

    it("responde 200 com answer, trace e metrics", async () => {
      const res = await postChat(baseUrl, { message: "quais alertas estão disparando?" });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, FAKE_RUN);
    });

    it("usa a estratégia react quando strategy é omitido", async () => {
      const callsBefore = react.calls;
      const res = await postChat(baseUrl, { message: "oi" });
      assert.equal(res.status, 200);
      assert.equal(react.calls, callsBefore + 1);
    });
  });

  describe("User Story 2 - seleção de estratégia e reflect", () => {
    let close: () => Promise<void>;
    let baseUrl: string;
    let react: ReturnType<typeof fakeStrategy>;
    let planAndExecute: ReturnType<typeof fakeStrategy>;
    let reflectReact: ReturnType<typeof fakeStrategy>;

    before(async () => {
      react = fakeStrategy("react", FAKE_RUN);
      planAndExecute = fakeStrategy("plan-and-execute", FAKE_RUN);
      reflectReact = fakeStrategy("reflect:react", CRITIQUE_RUN);
      ({ baseUrl, close } = await startServer({
        strategies: {
          react,
          "plan-and-execute": planAndExecute,
          "reflect:react": reflectReact,
        },
        store: new MemoryOpsStore(),
      }));
    });
    after(() => close());

    it("usa a estratégia informada em strategy quando reflect é false/omitido", async () => {
      const res = await postChat(baseUrl, { message: "abra um incidente", strategy: "plan-and-execute" });
      assert.equal(res.status, 200);
      assert.equal(planAndExecute.calls, 1);
      assert.equal(react.calls, 0);
    });

    it("usa a variante reflect:<strategy> quando reflect é true", async () => {
      const res = await postChat(baseUrl, { message: "oi", strategy: "react", reflect: true });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, CRITIQUE_RUN);
      assert.equal(reflectReact.calls, 1);
      assert.equal(react.calls, 0);
    });

    it("responde 422 quando a estratégia é desconhecida", async () => {
      const res = await postChat(baseUrl, { message: "oi", strategy: "nao-existe" });
      assert.equal(res.status, 422);
      const body = asRecord(await res.json());
      assert.equal(body.requested, "nao-existe");
      assert.ok(Array.isArray(body.available));
      assert.ok((body.available as string[]).includes("react"));
    });
  });

  describe("User Story 3 - erros previsíveis", () => {
    let close: () => Promise<void>;
    let baseUrl: string;

    before(async () => {
      ({ baseUrl, close } = await startServer({
        strategies: { react: fakeStrategy("react", FAKE_RUN) },
        store: new MemoryOpsStore(),
      }));
    });
    after(() => close());

    it("responde 400 quando message está ausente", async () => {
      const res = await postChat(baseUrl, {});
      assert.equal(res.status, 400);
      const body = asRecord(await res.json());
      assert.ok(Array.isArray(body.issues));
      assert.ok((body.issues as unknown[]).length > 0);
    });

    it("responde 400 quando reflect não é booleano", async () => {
      const res = await postChat(baseUrl, { message: "oi", reflect: "true" });
      assert.equal(res.status, 400);
    });

    it("responde 504 quando a execução excede o timeout configurado", async () => {
      const slow = slowStrategy("react", 200, FAKE_RUN);
      const { baseUrl: slowBaseUrl, close: closeSlow } = await startServer({
        strategies: { react: slow },
        store: new MemoryOpsStore(),
        timeoutMs: 20,
      });
      try {
        const res = await postChat(slowBaseUrl, { message: "oi" });
        assert.equal(res.status, 504);
      } finally {
        await closeSlow();
      }
    });
  });
});
