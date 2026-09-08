import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_STEPS,
  createPlanAndExecuteStrategy,
  graphRecursionLimit,
  nextPlan,
  planAndExecuteStrategy,
  planExhausted,
  replanSchema,
  stepBudget,
  stepBudgetExhausted,
} from "./plan-and-execute.js";
import { recursionLimitFor } from "./react.js";

describe("guardrail do ReAct", () => {
  it("dá dois supersteps por iteração, mais o passo final", () => {
    assert.equal(recursionLimitFor(1), 3);
    assert.equal(recursionLimitFor(6), 13);
    assert.equal(recursionLimitFor(8), 17);
  });

  it("cresce monotonicamente com o limite de iterações", () => {
    for (let i = 1; i < 20; i += 1) {
      assert.ok(recursionLimitFor(i + 1) > recursionLimitFor(i));
    }
  });
});

describe("teto de passos do Plan-and-Execute", () => {
  it("fixa o teto em 8", () => {
    assert.equal(MAX_STEPS, 8);
  });

  it("limita o orçamento ao teto, mesmo com maxIterations maior", () => {
    assert.equal(stepBudget(20), MAX_STEPS);
    assert.equal(stepBudget(MAX_STEPS), MAX_STEPS);
  });

  it("acompanha maxIterations quando ele é menor que o teto", () => {
    assert.equal(stepBudget(3), 3);
    assert.equal(stepBudget(1), 1);
  });

  it("não esgota o orçamento antes do oitavo passo", () => {
    for (let taken = 0; taken < MAX_STEPS; taken += 1) {
      assert.equal(stepBudgetExhausted(taken, MAX_STEPS), false, `passo ${taken}`);
    }
  });

  it("esgota o orçamento no oitavo passo e além", () => {
    assert.equal(stepBudgetExhausted(MAX_STEPS, MAX_STEPS), true);
    assert.equal(stepBudgetExhausted(MAX_STEPS + 5, MAX_STEPS), true);
  });

  it("esgota antes quando maxIterations é menor que o teto", () => {
    assert.equal(stepBudgetExhausted(3, stepBudget(3)), true);
    assert.equal(stepBudgetExhausted(2, stepBudget(3)), false);
  });

  it("encerra quando o replanejamento não deixa passos", () => {
    assert.equal(planExhausted(0), true);
    assert.equal(planExhausted(1), false);
  });
});

describe("decisão do replanejador", () => {
  it("'seguir' mantém os passos restantes intactos", () => {
    assert.deepEqual(nextPlan("seguir", [], ["b", "c"]), ["b", "c"]);
  });

  it("'seguir' ignora passos propostos por engano", () => {
    assert.deepEqual(nextPlan("seguir", ["z"], ["b", "c"]), ["b", "c"]);
  });

  it("'ajustar' substitui os passos restantes", () => {
    assert.deepEqual(nextPlan("ajustar", ["x", "y"], ["b", "c"]), ["x", "y"]);
  });

  it("'ajustar' sem lista nova mantém o plano atual, em vez de encerrar por engano", () => {
    assert.deepEqual(nextPlan("ajustar", [], ["b", "c"]), ["b", "c"]);
  });

  it("'encerrar' zera o plano, mesmo com passos pendentes", () => {
    assert.deepEqual(nextPlan("encerrar", ["x"], ["b", "c"]), []);
  });

  it("não repropõe um passo que já foi executado (barreira anti-loop)", () => {
    assert.deepEqual(nextPlan("seguir", [], ["a", "b"], [["a", "feito"]]), ["b"]);
    assert.deepEqual(nextPlan("ajustar", ["a"], ["z"], [["a", "falhou"]]), []);
  });

  it("um passo que falhou não volta ao plano", () => {
    const done: [string, string][] = [["resolver inc-1", "falhou: já resolvido"]];
    assert.deepEqual(nextPlan("ajustar", ["resolver inc-1"], [], done), []);
  });

  it("aceita a decisão com steps e answer omitidos", () => {
    const parsed = replanSchema.parse({ decision: "seguir", reasoning: "tudo certo" });
    assert.deepEqual(parsed.steps, []);
    assert.equal(parsed.answer, "");
  });

  it("recusa decisão fora de seguir|ajustar|encerrar", () => {
    assert.equal(
      replanSchema.safeParse({ decision: "abortar", reasoning: "x" }).success,
      false,
    );
  });

  it("recusa mais de 8 passos no replanejamento", () => {
    assert.equal(
      replanSchema.safeParse({
        decision: "ajustar",
        reasoning: "x",
        steps: Array.from({ length: MAX_STEPS + 1 }, (_unused, i) => `passo ${i}`),
      }).success,
      false,
    );
  });
});

describe("recursionLimit do grafo Plan-and-Execute", () => {
  it("respeita o teto de 8 passos mesmo com maxIterations alto", () => {
    assert.equal(graphRecursionLimit(20), MAX_STEPS * 2 + 4);
    assert.equal(graphRecursionLimit(8), graphRecursionLimit(20));
  });

  it("acompanha maxIterations quando ele é menor que o teto", () => {
    assert.equal(graphRecursionLimit(3), 10);
    assert.equal(graphRecursionLimit(1), 6);
  });

  it("nunca permite mais supersteps do que 8 passos exigem", () => {
    for (let i = 1; i <= 20; i += 1) {
      assert.ok(graphRecursionLimit(i) <= MAX_STEPS * 2 + 4, `maxIterations ${i}`);
    }
  });

  it("deixa folga para a barreira própria disparar antes do LangGraph", () => {
    // 1 planner + budget*(executor+replanner) supersteps; a folga evita que o
    // GraphRecursionError substitua a resposta parcial com trace.
    for (let i = 1; i <= 20; i += 1) {
      const consumed = 1 + stepBudget(i) * 2;
      assert.ok(graphRecursionLimit(i) > consumed, `maxIterations ${i}`);
    }
  });
});

describe("createPlanAndExecuteStrategy — ablation --no-replanner", () => {
  it("planAndExecuteStrategy é o padrão sem skipReplanner", () => {
    assert.equal(planAndExecuteStrategy.name, "plan-and-execute");
  });

  it("aceita nome customizado", () => {
    assert.equal(
      createPlanAndExecuteStrategy({ name: "plan-and-execute:no-replanner", skipReplanner: true })
        .name,
      "plan-and-execute:no-replanner",
    );
  });

  it("skipReplanner não altera o nome quando omitido", () => {
    assert.equal(createPlanAndExecuteStrategy({ skipReplanner: true }).name, "plan-and-execute");
  });
});
