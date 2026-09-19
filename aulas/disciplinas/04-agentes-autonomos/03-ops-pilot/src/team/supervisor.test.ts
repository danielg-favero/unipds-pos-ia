import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StrategyInput } from "../domain/strategy.js";
import { decideNext, fallbackDecision } from "./supervisor.js";
import type { BlackboardEntry, State } from "./state.js";

const baseInput: StrategyInput = {
  request: "investigue o pico de erros do checkout",
  maxIterations: 8,
  store: {} as StrategyInput["store"],
};

const stateWith = (blackboard: readonly BlackboardEntry[]): State => ({
  input: baseInput,
  blackboard: [...blackboard],
  trace: [],
  handoffCount: 0,
  next: undefined,
  pendingBrief: "",
  answer: "",
  partial: false,
  metrics: undefined,
});

describe("decideNext (US1)", () => {
  it("devolve a decisão do supervisorFn quando ela é válida", async () => {
    const state = stateWith([]);
    const decision = await decideNext(state, async () => ({ next: "analista", brief: "comece pela leitura" }));
    assert.deepEqual(decision, { next: "analista", brief: "comece pela leitura" });
  });

  it("aplica o fallback determinístico quando o supervisorFn lança", async () => {
    const state = stateWith([]);
    const decision = await decideNext(state, async () => {
      throw new Error("saída malformada");
    });
    assert.equal(decision.next, "analista");
  });
});

describe("fallbackDecision (research.md Decisão 4)", () => {
  it('escolhe "analista" quando o blackboard está vazio', () => {
    const decision = fallbackDecision(stateWith([]));
    assert.equal(decision.next, "analista");
  });

  it('escolhe "done" quando o blackboard já tem conteúdo', () => {
    const decision = fallbackDecision(stateWith([{ role: "analista", summary: "achados" }]));
    assert.equal(decision.next, "done");
  });
});
