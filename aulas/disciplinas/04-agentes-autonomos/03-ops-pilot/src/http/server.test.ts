import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, describe, it } from "node:test";

import { buildProductionStrategy } from "../agents/production-graph.js";
import { makeMemoryTools } from "../agents/tools.js";
import type { StrategyInput, ReasoningStrategy, StrategyRun, TraceEvent } from "../domain/strategy.js";
import { MemoryConversationStore } from "../store/memory-conversation.js";
import type { HistorySummarizerFn } from "../memory/history-summarizer.js";
import { MemoryConversationSummaryStore } from "../store/memory-conversation-summary.js";
import { MemoryOpsStore } from "../store/memory.js";
import { SqliteMemoryStore } from "../store/sqlite/sqlite-memory-store.js";
import { SqliteRequestTraceStore } from "../store/sqlite/sqlite-request-trace-store.js";
import type { ServerDeps } from "./server.js";
import { createServer } from "./server.js";

const newMemoryStore = () => new SqliteMemoryStore(":memory:");
const newTraceStore = () => new SqliteRequestTraceStore(":memory:");

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

const ZERO_BREAKDOWN = { history: 0, memories: 0, systemPrompt: 0, request: 0 };

const FAKE_RUN: StrategyRun = {
  answer: "resposta fake",
  trace: [{ type: "answer", text: "resposta fake", partial: false }],
  metrics: { llmCalls: 1, latencyMs: 5, historyMessages: 0, contextBreakdown: ZERO_BREAKDOWN },
};

