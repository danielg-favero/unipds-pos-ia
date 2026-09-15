import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";

import { buildContextBreakdown } from "../context/tokens.js";
import type {
  ReasoningStrategy,
  RunMetrics,
  StrategyInput,
  StrategyRun,
  TraceEvent,
} from "../domain/strategy.js";
import { finishRun } from "../domain/strategy.js";
import { planAndExecuteStrategy } from "./plan-and-execute.js";
import { createModel } from "./model.js";
import { describeProviderError } from "./provider-errors.js";
import { reactStrategy } from "./react.js";
import { withReflection } from "./reflection.js";

/** Nomes de rota roteáveis pelo grafo unificado (013). */
export const ROUTE_NAMES = ["react", "plan-and-execute", "reflect"] as const;
export type RouteName = (typeof ROUTE_NAMES)[number];

export const isRouteName = (value: string): value is RouteName =>
  (ROUTE_NAMES as readonly string[]).includes(value);

/** Rota usada quando a decisão automática falha ou é ambígua (FR-008). */
export const DEFAULT_ROUTE: RouteName = "react";

export const routeSchema = z.object({
  route: z.enum(ROUTE_NAMES),
  reason: z.string().min(1).describe("Uma frase justificando a escolha"),
});

export type RouteDecision = z.infer<typeof routeSchema>;

/** Função de decisão de rota, injetável para testes determinísticos sem rede. */
export type RouteFn = (request: string) => Promise<RouteDecision>;

const ROUTER_SYSTEM_PROMPT = [
  "Você é o roteador do OpsPilot, copiloto de plantão de produção.",
  "Escolha, entre as rotas da tabela abaixo, a mais adequada para o pedido do plantonista.",
  "",
  "| Rota | Quando usar |",
  "| --- | --- |",
  "| react | Perguntas diretas ou exploratórias, resolvidas iterando ferramenta a ferramenta. |",
  "| plan-and-execute | Tarefas que exigem investigação em múltiplos passos coordenados e se beneficiam de um plano explícito. |",
  "| reflect | Pedidos em que a resposta deve ser autocriticada contra as observações antes de ser entregue, por maior risco de erro. |",
].join("\n");

export const defaultRouteFn: RouteFn = async (request) => {
  const raw = await createModel().withStructuredOutput(routeSchema).invoke([
    ["system", ROUTER_SYSTEM_PROMPT],
    ["user", request],
  ]);
  return routeSchema.parse(raw);
};

/** Catálogo padrão das estratégias-base roteáveis (013). */
export const routableStrategies: Readonly<Record<RouteName, ReasoningStrategy>> = {
  react: reactStrategy,
  "plan-and-execute": planAndExecuteStrategy,
  reflect: withReflection(reactStrategy, { name: "reflect" }),
};

