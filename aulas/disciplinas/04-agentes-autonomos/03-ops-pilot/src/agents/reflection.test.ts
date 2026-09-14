import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReasoningStrategy, StrategyRun, TraceEvent } from "../domain/strategy.js";
import type { CriticFn, Verdict } from "./reflection.js";
import {
  DEFAULT_MAX_REFLECTION,
  critique,
  observationsOf,
  runReflection,
  verdictSchema,
} from "./reflection.js";

const answerEvent = (text: string): TraceEvent => ({ type: "answer", text, partial: false });

/** Estratégia base falsa: devolve uma resposta fixa por chamada, na ordem dada. */
function fakeStrategy(answers: readonly string[]): ReasoningStrategy & { calls: number } {
  const strategy = {
    name: "fake",
    calls: 0,
    async run(): Promise<StrategyRun> {
      const answer = answers[Math.min(strategy.calls, answers.length - 1)] ?? "";
      strategy.calls += 1;
      const trace: TraceEvent[] = [
        { type: "action", tool: "list_alerts", args: { status: "firing" } },
        { type: "observation", ok: true, result: { alerts: [] } },
        answerEvent(answer),
      ];
      return { answer, trace, metrics: { llmCalls: 1, latencyMs: 1, historyMessages: 0 } };
    },
  };
  return strategy;
}

/** Crítico falso: aprova/reprova conforme roteiro fixo, sem tocar rede. */
function scriptedCritic(verdicts: readonly Verdict[]): CriticFn & { calls: number } {
  const critic = Object.assign(
    async (): Promise<Verdict> => {
      const verdict = verdicts[Math.min(critic.calls, verdicts.length - 1)]!;
      critic.calls += 1;
      return verdict;
    },
    { calls: 0 },
  );
  return critic;
}

const approve = (feedback = "consistente com as observações"): Verdict => ({
  approved: true,
  feedback,
});
const reject = (feedback = "a resposta ignora o alerta mais crítico"): Verdict => ({
  approved: false,
  feedback,
});

describe("observationsOf", () => {
  it("mantém apenas action e observation", () => {
    const trace: TraceEvent[] = [
      { type: "thought", text: "vou verificar" },
      { type: "action", tool: "list_alerts", args: {} },
      { type: "observation", ok: true },
      { type: "critique", text: "[seguir] ok" },
      answerEvent("pronto"),
    ];
    assert.deepEqual(
      observationsOf(trace).map((event) => event.type),
      ["action", "observation"],
    );
  });

  it("devolve lista vazia quando não há ações", () => {
    assert.deepEqual(observationsOf([{ type: "thought", text: "x" }, answerEvent("y")]), []);
  });
});

describe("runReflection — User Story 1: aprovação e regeneração", () => {
  it("aprova na primeira tentativa: nenhuma regeneração, uma chamada ao crítico", async () => {
    const base = fakeStrategy(["3 alertas em disparo"]);
    const critic = scriptedCritic([approve()]);
    const strategy = runReflection(base, critic);

    const result = await strategy.run({ request: "liste os alertas", maxIterations: 8, store: {} as never });

    assert.equal(base.calls, 1);
    assert.equal(critic.calls, 1);
    assert.equal(result.answer, "3 alertas em disparo");
    assert.equal(result.metrics.llmCalls, 2); // 1 da base + 1 do crítico
    assert.deepEqual(
      result.trace.map((event) => event.type),
      ["action", "observation", "critique", "answer"],
    );
    const critiqueEvent = result.trace.find((event) => event.type === "critique");
    assert.match((critiqueEvent as { text: string }).text, /^\[aprovado\]/);
  });

  it("reprova uma vez, aprova na segunda: duas tentativas da base, dois vereditos, sem terceira", async () => {
    const base = fakeStrategy(["resposta ruim", "resposta corrigida"]);
    const critic = scriptedCritic([reject(), approve()]);
    const strategy = runReflection(base, critic);

    const result = await strategy.run({ request: "abra um incidente", maxIterations: 8, store: {} as never });

    assert.equal(base.calls, 2);
    assert.equal(critic.calls, 2);
    assert.equal(result.answer, "resposta corrigida");
    assert.equal(result.metrics.llmCalls, 4); // 2 tentativas x1 + 2 críticas x1
    const critiques = result.trace.filter((event) => event.type === "critique") as {
      text: string;
    }[];
    assert.equal(critiques.length, 2);
    assert.match(critiques[0]!.text, /^\[reprovado\]/);
    assert.match(critiques[1]!.text, /^\[aprovado\]/);
    assert.deepEqual(result.trace.at(-1), answerEvent("resposta corrigida"));
  });

  it("preserva os eventos de ambas as tentativas no trace, na ordem", async () => {
    const base = fakeStrategy(["a", "b"]);
    const critic = scriptedCritic([reject(), approve()]);
    const strategy = runReflection(base, critic);

    const result = await strategy.run({ request: "x", maxIterations: 8, store: {} as never });

    assert.deepEqual(
      result.trace.map((event) => event.type),
      ["action", "observation", "critique", "action", "observation", "critique", "answer"],
    );
  });
});

