import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

import { makeMemoryTools } from "../agents/tools.js";
import type { StrategyInput, ReasoningStrategy, StrategyRun } from "../domain/strategy.js";
import { MemoryConversationStore } from "../store/memory-conversation.js";
import { MemoryOpsStore } from "../store/memory.js";
import { SqliteMemoryStore } from "../store/sqlite/sqlite-memory-store.js";
import type { ServerDeps } from "./server.js";
import { createServer } from "./server.js";

const newMemoryStore = () => new SqliteMemoryStore(":memory:");

/** Estratégia fake determinística: nenhuma chamada de rede/modelo. */
function fakeStrategy(
  name: string,
  run: StrategyRun,
): ReasoningStrategy & { calls: number; lastInput?: StrategyInput } {
  const strategy = {
    name,
    calls: 0,
    lastInput: undefined as StrategyInput | undefined,
    async run(input: StrategyInput): Promise<StrategyRun> {
      strategy.calls += 1;
      strategy.lastInput = input;
      // Espelha o comportamento real (RunTracker): historyMessages reflete o
      // histórico recebido, mesmo numa estratégia fake sem rede.
      return { ...run, metrics: { ...run.metrics, historyMessages: input.history?.length ?? 0 } };
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
  metrics: { llmCalls: 1, latencyMs: 5, historyMessages: 0 },
};

const CRITIQUE_RUN: StrategyRun = {
  answer: "resposta revisada",
  trace: [
    { type: "critique", text: "aprovado" },
    { type: "answer", text: "resposta revisada", partial: false },
  ],
  metrics: { llmCalls: 2, latencyMs: 10, historyMessages: 0 },
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
        conversationStore: new MemoryConversationStore(),
        memoryStore: newMemoryStore(),
      }));
    });
    after(() => close());

    it("responde 200 com answer, trace, metrics e conversation", async () => {
      const res = await postChat(baseUrl, { message: "quais alertas estão disparando?", userId: "u1" });
      assert.equal(res.status, 200);
      const body = asRecord(await res.json());
      assert.deepEqual(
        { answer: body.answer, trace: body.trace, metrics: body.metrics },
        FAKE_RUN,
      );
      assert.equal(typeof body.conversation, "string");
    });

    it("usa a estratégia react quando strategy é omitido", async () => {
      const callsBefore = react.calls;
      const res = await postChat(baseUrl, { message: "oi", userId: "u1" });
      assert.equal(res.status, 200);
      assert.equal(react.calls, callsBefore + 1);
    });
  });

  describe("User Story 1 (007) - conversa persistente", () => {
    let close: () => Promise<void>;
    let baseUrl: string;
    let react: ReturnType<typeof fakeStrategy>;

    before(async () => {
      react = fakeStrategy("react", FAKE_RUN);
      ({ baseUrl, close } = await startServer({
        strategies: { react },
        store: new MemoryOpsStore(),
        conversationStore: new MemoryConversationStore(),
        memoryStore: newMemoryStore(),
      }));
    });
    after(() => close());

    it("sem conversation: cria uma nova e devolve no corpo, sem histórico", async () => {
      const res = await postChat(baseUrl, { message: "quais incidentes estão abertos?", userId: "u1" });
      assert.equal(res.status, 200);
      const body = asRecord(await res.json());
      assert.equal(typeof body.conversation, "string");
      assert.equal(react.lastInput?.history?.length, 0);
      assert.equal(asRecord(body.metrics).historyMessages, 0);
    });

    it("com conversation: a próxima chamada recebe a troca anterior como histórico", async () => {
      const first = await postChat(baseUrl, { message: "quais incidentes estão abertos?", userId: "u1" });
      const conversation = asRecord(await first.json()).conversation as string;

      const second = await postChat(baseUrl, {
        message: "e algum deles é crítico?",
        userId: "u1",
        conversation,
      });
      assert.equal(second.status, 200);
      const body = asRecord(await second.json());
      assert.equal(body.conversation, conversation);
      assert.deepEqual(react.lastInput?.history, [
        { role: "user", content: "quais incidentes estão abertos?" },
        { role: "assistant", content: "resposta fake" },
      ]);
      assert.equal(asRecord(body.metrics).historyMessages, 2);
    });

    it("com conversation desconhecida: trata como conversa nova, sem erro", async () => {
      const res = await postChat(baseUrl, { message: "oi", userId: "u1", conversation: "id-nunca-visto" });
      assert.equal(res.status, 200);
      const body = asRecord(await res.json());
      assert.equal(body.conversation, "id-nunca-visto");
      assert.equal(react.lastInput?.history?.length, 0);
    });
  });

  describe("User Story 2 (007) - janela de 12 mensagens", () => {
    let close: () => Promise<void>;
    let baseUrl: string;
    let react: ReturnType<typeof fakeStrategy>;

    before(async () => {
      react = fakeStrategy("react", FAKE_RUN);
      ({ baseUrl, close } = await startServer({
        strategies: { react },
        store: new MemoryOpsStore(),
        conversationStore: new MemoryConversationStore(),
        memoryStore: newMemoryStore(),
      }));
    });
    after(() => close());

    it("historyMessages nunca ultrapassa 12, mesmo com mais trocas acumuladas", async () => {
      let conversation: string | undefined;
      for (let i = 0; i < 8; i += 1) {
        const res = await postChat(baseUrl, { message: `mensagem ${i}`, userId: "u1", conversation });
        conversation = asRecord(await res.json()).conversation as string;
      }

      assert.equal(react.lastInput?.history?.length, 12);
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
        conversationStore: new MemoryConversationStore(),
        memoryStore: newMemoryStore(),
      }));
    });
    after(() => close());

    it("usa a estratégia informada em strategy quando reflect é false/omitido", async () => {
      const res = await postChat(baseUrl, { message: "abra um incidente", userId: "u1", strategy: "plan-and-execute" });
      assert.equal(res.status, 200);
      assert.equal(planAndExecute.calls, 1);
      assert.equal(react.calls, 0);
    });

    it("usa a variante reflect:<strategy> quando reflect é true", async () => {
      const res = await postChat(baseUrl, { message: "oi", userId: "u1", strategy: "react", reflect: true });
      assert.equal(res.status, 200);
      const body = asRecord(await res.json());
      assert.deepEqual(
        { answer: body.answer, trace: body.trace, metrics: body.metrics },
        CRITIQUE_RUN,
      );
      assert.equal(reflectReact.calls, 1);
      assert.equal(react.calls, 0);
    });

    it("responde 422 quando a estratégia é desconhecida", async () => {
      const res = await postChat(baseUrl, { message: "oi", userId: "u1", strategy: "nao-existe" });
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
        conversationStore: new MemoryConversationStore(),
        memoryStore: newMemoryStore(),
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
      const res = await postChat(baseUrl, { message: "oi", userId: "u1", reflect: "true" });
      assert.equal(res.status, 400);
    });

    it("responde 400 quando userId está ausente (008)", async () => {
      const res = await postChat(baseUrl, { message: "oi" });
      assert.equal(res.status, 400);
      const body = asRecord(await res.json());
      assert.ok(Array.isArray(body.issues));
      assert.ok((body.issues as unknown[]).length > 0);
    });

    it("responde 504 quando a execução excede o timeout configurado", async () => {
      const slow = slowStrategy("react", 200, FAKE_RUN);
      const { baseUrl: slowBaseUrl, close: closeSlow } = await startServer({
        strategies: { react: slow },
        store: new MemoryOpsStore(),
        conversationStore: new MemoryConversationStore(),
        memoryStore: newMemoryStore(),
        timeoutMs: 20,
      });
      try {
        const res = await postChat(slowBaseUrl, { message: "oi", userId: "u1" });
        assert.equal(res.status, 504);
      } finally {
        await closeSlow();
      }
    });
  });

  describe("User Story 2 (008) - memória semântica", () => {
    let close: () => Promise<void>;
    let baseUrl: string;
    let react: ReturnType<typeof fakeStrategy>;
    let memoryStore: SqliteMemoryStore;

    before(async () => {
      react = fakeStrategy("react", FAKE_RUN);
      memoryStore = newMemoryStore();
      ({ baseUrl, close } = await startServer({
        strategies: { react },
        store: new MemoryOpsStore(),
        conversationStore: new MemoryConversationStore(),
        memoryStore,
      }));
    });
    after(() => close());

    it("injeta fatos memorizados no StrategyInput, mesmo sem palavra em comum com a mensagem atual", async () => {
      await memoryStore.remember("u1", "só trabalho com Node e prefiro respostas curtas");

      const res = await postChat(baseUrl, {
        message: "que linguagem de programação você recomendaria pra mim usar aqui?",
        userId: "u1",
      });
      assert.equal(res.status, 200);
      assert.deepEqual(react.lastInput?.memories, [
        "só trabalho com Node e prefiro respostas curtas",
      ]);
    });

    it("sem memórias para o userId, responde normalmente sem memories no StrategyInput", async () => {
      const res = await postChat(baseUrl, { message: "oi", userId: "usuario-sem-memorias" });
      assert.equal(res.status, 200);
      assert.deepEqual(react.lastInput?.memories, []);
    });

    it("nunca injeta memória de um userId diferente (isolamento)", async () => {
      await memoryStore.remember("u3", "fato secreto de u3");

      const res = await postChat(baseUrl, { message: "conte um fato sobre mim", userId: "u4" });
      assert.equal(res.status, 200);
      assert.deepEqual(react.lastInput?.memories, []);
    });
  });

  describe("User Story 1 (009) - reflexo de aprendizado não atrasa a resposta", () => {
    let close: () => Promise<void>;
    let baseUrl: string;

    before(async () => {
      ({ baseUrl, close } = await startServer({
        strategies: { react: fakeStrategy("react", FAKE_RUN) },
        store: new MemoryOpsStore(),
        conversationStore: new MemoryConversationStore(),
        memoryStore: newMemoryStore(),
      }));
    });
    after(() => close());

    it("responde antes de qualquer reflexão de aprendizado terminar (fire-and-forget)", async () => {
      // A estratégia fake responde instantaneamente; se a resposta esperasse a
      // reflexão (uma chamada real ao modelo), levaria segundos — não milissegundos.
      const startedAt = Date.now();
      const res = await postChat(baseUrl, { message: "prefiro reuniões pela manhã", userId: "u9" });
      assert.equal(res.status, 200);
      assert.ok(Date.now() - startedAt < 1000);
    });
  });

  describe("User Story 3 (009) - forget_preference via conversa", () => {
    let close: () => Promise<void>;
    let baseUrl: string;
    let memoryStore: SqliteMemoryStore;

    /** Estratégia fake que usa a tool de memória exposta em input, como um agente real faria. */
    function forgetPreferenceStrategy(): ReasoningStrategy {
      return {
        name: "react",
        async run(input: StrategyInput): Promise<StrategyRun> {
          const [forgetPreference] = makeMemoryTools(input.memoryStore!, input.userId!);
          const raw = await forgetPreference!.invoke({ description: input.request });
          return {
            answer: raw as string,
            trace: [{ type: "answer", text: raw as string, partial: false }],
            metrics: { llmCalls: 0, latencyMs: 0, historyMessages: input.history?.length ?? 0 },
          };
        },
      };
    }

    before(async () => {
      memoryStore = newMemoryStore();
      ({ baseUrl, close } = await startServer({
        strategies: { react: forgetPreferenceStrategy() },
        store: new MemoryOpsStore(),
        conversationStore: new MemoryConversationStore(),
        memoryStore,
      }));
    });
    after(() => close());

    it("remove a preferência descrita pelo usuário através da tool disponível no agente", async () => {
      await memoryStore.remember("u1", "prefiro respostas curtas");

      const res = await postChat(baseUrl, {
        message: "pode esquecer que eu prefiro respostas curtas",
        userId: "u1",
      });
      assert.equal(res.status, 200);

      const recalled = await memoryStore.recall("u1", "prefiro respostas curtas");
      assert.equal(recalled.length, 0);
    });
  });
});
