import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StrategyRun } from "../domain/strategy.js";
import type { Incident } from "../domain/types.js";
import { SCENARIOS, concluded } from "./scenarios.js";

const byId = (id: "c1" | "c2" | "c3") => SCENARIOS.find((scenario) => scenario.id === id)!;

const incident = (over: Partial<Incident>): Incident => ({
  id: "inc-x",
  title: "x",
  serviceId: "checkout-api",
  severity: "high",
  status: "open",
  resolvedAt: null,
  summary: null,
  ...over,
});

/** `StrategyRun` fabricado — concluído por padrão, sem tocar rede. */
const run = (answer: string, opts: { partial?: boolean } = {}): StrategyRun => ({
  answer,
  trace: [{ type: "answer", text: answer, partial: opts.partial ?? false }],
  metrics: { llmCalls: 1, latencyMs: 1, historyMessages: 0 },
});

const partialRun = run("interrompido: 429", { partial: true });
const okRun = run("ok");

describe("SCENARIOS — catálogo", () => {
  it("expõe exatamente c1, c2 e c3, cada um com pedido não vazio", () => {
    assert.deepEqual(
      SCENARIOS.map((scenario) => scenario.id),
      ["c1", "c2", "c3"],
    );
    for (const scenario of SCENARIOS) assert.ok(scenario.request.length > 0);
  });
});

describe("concluded", () => {
  it("verdadeiro quando o último evento é answer não-parcial", () => {
    assert.equal(concluded(okRun), true);
  });

  it("falso quando o último evento é answer parcial (estouro, erro do provedor)", () => {
    assert.equal(concluded(partialRun), false);
  });

  it("falso quando não há trace algum", () => {
    assert.equal(concluded({ answer: "", trace: [], metrics: { llmCalls: 0, latencyMs: 0, historyMessages: 0 } }), false);
  });
});

describe("c1 — direto (somente leitura)", () => {
  const { check } = byId("c1");

  it("acerta quando a execução concluiu e nenhum incidente foi criado", () => {
    assert.equal(check([], okRun), true);
  });

  it("erra se qualquer incidente foi criado, mesmo com execução concluída", () => {
    assert.equal(check([incident({})], okRun), false);
  });

  it("erra se a execução falhou cedo (429, etc.), mesmo sem incidentes — não é acerto por acidente", () => {
    assert.equal(check([], partialRun), false);
  });
});

describe("c2 — estruturado (3 incidentes em ordem, o primeiro resolvido)", () => {
  const { check } = byId("c2");

  const correct: Incident[] = [
    incident({ id: "inc-1", serviceId: "checkout-api", severity: "high", status: "resolved" }),
    incident({ id: "inc-2", serviceId: "payments-worker", severity: "high", status: "open" }),
    incident({ id: "inc-3", serviceId: "catalog-service", severity: "high", status: "open" }),
  ];

  it("acerta com os 3 incidentes na ordem certa, só o primeiro resolvido, execução concluída", () => {
    assert.equal(check(correct, okRun), true);
  });

  it("erra se a execução não concluiu, mesmo com o estado certo", () => {
    assert.equal(check(correct, partialRun), false);
  });

  it("erra com menos ou mais de 3 incidentes", () => {
    assert.equal(check(correct.slice(0, 2), okRun), false);
    assert.equal(check([...correct, incident({ id: "inc-4" })], okRun), false);
  });

  it("erra se a ordem dos serviços não bate com o pedido", () => {
    const swapped = [correct[1]!, correct[0]!, correct[2]!];
    assert.equal(check(swapped, okRun), false);
  });

  it("erra se o incidente errado foi resolvido", () => {
    const wrongResolved = [
      { ...correct[0]!, status: "open" as const },
      { ...correct[1]!, status: "resolved" as const },
      correct[2]!,
    ];
    assert.equal(check(wrongResolved, okRun), false);
  });

  it("erra se a severidade não é sev2/high", () => {
    const wrongSeverity = [{ ...correct[0]!, severity: "critical" as const }, correct[1]!, correct[2]!];
    assert.equal(check(wrongSeverity, okRun), false);
  });
});

describe("c3 — dinâmico (incidente para o alerta mais antigo em disparo)", () => {
  const { check } = byId("c3");

  it("acerta com um único incidente para checkout-api, severidade critical, aberto, execução concluída", () => {
    assert.equal(
      check([incident({ serviceId: "checkout-api", severity: "critical", status: "open" })], okRun),
      true,
    );
  });

  it("erra se a execução não concluiu, mesmo com o incidente certo", () => {
    assert.equal(
      check([incident({ serviceId: "checkout-api", severity: "critical", status: "open" })], partialRun),
      false,
    );
  });

  it("erra se abriu para o serviço errado (não é o alerta mais antigo)", () => {
    assert.equal(
      check([incident({ serviceId: "payments-worker", severity: "high", status: "open" })], okRun),
      false,
    );
  });

  it("erra se a severidade não é a do próprio alerta", () => {
    assert.equal(
      check([incident({ serviceId: "checkout-api", severity: "high", status: "open" })], okRun),
      false,
    );
  });

  it("erra se mais de um incidente foi criado", () => {
    assert.equal(
      check(
        [
          incident({ serviceId: "checkout-api", severity: "critical", status: "open" }),
          incident({ serviceId: "payments-worker", severity: "high", status: "open" }),
        ],
        okRun,
      ),
      false,
    );
  });

  it("erra se nenhum incidente foi criado", () => {
    assert.equal(check([], okRun), false);
  });
});