const ProductionGraphState = Annotation.Root({
  input: Annotation<StrategyInput>(),
  overrideRoute: Annotation<string | undefined>(),
  trace: Annotation<TraceEvent[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  routeName: Annotation<RouteName | undefined>(),
  answer: Annotation<string>({ reducer: (_previous, next) => next, default: () => "" }),
  partial: Annotation<boolean>({ reducer: (_previous, next) => next, default: () => false }),
  metrics: Annotation<RunMetrics | undefined>(),
});

type State = typeof ProductionGraphState.State;

const MANUAL_OVERRIDE_REASON = "override manual via /chat";

async function decideRoute(
  input: StrategyInput,
  overrideRoute: string | undefined,
  routeFn: RouteFn,
): Promise<{ route: RouteName; event: TraceEvent }> {
  if (overrideRoute !== undefined) {
    if (isRouteName(overrideRoute)) {
      return {
        route: overrideRoute,
        event: { type: "route", route: overrideRoute, reason: MANUAL_OVERRIDE_REASON, manual: true },
      };
    }
    return {
      route: DEFAULT_ROUTE,
      event: {
        type: "route",
        route: DEFAULT_ROUTE,
        reason: `fallback: rota de override "${overrideRoute}" desconhecida`,
        manual: true,
      },
    };
  }

  try {
    const decision = await routeFn(input.request);
    if (!isRouteName(decision.route)) {
      throw new Error(`rota inválida devolvida pelo roteador: "${decision.route}"`);
    }
    return {
      route: decision.route,
      event: { type: "route", route: decision.route, reason: decision.reason, manual: false },
    };
  } catch (error) {
    return {
      route: DEFAULT_ROUTE,
      event: {
        type: "route",
        route: DEFAULT_ROUTE,
        reason: `fallback: ${describeProviderError(error)}`,
        manual: false,
      },
    };
  }
}

/**
 * O nó `context` existe para deixar essa etapa visível na topologia do grafo
 * (FR-004), sem duplicar trabalho: a montagem real do prompt (histórico,
 * memórias, resumo) acontece dentro de cada estratégia-base escolhida, como já
 * ocorre hoje em `react.ts`/`plan-and-execute.ts`.
 */
function contextNode(_state: State): Partial<State> {
  return {};
}

function makeRouterNode(routeFn: RouteFn) {
  return async function routerNode(state: State): Promise<Partial<State>> {
    const { route, event } = await decideRoute(state.input, state.overrideRoute, routeFn);
    return { routeName: route, trace: [event] };
  };
}

/** Último evento `answer`, se houver, e o restante do trace sem ele — reaberto pelo `respond` externo. */
function splitFinalAnswer(trace: readonly TraceEvent[]): {
  readonly rest: TraceEvent[];
  readonly answer: string;
  readonly partial: boolean;
} {
  const last = trace.at(-1);
  if (last?.type === "answer") {
    return { rest: trace.slice(0, -1), answer: last.text, partial: last.partial };
  }
  return { rest: [...trace], answer: "", partial: true };
}

function makeDispatchNode(strategy: ReasoningStrategy) {
  return async function dispatchNode(state: State): Promise<Partial<State>> {
    const run = await strategy.run(state.input);
    const { rest, answer, partial } = splitFinalAnswer(run.trace);
    return { trace: rest, answer, partial, metrics: run.metrics };
  };
}

/** Nó terminal: a finalização (`finishRun`) acontece fora do grafo, após `invoke`. */
function respondNode(_state: State): Partial<State> {
  return {};
}

function zeroMetrics(input: StrategyInput): RunMetrics {
  return {
    llmCalls: 0,
    latencyMs: 0,
    historyMessages: input.history?.length ?? 0,
    contextBreakdown: buildContextBreakdown({
      history: input.history ?? [],
      memories: input.memories ?? [],
      systemPrompt: "",
      request: input.request,
    }),
  };
}

function compileGraph(
  strategies: Readonly<Record<RouteName, ReasoningStrategy>>,
  routeFn: RouteFn,
) {
  return new StateGraph(ProductionGraphState)
    .addNode("context", contextNode)
    .addNode("router", makeRouterNode(routeFn))
    .addNode("react", makeDispatchNode(strategies.react))
    .addNode("plan-and-execute", makeDispatchNode(strategies["plan-and-execute"]))
    .addNode("reflect", makeDispatchNode(strategies.reflect))
    .addNode("respond", respondNode)
    .addEdge(START, "context")
    .addEdge("context", "router")
    .addConditionalEdges("router", (state: State) => state.routeName ?? DEFAULT_ROUTE, {
      react: "react",
      "plan-and-execute": "plan-and-execute",
      reflect: "reflect",
    })
    .addEdge("react", "respond")
    .addEdge("plan-and-execute", "respond")
    .addEdge("reflect", "respond")
    .addEdge("respond", END)
    .compile();
}

/**
 * Fábrica testável do grafo unificado (013): `routeFn` e `strategies` são
 * injetáveis para permitir testes determinísticos sem rede (ver
 * `production-graph.test.ts`), no mesmo espírito de `runReflection`/`critique`
 * em `reflection.ts`.
 */
export function buildProductionStrategy(
  routeFn: RouteFn = defaultRouteFn,
  strategies: Readonly<Record<RouteName, ReasoningStrategy>> = routableStrategies,
): ReasoningStrategy {
  const graph = compileGraph(strategies, routeFn);

  return {
    name: "production",

    async run(input: StrategyInput): Promise<StrategyRun> {
      try {
        const final = await graph.invoke({ input, overrideRoute: input.overrideRoute });
        return finishRun(final.trace, final.answer, final.partial, final.metrics ?? zeroMetrics(input));
      } catch (error) {
        // `run` nunca rejeita (mesma obrigação de react.ts/plan-and-execute.ts).
        return finishRun(
          [],
          `Execução interrompida: ${describeProviderError(error)}`,
          true,
          zeroMetrics(input),
        );
      }
    },
  };
}

export const productionStrategy: ReasoningStrategy = buildProductionStrategy();