describe("runReflection — User Story 2: guardrails", () => {
  it("nunca excede maxReflection: 3 tentativas no total com o padrão 2, nunca uma quarta", async () => {
    const base = fakeStrategy(["sempre errado"]);
    const critic = scriptedCritic([reject(), reject(), reject(), reject()]);
    const strategy = runReflection(base, critic);

    const result = await strategy.run({ request: "x", maxIterations: 20, store: {} as never });

    assert.equal(base.calls, DEFAULT_MAX_REFLECTION + 1);
    assert.equal(critic.calls, DEFAULT_MAX_REFLECTION + 1);
    assert.equal(result.metrics.llmCalls, (DEFAULT_MAX_REFLECTION + 1) * 2);
  });

  it("ao esgotar o orçamento, entrega a resposta da última tentativa marcada como parcial", async () => {
    const base = fakeStrategy(["primeira", "segunda", "terceira"]);
    const critic = scriptedCritic([reject(), reject(), reject()]);
    const strategy = runReflection(base, critic, { maxReflection: 2 });

    const result = await strategy.run({ request: "x", maxIterations: 8, store: {} as never });

    assert.equal(result.answer, "terceira");
    assert.equal(result.trace.at(-1)?.type, "answer");
    assert.equal((result.trace.at(-1) as { partial: boolean }).partial, true);
  });

  it("respeita um maxReflection customizado, menor que o padrão", async () => {
    const base = fakeStrategy(["nunca satisfaz"]);
    const critic = scriptedCritic([reject(), reject()]);
    const strategy = runReflection(base, critic, { maxReflection: 1 });

    await strategy.run({ request: "x", maxIterations: 8, store: {} as never });

    assert.equal(base.calls, 2); // original + 1 regeneração
    assert.equal(critic.calls, 2);
  });

  it("maxReflection: 0 nunca chama o crítico e devolve a resposta da base intacta", async () => {
    const base = fakeStrategy(["resposta direta"]);
    const critic = scriptedCritic([approve()]);
    const strategy = runReflection(base, critic, { maxReflection: 0 });

    const result = await strategy.run({ request: "x", maxIterations: 8, store: {} as never });

    assert.equal(base.calls, 1);
    assert.equal(critic.calls, 0);
    assert.equal(result.metrics.llmCalls, 1);
    assert.ok(!result.trace.some((event) => event.type === "critique"));
  });

  it("nomeia a estratégia como reflect:<base.name> por padrão", () => {
    const base = fakeStrategy(["x"]);
    assert.equal(runReflection(base, scriptedCritic([approve()])).name, "reflect:fake");
  });

  it("aceita um nome customizado", () => {
    const base = fakeStrategy(["x"]);
    assert.equal(
      runReflection(base, scriptedCritic([approve()]), { name: "custom" }).name,
      "custom",
    );
  });
});

describe("verdictSchema — veredito malformado (RF13)", () => {
  it("recusa payload sem approved", () => {
    assert.equal(verdictSchema.safeParse({ feedback: "x" }).success, false);
  });

  it("recusa feedback vazio", () => {
    assert.equal(verdictSchema.safeParse({ approved: true, feedback: "" }).success, false);
  });

  it("um crítico que devolve veredito inválido é tratado como reprovação, não como exceção", async () => {
    const base = fakeStrategy(["a", "b"]);
    // Simula o comportamento de `critique`: saída malformada -> reprovação genérica.
    const malformedThenOk: CriticFn & { calls: number } = Object.assign(
      async (): Promise<Verdict> => {
        malformedThenOk.calls += 1;
        return malformedThenOk.calls === 1
          ? { approved: false, feedback: "veredito não pôde ser interpretado" }
          : approve();
      },
      { calls: 0 },
    );
    const strategy = runReflection(base, malformedThenOk);

    const result = await strategy.run({ request: "x", maxIterations: 8, store: {} as never });

    assert.equal(result.answer, "b");
    assert.equal(base.calls, 2);
  });
});

describe("critique — falha do provedor vira reprovação, nunca exceção (RF14)", () => {
  it("uma promise rejeitada dentro de critique é convertida em veredito de reprovação", async () => {
    // Sem credenciais no ambiente, createModel() lança ConfigError dentro do
    // try de `critique` — é a forma determinística de exercitar esse caminho
    // sem rede: a mesma árvore de código que trataria um 429 real do provedor.
    const previousKey = process.env.OPENROUTER_API_KEY;
    const previousModel = process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    try {
      const verdict = await critique("pedido", { answer: "resposta", trace: [] });
      assert.equal(verdict.approved, false);
      assert.match(verdict.feedback, /Crítico indisponível/);
    } finally {
      if (previousKey !== undefined) process.env.OPENROUTER_API_KEY = previousKey;
      if (previousModel !== undefined) process.env.OPENROUTER_MODEL = previousModel;
    }
  });
});

describe("runReflection — a mesma resiliência se reflete na execução completa", () => {
  it("um crítico que sempre reporta indisponibilidade ainda preserva trace, métricas e resposta", async () => {
    const base = fakeStrategy(["única resposta"]);
    const unavailableCritic: CriticFn = async () => ({
      approved: false,
      feedback: "Crítico indisponível: OpenRouter recusou a chamada por limite de uso (429).",
    });
    const strategy = runReflection(base, unavailableCritic, { maxReflection: 1 });

    const result = await strategy.run({ request: "x", maxIterations: 8, store: {} as never });

    assert.equal(result.answer, "única resposta");
    assert.equal(result.trace.at(-1)?.type, "answer");
    assert.equal((result.trace.at(-1) as { partial: boolean }).partial, true);
    assert.ok(result.metrics.llmCalls > 0);
  });
});
