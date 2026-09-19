import { END, START, StateGraph } from "@langchain/langgraph";

import { describeProviderError } from "../agents/provider-errors.js";
import { buildContextBreakdown } from "../context/tokens.js";
import type {
  ReasoningStrategy,
  RunMetrics,
  StrategyInput,
  StrategyRun,
  TraceEvent,
} from "../domain/strategy.js";
import { finishRun } from "../domain/strategy.js";
import { analistaNode } from "./roles/analista.js";
import { executorNode } from "./roles/executor.js";
import { planejadorNode } from "./roles/planejador.js";
import { MAX_HANDOFFS, TeamState, type BlackboardEntry, type State, type TeamRole } from "./state.js";
import { decideNext, defaultSupervisorFn, type SupervisorFn } from "./supervisor.js";

export type RoleRun = (state: State) => Promise<{ entry: BlackboardEntry; events: readonly TraceEvent[] }>;

export const defaultRoleRuns: Readonly<Record<TeamRole, RoleRun>> = {
  analista: analistaNode,
  planejador: planejadorNode,
  executor: executorNode,
};

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

const CAP_REASON = `teto de ${MAX_HANDOFFS} transições atingido`;

function makeSupervisorNode(supervisorFn: SupervisorFn) {
  return async function supervisorNode(state: State): Promise<Partial<State>> {
    if (state.handoffCount >= MAX_HANDOFFS) {
      return {
        next: "done",
        partial: true,
        trace: [{ type: "handoff", from: "supervisor", to: "done", brief: CAP_REASON }],
      };
    }

    const decision = await decideNext(state, supervisorFn);
    const isHandoffToRole = decision.next !== "done";

    return {
      next: decision.next,
      pendingBrief: decision.brief,
      handoffCount: isHandoffToRole ? state.handoffCount + 1 : state.handoffCount,
      trace: [{ type: "handoff", from: "supervisor", to: decision.next, brief: decision.brief }],
    };
  };
}

function makeRoleNode(run: RoleRun) {
  return async function roleNode(state: State): Promise<Partial<State>> {
    const { entry, events } = await run(state);
    return { blackboard: [entry], trace: [...events] };
  };
}

/** Nó terminal: compõe a resposta final a partir da última contribuição do quadro (FR-013 quando truncado). */
function respondNode(state: State): Partial<State> {
  const last = state.blackboard.at(-1);
  const base = last?.summary.trim() || "Não foi possível concluir a investigação com as contribuições disponíveis.";
  const answer = state.partial
    ? `${base}\n\n(Encerrado automaticamente: ${CAP_REASON} entre especialistas.)`
    : base;
  return { answer };
}

function compileGraph(
  supervisorFn: SupervisorFn,
  roleRuns: Readonly<Record<TeamRole, RoleRun>>,
) {
  return new StateGraph(TeamState)
    .addNode("supervisor", makeSupervisorNode(supervisorFn))
    .addNode("analista", makeRoleNode(roleRuns.analista))
    .addNode("planejador", makeRoleNode(roleRuns.planejador))
    .addNode("executor", makeRoleNode(roleRuns.executor))
    .addNode("respond", respondNode)
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", (state: State) => state.next ?? "done", {
      analista: "analista",
      planejador: "planejador",
      executor: "executor",
      done: "respond",
    })
    .addEdge("analista", "supervisor")
    .addEdge("planejador", "supervisor")
    .addEdge("executor", "supervisor")
    .addEdge("respond", END)
    .compile();
}

/**
 * Fábrica testável do modo equipe (017): `supervisorFn` é injetável para
 * permitir testes determinísticos sem rede (ver `team-graph.test.ts`), no
 * mesmo espírito de `buildProductionStrategy` em `production-graph.ts`.
 */
export function buildTeamStrategy(
  supervisorFn: SupervisorFn = defaultSupervisorFn,
  roleRuns: Readonly<Record<TeamRole, RoleRun>> = defaultRoleRuns,
): ReasoningStrategy {
  const graph = compileGraph(supervisorFn, roleRuns);

  return {
    name: "team",

    async run(input: StrategyInput): Promise<StrategyRun> {
      try {
        const final = await graph.invoke(
          { input },
          { recursionLimit: MAX_HANDOFFS * 2 + 4 },
        );
        return finishRun(final.trace, final.answer, final.partial, zeroMetrics(input));
      } catch (error) {
        // `run` nunca rejeita (mesma obrigação de react.ts/production-graph.ts).
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

export const teamStrategy: ReasoningStrategy = buildTeamStrategy();
