import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TraceEvent } from "./strategy.js";
import { formatTrace } from "./trace.js";

describe("formatTrace — por tipo de evento", () => {
  it("formata thought", () => {
    assert.equal(formatTrace([{ type: "thought", text: "preciso listar" }]), "[thought] preciso listar");
  });

  it("formata plan com passos numerados a partir de 1", () => {
    assert.equal(
      formatTrace([{ type: "plan", steps: ["listar alertas", "abrir incidente"] }]),
      "[plan]\n  1. listar alertas\n  2. abrir incidente",
    );
  });

  it("formata action com ferramenta e argumentos", () => {
    assert.equal(
      formatTrace([{ type: "action", tool: "list_alerts", args: { status: "firing" } }]),
      '[action] list_alerts({"status":"firing"})',
    );
  });

  it("formata observation de sucesso", () => {
    assert.equal(
      formatTrace([{ type: "observation", ok: true, result: { count: 3 } }]),
      '[observation] ok {"count":3}',
    );
  });

  it("formata observation de erro com a mensagem do domínio", () => {
    assert.equal(
      formatTrace([{ type: "observation", ok: false, error: "Serviço não cadastrado: x" }]),
      "[observation] erro: Serviço não cadastrado: x",
    );
  });

  it("formata critique", () => {
    assert.equal(formatTrace([{ type: "critique", text: "falta resolver" }]), "[critique] falta resolver");
  });

  it("formata answer completa e answer parcial", () => {
    assert.equal(formatTrace([{ type: "answer", text: "pronto", partial: false }]), "[answer] pronto");
    assert.equal(
      formatTrace([{ type: "answer", text: "pronto", partial: true }]),
      "[answer] pronto (parcial)",
    );
  });

  it("formata handoff", () => {
    assert.equal(
      formatTrace([{ type: "handoff", from: "supervisor", to: "analista", brief: "iniciar investigação" }]),
      "[handoff] supervisor → analista: iniciar investigação",
    );
  });
});

describe("formatTrace — determinismo", () => {
  it("ordena as chaves de args alfabeticamente, qualquer que seja a ordem de inserção", () => {
    const a: TraceEvent = {
      type: "action",
      tool: "open_incident",
      args: { title: "t", severity: "high", service: "checkout-api" },
    };
    const b: TraceEvent = {
      type: "action",
      tool: "open_incident",
      args: { service: "checkout-api", title: "t", severity: "high" },
    };
    assert.equal(formatTrace([a]), formatTrace([b]));
    assert.equal(
      formatTrace([a]),
      '[action] open_incident({"service":"checkout-api","severity":"high","title":"t"})',
    );
  });

  it("ordena chaves aninhadas e preserva a ordem de arrays", () => {
    assert.equal(
      formatTrace([
        {
          type: "observation",
          ok: true,
          result: { alerts: [{ status: "firing", id: "alert-01" }] },
        },
      ]),
      '[observation] ok {"alerts":[{"id":"alert-01","status":"firing"}]}',
    );
  });

  it("produz saída idêntica em duas formatações da mesma entrada", () => {
    const trace: readonly TraceEvent[] = [
      { type: "plan", steps: ["a", "b"] },
      { type: "action", tool: "list_alerts", args: { status: "firing" }, callId: "call_1" },
      { type: "observation", callId: "call_1", ok: true, result: [] },
      { type: "critique", text: "resta abrir" },
      { type: "answer", text: "feito", partial: false },
    ];
    assert.equal(formatTrace(trace), formatTrace(trace));
  });

  it("não vaza callId nem timestamps na saída", () => {
    const rendered = formatTrace([
      { type: "action", tool: "list_alerts", args: {}, callId: "call_abc123" },
      { type: "observation", callId: "call_abc123", ok: true },
    ]);
    assert.ok(!rendered.includes("call_abc123"));
    assert.equal(rendered, "[action] list_alerts({})\n[observation] ok");
  });

  it("separa eventos por quebra de linha, na ordem do array", () => {
    assert.equal(
      formatTrace([
        { type: "thought", text: "um" },
        { type: "thought", text: "dois" },
      ]),
      "[thought] um\n[thought] dois",
    );
  });

  it("formata trace vazio como string vazia", () => {
    assert.equal(formatTrace([]), "");
  });
});
