import { Annotation } from "@langchain/langgraph";

import type { RunMetrics, StrategyInput, TraceEvent } from "../domain/strategy.js";

/** Papéis especializados do modo equipe (017, FR-004). */
export const TEAM_ROLES = ["analista", "planejador", "executor"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** Teto de transições supervisor→papel por execução (017, FR-011). */
export const MAX_HANDOFFS = 8;

/** Uma contribuição de um papel ao quadro compartilhado (017, Key Entity "Quadro Compartilhado"). */
export type BlackboardEntry = {
  readonly role: TeamRole;
  readonly summary: string;
};

/** Saída estruturada do supervisor a cada passo (017, Key Entity "Decisão do Supervisor"). */
export type SupervisorDecision = {
  readonly next: TeamRole | "done";
  readonly brief: string;
};

export const TeamState = Annotation.Root({
  input: Annotation<StrategyInput>(),
  blackboard: Annotation<BlackboardEntry[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  trace: Annotation<TraceEvent[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  /** Incrementado a cada handoff real (next != "done"); o teto é MAX_HANDOFFS. */
  handoffCount: Annotation<number>({ reducer: (_previous, next) => next, default: () => 0 }),
  next: Annotation<TeamRole | "done" | undefined>({
    reducer: (_previous, next) => next,
    default: () => undefined,
  }),
  /** Instrução do supervisor para o próximo papel acionado (SupervisorDecision.brief). */
  pendingBrief: Annotation<string>({ reducer: (_previous, next) => next, default: () => "" }),
  answer: Annotation<string>({ reducer: (_previous, next) => next, default: () => "" }),
  /** `true` somente quando o encerramento foi forçado pelo teto de handoffs (FR-013). */
  partial: Annotation<boolean>({ reducer: (_previous, next) => next, default: () => false }),
  metrics: Annotation<RunMetrics | undefined>(),
});

export type State = typeof TeamState.State;

/** Representação textual do blackboard, usada pelo supervisor e pelo planejador. */
export function blackboardAsText(state: State): string {
  if (state.blackboard.length === 0) return "(quadro vazio — nenhuma contribuição ainda)";
  return state.blackboard.map((entry, index) => `${index + 1}. [${entry.role}] ${entry.summary}`).join("\n");
}
