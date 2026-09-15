import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReasoningStrategy, StrategyInput, StrategyRun, TraceEvent } from "../domain/strategy.js";
import type { RouteDecision, RouteFn, RouteName } from "./production-graph.js";
import { DEFAULT_ROUTE, ROUTE_NAMES, buildProductionStrategy } from "./production-graph.js";

const ZERO_BREAKDOWN = { history: 0, memories: 0, systemPrompt: 0, request: 0 };

const answerEvent = (text: string): TraceEvent => ({ type: "answer", text, partial: false });

/** Estratégia-base fake determinística: sem rede, devolve uma resposta fixa. */
function fakeStrategy(name: string, answer: string): ReasoningStrategy & { calls: number } {
  const strategy = {
    name,
    calls: 0,
    async run(): Promise<StrategyRun> {
      strategy.calls += 1;
      return {
        answer,
        trace: [
          { type: "action", tool: "list_alerts", args: {} },
          { type: "observation", ok: true, result: {} },
          answerEvent(answer),
        ],
        metrics: {
          llmCalls: 1,
          latencyMs: 1,
          historyMessages: 0,
          contextBreakdown: ZERO_BREAKDOWN,
        },
      };
    },
  };
  return strategy;
}

const fakeStrategies = (): Record<RouteName, ReturnType<typeof fakeStrategy>> => ({
  react: fakeStrategy("react", "resposta react"),
  "plan-and-execute": fakeStrategy("plan-and-execute", "resposta plan-and-execute"),
  reflect: fakeStrategy("reflect", "resposta reflect"),
});

const routeFnReturning = (decision: RouteDecision): RouteFn => async () => decision;

const routeFnThrowing = (message: string): RouteFn => async () => {
  throw new Error(message);
};

const baseInput: StrategyInput = {
  request: "qual o status do serviço de pagamentos?",
  maxIterations: 8,
  store: {} as StrategyInput["store"],
};

describe("production-graph — roteamento automático (US1)", () => {
  it("chama a estratégia-base escolhida pelo roteador e devolve a resposta dela", async () => {
    const strategies = fakeStrategies();
    const strategy = buildProductionStrategy(
      routeFnReturning({ route: "plan-and-execute", reason: "tarefa de múltiplos passos" }),
      strategies,
    );

    const run = await strategy.run(baseInput);

    assert.equal(run.answer, "resposta plan-and-execute");
    assert.equal(strategies["plan-and-execute"].calls, 1);
    assert.equal(strategies.react.calls, 0);
  });

  it("o trace começa com um evento route (manual: false) e termina com answer", async () => {
    const strategies = fakeStrategies();
    const strategy = buildProductionStrategy(
      routeFnReturning({ route: "react", reason: "pergunta direta" }),
      strategies,
    );

    const run = await strategy.run(baseInput);

    assert.equal(run.trace[0]?.type, "route");
    assert.deepEqual(run.trace[0], {
      type: "route",
      route: "react",
      reason: "pergunta direta",
      manual: false,
    });
    assert.equal(run.trace.at(-1)?.type, "answer");
  });

  for (const route of ROUTE_NAMES) {
    it(`roteia corretamente para a estratégia "${route}"`, async () => {
      const strategies = fakeStrategies();
      const strategy = buildProductionStrategy(
        routeFnReturning({ route, reason: "escolha do teste" }),
        strategies,
      );

      const run = await strategy.run(baseInput);

      assert.equal(strategies[route].calls, 1);
      assert.equal(run.answer, `resposta ${route}`);
    });
  }
});

describe("production-graph — fallback do roteador (FR-008)", () => {
  it("cai na estratégia padrão quando o roteador lança erro, e ainda assim retorna uma resposta", async () => {
    const strategies = fakeStrategies();
    const strategy = buildProductionStrategy(routeFnThrowing("provedor indisponível"), strategies);

    const run = await strategy.run(baseInput);

    assert.equal(strategies[DEFAULT_ROUTE].calls, 1);
    assert.equal(run.answer, `resposta ${DEFAULT_ROUTE}`);
    const routeEvent = run.trace[0];
    assert.equal(routeEvent?.type, "route");
    assert.ok(routeEvent?.type === "route" && routeEvent.reason.startsWith("fallback:"));
    assert.equal(routeEvent?.type === "route" && routeEvent.manual, false);
  });

  it("cai na estratégia padrão quando o roteador devolve uma rota fora do catálogo", async () => {
    const strategies = fakeStrategies();
    const routeFn: RouteFn = async () =>
      ({ route: "rota-inexistente", reason: "..." }) as unknown as RouteDecision;
    const strategy = buildProductionStrategy(routeFn, strategies);

    const run = await strategy.run(baseInput);

    assert.equal(strategies[DEFAULT_ROUTE].calls, 1);
    const routeEvent = run.trace[0];
    assert.ok(routeEvent?.type === "route" && routeEvent.reason.startsWith("fallback:"));
  });
});

describe("production-graph — override manual (US3)", () => {
  it("pula a chamada ao roteador quando overrideRoute é válido, e marca o evento route como manual", async () => {
    const strategies = fakeStrategies();
    let routeFnCalls = 0;
    const routeFn: RouteFn = async () => {
      routeFnCalls += 1;
      return { route: "react", reason: "não deveria ser usado" };
    };
    const strategy = buildProductionStrategy(routeFn, strategies);

    const run = await strategy.run({ ...baseInput, overrideRoute: "plan-and-execute" });

    assert.equal(routeFnCalls, 0);
    assert.equal(strategies["plan-and-execute"].calls, 1);
    assert.deepEqual(run.trace[0], {
      type: "route",
      route: "plan-and-execute",
      reason: "override manual via /chat",
      manual: true,
    });
  });

  it("cai no fallback com manual:true quando overrideRoute não é uma rota conhecida", async () => {
    const strategies = fakeStrategies();
    const strategy = buildProductionStrategy(routeFnThrowing("não deveria ser chamado"), strategies);

    const run = await strategy.run({ ...baseInput, overrideRoute: "estrategia-desconhecida" });

    assert.equal(strategies[DEFAULT_ROUTE].calls, 1);
    const routeEvent = run.trace[0];
    assert.ok(routeEvent?.type === "route" && routeEvent.manual === true);
    assert.ok(routeEvent?.type === "route" && routeEvent.reason.startsWith("fallback:"));
  });
});