const CRITIQUE_RUN: StrategyRun = {
  answer: "resposta revisada",
  trace: [
    { type: "critique", text: "aprovado" },
    { type: "answer", text: "resposta revisada", partial: false },
  ],
  metrics: { llmCalls: 2, latencyMs: 10, historyMessages: 0, contextBreakdown: ZERO_BREAKDOWN },
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
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
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
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
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
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
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

  describe("User Story 1 (011) - resumo de histórico entra no contexto", () => {
    let close: () => Promise<void>;
    let baseUrl: string;
    let react: ReturnType<typeof fakeStrategy>;
    let summaryStore: MemoryConversationSummaryStore;
    const fakeSummarizer: HistorySummarizerFn = async (input) =>
      `${input.previousSummary} + lote`.trim();

    before(async () => {
      react = fakeStrategy("react", FAKE_RUN);
      summaryStore = new MemoryConversationSummaryStore();
      ({ baseUrl, close } = await startServer({
        strategies: { react },
        store: new MemoryOpsStore(),
        conversationStore: new MemoryConversationStore(),
        summaryStore,
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
        historySummarizerFn: fakeSummarizer,
      }));
    });
    after(() => close());

    // Cada turno de /chat grava 2 mensagens (user + assistant) — ver src/http/server.ts.
    // `turns` turnos produzem `2 * turns` mensagens na conversa.
    const sendTurns = async (conversation: string | undefined, turns: number): Promise<string> => {
      let current = conversation;
      for (let i = 0; i < turns; i += 1) {
        const res = await postChat(baseUrl, { message: `mensagem ${i}`, userId: "u1", conversation: current });
        current = asRecord(await res.json()).conversation as string;
      }
      if (current === undefined) throw new Error("turns deve ser >= 1");
      return current;
    };

    it("conversa com 8 ou menos mensagens não cria resumo (FR-009)", async () => {
      const conversation = await sendTurns(undefined, 4); // 8 mensagens
      assert.equal(await summaryStore.get(conversation), undefined);
    });

    it("após 16 mensagens, o resumo é persistido e entra no contexto da próxima mensagem", async () => {
      const conversation = await sendTurns(undefined, 8); // 16 mensagens
      const persisted = await summaryStore.get(conversation);
      assert.ok(persisted);
      assert.equal(persisted.summarizedThrough, 8);

      await sendTurns(conversation, 1); // 18 mensagens: ainda não completa o próximo lote de 8
      assert.equal(react.lastInput?.historySummary, persisted.summary);
    });

    it("antes de completar o próximo lote de 8, o resumo não muda de novo", async () => {
      const conversation = await sendTurns(undefined, 8); // 16 mensagens
      const afterFirstBatch = await summaryStore.get(conversation);

      await sendTurns(conversation, 3); // 22 mensagens: ainda falta 1 lote completo (precisa de 24)
      assert.deepEqual(await summaryStore.get(conversation), afterFirstBatch);
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
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
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
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
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
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
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
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore,
        requestTraceStore: newTraceStore(),
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
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
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
            metrics: {
              llmCalls: 0,
              latencyMs: 0,
              historyMessages: input.history?.length ?? 0,
              contextBreakdown: ZERO_BREAKDOWN,
            },
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
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore,
        requestTraceStore: newTraceStore(),
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

  describe("User Story 1/2/3 (013) - grafo unificado com roteamento automático", () => {
    let close: () => Promise<void>;
    let baseUrl: string;
    let react: ReturnType<typeof fakeStrategy>;
    let planAndExecute: ReturnType<typeof fakeStrategy>;
    let reflect: ReturnType<typeof fakeStrategy>;
    let production: ReasoningStrategy;

    before(async () => {
      react = fakeStrategy("react", FAKE_RUN);
      planAndExecute = fakeStrategy("plan-and-execute", FAKE_RUN);
      reflect = fakeStrategy("reflect", FAKE_RUN);
      production = buildProductionStrategy(
        async () => ({ route: "plan-and-execute", reason: "tarefa de múltiplos passos" }),
        { react, "plan-and-execute": planAndExecute, reflect },
      );
      ({ baseUrl, close } = await startServer({
        strategies: { react, "plan-and-execute": planAndExecute, reflect, production },
        store: new MemoryOpsStore(),
        conversationStore: new MemoryConversationStore(),
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
      }));
    });
    after(() => close());

    it("US1/US2: sem strategy, roteia automaticamente e o trace começa com o evento route", async () => {
      const res = await postChat(baseUrl, { message: "investigue a causa raiz da degradação", userId: "u1" });
      assert.equal(res.status, 200);
      const body = asRecord(await res.json());
      const trace = body.trace as TraceEvent[];
      assert.equal(planAndExecute.calls, 1);
      assert.deepEqual(trace[0], {
        type: "route",
        route: "plan-and-execute",
        reason: "tarefa de múltiplos passos",
        manual: false,
      });
    });

    it("US3: com strategy explícita, executa exatamente essa rota e sinaliza manual:true no trace", async () => {
      const reactCallsBefore = react.calls;
      const planAndExecuteCallsBefore = planAndExecute.calls;
      const res = await postChat(baseUrl, { message: "qual o status?", userId: "u1", strategy: "react" });
      assert.equal(res.status, 200);
      const body = asRecord(await res.json());
      const trace = body.trace as TraceEvent[];
      assert.equal(react.calls, reactCallsBefore + 1);
      assert.equal(planAndExecute.calls, planAndExecuteCallsBefore);
      assert.deepEqual(trace[0], {
        type: "route",
        route: "react",
        reason: "override manual via /chat",
        manual: true,
      });
    });

    it("responde 422 quando a estratégia informada continua desconhecida (regressão)", async () => {
      const res = await postChat(baseUrl, { message: "oi", userId: "u1", strategy: "nao-existe" });
      assert.equal(res.status, 422);
      const body = asRecord(await res.json());
      assert.equal(body.requested, "nao-existe");
    });
  });
});

describe("POST /chat — métricas de contexto (010)", () => {
  let close: () => Promise<void>;
  let baseUrl: string;

  afterEach(() => close());

  it("responde 200 e omite promptTokensReal quando a estratégia não reporta uso real (US3)", async () => {
    const react = fakeStrategy("react", {
      answer: "resposta fake",
      trace: [{ type: "answer", text: "resposta fake", partial: false }],
      metrics: { llmCalls: 1, latencyMs: 5, historyMessages: 0, contextBreakdown: ZERO_BREAKDOWN },
    });
    ({ baseUrl, close } = await startServer({
      strategies: { react },
      store: new MemoryOpsStore(),
      conversationStore: new MemoryConversationStore(),
      summaryStore: new MemoryConversationSummaryStore(),
      memoryStore: newMemoryStore(),
      requestTraceStore: newTraceStore(),
    }));

    const res = await postChat(baseUrl, { message: "oi", userId: "u1" });
    assert.equal(res.status, 200);
    const body = asRecord(await res.json());
    const metrics = asRecord(body.metrics);
    assert.equal("promptTokensReal" in metrics, false);
    assert.deepEqual(metrics.contextBreakdown, ZERO_BREAKDOWN);
  });

  it("propaga contextBreakdown e promptTokensReal quando presentes na estratégia", async () => {
    const breakdown = { history: 10, memories: 5, systemPrompt: 20, request: 3 };
    const react = fakeStrategy("react", {
      answer: "resposta fake",
      trace: [{ type: "answer", text: "resposta fake", partial: false }],
      metrics: {
        llmCalls: 1,
        latencyMs: 5,
        historyMessages: 0,
        promptTokensReal: 850,
        contextBreakdown: breakdown,
      },
    });
    ({ baseUrl, close } = await startServer({
      strategies: { react },
      store: new MemoryOpsStore(),
      conversationStore: new MemoryConversationStore(),
      summaryStore: new MemoryConversationSummaryStore(),
      memoryStore: newMemoryStore(),
      requestTraceStore: newTraceStore(),
    }));

    const res = await postChat(baseUrl, { message: "oi", userId: "u1" });
    assert.equal(res.status, 200);
    const body = asRecord(await res.json());
    const metrics = asRecord(body.metrics);
    assert.equal(metrics.promptTokensReal, 850);
    assert.deepEqual(metrics.contextBreakdown, breakdown);
  });
});

describe("POST/GET/DELETE /memories", () => {
  let close: () => Promise<void>;
  let baseUrl: string;
  let memoryStore: SqliteMemoryStore;

  before(async () => {
    memoryStore = newMemoryStore();
    ({ baseUrl, close } = await startServer({
      strategies: { react: fakeStrategy("react", FAKE_RUN) },
      store: new MemoryOpsStore(),
      conversationStore: new MemoryConversationStore(),
      summaryStore: new MemoryConversationSummaryStore(),
      memoryStore,
      requestTraceStore: newTraceStore(),
    }));
  });
  after(() => close());

  it("POST /memories memoriza um fato para o userId", async () => {
    const res = await fetch(`${baseUrl}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", fact: "prefere alertas críticos primeiro" }),
    });
    assert.equal(res.status, 201);

    const recalled = await memoryStore.recall("u1", "alertas críticos primeiro");
    assert.ok(recalled.some((memory) => memory.fact === "prefere alertas críticos primeiro"));
  });

  it("POST /memories responde 400 com corpo inválido (sem fact)", async () => {
    const res = await fetch(`${baseUrl}/memories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1" }),
    });
    assert.equal(res.status, 400);
  });

  it("GET /memories recupera os fatos mais relevantes do userId", async () => {
    await memoryStore.remember("u2", "prefere respostas curtas");

    const res = await fetch(
      `${baseUrl}/memories?${new URLSearchParams({ userId: "u2", query: "respostas curtas" })}`,
    );
    assert.equal(res.status, 200);
    const body = asRecord(await res.json());
    const memories = body.memories as { fact: string }[];
    assert.ok(memories.some((memory) => memory.fact === "prefere respostas curtas"));
  });

  it("GET /memories responde 400 sem userId", async () => {
    const res = await fetch(`${baseUrl}/memories?${new URLSearchParams({ query: "algo" })}`);
    assert.equal(res.status, 400);
  });

  it("DELETE /memories/:id esquece o fato; recall subsequente não o retorna mais", async () => {
    await memoryStore.remember("u3", "fato a ser removido via HTTP");
    const [memory] = await memoryStore.recall("u3", "fato a ser removido via HTTP");
    assert.ok(memory);

    const res = await fetch(
      `${baseUrl}/memories/${memory.id}?${new URLSearchParams({ userId: "u3" })}`,
      { method: "DELETE" },
    );
    assert.equal(res.status, 200);

    const recalled = await memoryStore.recall("u3", "fato a ser removido via HTTP");
    assert.equal(recalled.length, 0);
  });

  it("DELETE /memories/:id de um id inexistente não falha (idempotente)", async () => {
    const res = await fetch(
      `${baseUrl}/memories/id-inexistente?${new URLSearchParams({ userId: "u3" })}`,
      { method: "DELETE" },
    );
    assert.equal(res.status, 200);
  });

  it("DELETE /memories/:id responde 400 sem userId", async () => {
    const res = await fetch(`${baseUrl}/memories/qualquer-id`, { method: "DELETE" });
    assert.equal(res.status, 400);
  });
});

describe("Trace persistido e logs estruturados (015)", () => {
  /** A persistência é fire-and-forget após a resposta — espera até aparecer ou estourar o prazo. */
  async function waitForRequest(
    baseUrl: string,
    id: string,
    timeoutMs = 1000,
  ): Promise<Response> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await fetch(`${baseUrl}/requests/${id}`);
      if (res.status !== 404 || Date.now() > deadline) return res;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  describe("US1 - correlacionar uma requisição do início ao fim", () => {
    let close: () => Promise<void>;
    let baseUrl: string;

    before(async () => {
      ({ baseUrl, close } = await startServer({
        strategies: { react: fakeStrategy("react", CRITIQUE_RUN) },
        store: new MemoryOpsStore(),
        conversationStore: new MemoryConversationStore(),
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
      }));
    });
    after(() => close());

    it("devolve o mesmo requestId no header X-Request-Id e no corpo", async () => {
      const res = await postChat(baseUrl, { message: "oi", userId: "u1" });
      assert.equal(res.status, 200);
      const body = asRecord(await res.json());
      assert.equal(typeof body.requestId, "string");
      assert.equal(res.headers.get("x-request-id"), body.requestId);
    });

    it("GET /requests/:id recupera o registro e o trace depois que o chat conclui", async () => {
      const res = await postChat(baseUrl, { message: "abra um incidente", userId: "u1" });
      const body = asRecord(await res.json());
      const requestId = body.requestId as string;

      const found = await waitForRequest(baseUrl, requestId);
      assert.equal(found.status, 200);
      const foundBody = asRecord(await found.json());
      const request = asRecord(foundBody.request);
      assert.equal(request.id, requestId);
      assert.equal(request.status, "ok");
      assert.ok(Array.isArray(foundBody.trace));
      assert.equal((foundBody.trace as unknown[]).length, CRITIQUE_RUN.trace.length);
    });

    it("GET /requests/:id com id inexistente responde 404", async () => {
      const res = await fetch(`${baseUrl}/requests/id-nunca-visto`);
      assert.equal(res.status, 404);
      const body = asRecord(await res.json());
      assert.equal(typeof body.error, "string");
    });
  });

  describe("US2 - inspecionar as etapas internas de processamento", () => {
    let close: () => Promise<void>;
    let baseUrl: string;

    before(async () => {
      ({ baseUrl, close } = await startServer({
        strategies: { react: fakeStrategy("react", CRITIQUE_RUN) },
        store: new MemoryOpsStore(),
        conversationStore: new MemoryConversationStore(),
        summaryStore: new MemoryConversationSummaryStore(),
        memoryStore: newMemoryStore(),
        requestTraceStore: newTraceStore(),
      }));
    });
    after(() => close());

    it("cada evento aparece separado, com node correto, ordenado por seq", async () => {
      const res = await postChat(baseUrl, { message: "investigue", userId: "u1" });
      const requestId = (asRecord(await res.json()).requestId as string);

      const found = await waitForRequest(baseUrl, requestId);
      const trace = asRecord(await found.json()).trace as Record<string, unknown>[];

      assert.deepEqual(
        trace.map((item) => item.seq),
        CRITIQUE_RUN.trace.map((_, index) => index),
      );
      assert.deepEqual(
        trace.map((item) => item.node),
        CRITIQUE_RUN.trace.map((event) => event.type),
      );
      assert.deepEqual(
        trace.map((item) => item.event),
        CRITIQUE_RUN.trace,
      );
    });
  });
});

describe("GET /stats", () => {
  let close: () => Promise<void>;
  let baseUrl: string;

  /** `/stats` só reflete requisições já persistidas (fire-and-forget) — espera até o total bater. */
  async function waitForTotal(baseUrl: string, expected: number, timeoutMs = 1000): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const res = await fetch(`${baseUrl}/stats?since=1h`);
      const body = (await res.json()) as Record<string, unknown>;
      if (body.total === expected || Date.now() > deadline) return body;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  const okRun = (modelUsed: string, promptTokensReal: number): StrategyRun => ({
    answer: "ok",
    trace: [
      { type: "route", route: "react", reason: "pergunta direta", manual: false },
      { type: "answer", text: "ok", partial: false },
    ],
    metrics: {
      llmCalls: 1,
      latencyMs: 5,
      historyMessages: 0,
      contextBreakdown: ZERO_BREAKDOWN,
      promptTokensReal,
      modelUsed,
    },
  });

  before(async () => {
    let calls = 0;
    const react: ReasoningStrategy = {
      name: "react",
      async run() {
        calls += 1;
        if (calls > 2) throw new Error("falha proposital");
        return calls === 1 ? okRun("openai/gpt-4o-mini", 2000) : okRun("meta-llama/llama-3-8b:free", 5000);
      },
    };

    ({ baseUrl, close } = await startServer({
      strategies: { react },
      store: new MemoryOpsStore(),
      conversationStore: new MemoryConversationStore(),
      summaryStore: new MemoryConversationSummaryStore(),
      memoryStore: newMemoryStore(),
      requestTraceStore: newTraceStore(),
    }));

    await postChat(baseUrl, { message: "primeira", userId: "u1" });
    await postChat(baseUrl, { message: "segunda", userId: "u1" });
    await postChat(baseUrl, { message: "terceira (falha)", userId: "u1" });
  });
  after(() => close());

  it("responde 400 para since em formato inválido", async () => {
    const res = await fetch(`${baseUrl}/stats?since=abc`);
    assert.equal(res.status, 400);
  });

  it("agrega total/erros/tokens/custo e p50/p95 de latência", async () => {
    const body = await waitForTotal(baseUrl, 3);
    assert.equal(body.total, 3);
    assert.equal(body.errors, 1);
    assert.equal(body.tokens, 7000);
    // gpt-4o-mini cobra; llama :free não. custo > 0 mas não exatamente previsível pela
    // tabela de preços interna — só confirmamos que reflete o modelo pago.
    assert.ok((body.costUsd as number) > 0);
    const latencyMs = body.latencyMs as { p50: number; p95: number };
    assert.equal(typeof latencyMs.p50, "number");
    assert.equal(typeof latencyMs.p95, "number");
  });

  it("agrupa por rota e por modelo", async () => {
    const body = await waitForTotal(baseUrl, 3);
    const byRoute = body.byRoute as { key: string; total: number }[];
    const byModel = body.byModel as { key: string; total: number }[];

    const reactGroup = byRoute.find((g) => g.key === "react");
    assert.equal(reactGroup?.total, 2);
    const unknownRouteGroup = byRoute.find((g) => g.key === "desconhecida");
    assert.equal(unknownRouteGroup?.total, 1); // a requisição com erro não tem rota

    const paidModel = byModel.find((g) => g.key === "openai/gpt-4o-mini");
    assert.equal(paidModel?.total, 1);
    const freeModel = byModel.find((g) => g.key === "meta-llama/llama-3-8b:free");
    assert.equal(freeModel?.total, 1);
  });
});
