import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StrategyInput, TraceEvent } from "../domain/strategy.js";
import { buildTeamStrategy, type RoleRun } from "./team-graph.js";
import type { SupervisorDecision } from "./state.js";
import type { SupervisorFn } from "./supervisor.js";
import { MAX_HANDOFFS } from "./state.js";

const baseInput: StrategyInput = {
  request: "investigue o pico de erros do checkout e proponha uma ação",
  maxIterations: 8,
  store: {} as StrategyInput["store"],
};

/** Papel fake determinístico: sem rede, devolve um resumo fixo e conta chamadas. */
function fakeRole(role: "analista" | "planejador" | "executor", summary: string) {
  const counter = { calls: 0 };
  const fn: RoleRun = async () => {
    counter.calls += 1;
    return { entry: { role, summary }, events: [{ type: "thought", text: summary } as TraceEvent] };
  };
  return { fn, counter };
}

function fakeRoles() {
  const analista = fakeRole("analista", "achados do analista");
  const planejador = fakeRole("planejador", "plano do planejador");
  const executor = fakeRole("executor", "ação do executor");
  return {
    roleRuns: { analista: analista.fn, planejador: planejador.fn, executor: executor.fn },
    calls: { analista: analista.counter, planejador: planejador.counter, executor: executor.counter },
  };
}

const supervisorFnSequence = (decisions: readonly SupervisorDecision[]): SupervisorFn => {
  let index = 0;
  return async () => {
    const decision = decisions[index] ?? decisions.at(-1)!;
    index += 1;
    return decision;
  };
};

const supervisorFnAlways = (decision: SupervisorDecision): SupervisorFn => async () => decision;

describe("team-graph — orquestração entre papéis (US1)", () => {
  it("alterna entre papéis com base na sequência de decisões do supervisor e devolve uma resposta final única", async () => {
    const { roleRuns, calls } = fakeRoles();
    const supervisorFn = supervisorFnSequence([
      { next: "analista", brief: "investigue os alertas" },
      { next: "planejador", brief: "organize um plano" },
      { next: "done", brief: "pronto" },
    ]);
    const strategy = buildTeamStrategy(supervisorFn, roleRuns);

    const run = await strategy.run(baseInput);

    assert.equal(calls.analista.calls, 1);
    assert.equal(calls.planejador.calls, 1);
    assert.equal(calls.executor.calls, 0);
    assert.equal(run.answer, "plano do planejador");
    assert.equal(run.trace.at(-1)?.type, "answer");
  });
});

describe("team-graph — evento handoff (US3)", () => {
  it("emite um handoff distinto por transição, na ordem correta", async () => {
    const { roleRuns } = fakeRoles();
    const supervisorFn = supervisorFnSequence([
      { next: "analista", brief: "investigue" },
      { next: "executor", brief: "aja" },
      { next: "done", brief: "pronto" },
    ]);
    const strategy = buildTeamStrategy(supervisorFn, roleRuns);

    const run = await strategy.run(baseInput);
    const handoffs = run.trace.filter((event): event is Extract<TraceEvent, { type: "handoff" }> => event.type === "handoff");

    assert.deepEqual(
      handoffs.map((h) => [h.from, h.to]),
      [
        ["supervisor", "analista"],
        ["supervisor", "executor"],
        ["supervisor", "done"],
      ],
    );
    assert.ok(handoffs.every((h) => h.brief.length > 0));
  });

  it("uma solicitação resolvida por um único papel não gera handoffs indevidos", async () => {
    const { roleRuns } = fakeRoles();
    const supervisorFn = supervisorFnSequence([
      { next: "analista", brief: "investigue" },
      { next: "done", brief: "pronto" },
    ]);
    const strategy = buildTeamStrategy(supervisorFn, roleRuns);

    const run = await strategy.run(baseInput);
    const handoffs = run.trace.filter((event) => event.type === "handoff");

    assert.equal(handoffs.length, 2);
  });
});

describe("team-graph — teto de 8 transições (US4)", () => {
  it("nunca excede 8 handoffs para papéis; encerra com handoff final forçado para done e resposta parcial", async () => {
    const { roleRuns } = fakeRoles();
    const supervisorFn = supervisorFnAlways({ next: "analista", brief: "investigue de novo" });
    const strategy = buildTeamStrategy(supervisorFn, roleRuns);

    const run = await strategy.run(baseInput);
    const handoffs = run.trace.filter((event): event is Extract<TraceEvent, { type: "handoff" }> => event.type === "handoff");
    const toRole = handoffs.filter((h) => h.to !== "done");
    const toDone = handoffs.filter((h) => h.to === "done");

    assert.equal(toRole.length, MAX_HANDOFFS);
    assert.equal(toDone.length, 1);
    assert.ok(toDone[0]!.brief.includes("teto"));

    const answerEvent = run.trace.at(-1);
    assert.equal(answerEvent?.type, "answer");
    assert.ok(answerEvent?.type === "answer" && answerEvent.partial === true);
  });

  it("uma investigação resolvida antes do teto termina normalmente, sem truncamento", async () => {
    const { roleRuns } = fakeRoles();
    const supervisorFn = supervisorFnSequence([
      { next: "analista", brief: "investigue" },
      { next: "done", brief: "pronto" },
    ]);
    const strategy = buildTeamStrategy(supervisorFn, roleRuns);

    const run = await strategy.run(baseInput);
    const answerEvent = run.trace.at(-1);

    assert.equal(answerEvent?.type, "answer");
    assert.ok(answerEvent?.type === "answer" && answerEvent.partial === false);
  });
});
