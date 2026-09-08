import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

import { countAiMessages, lastText, toTrace } from "./from-messages.js";

const ok = (data: unknown) => JSON.stringify({ ok: true, data });
const fail = (error: string) => JSON.stringify({ ok: false, error });

describe("toTrace — mapeamento de mensagens", () => {
  it("ignora a mensagem do usuário", () => {
    const { events } = toTrace([
      new HumanMessage("liste os alertas"),
      new AIMessage("3 alertas em disparo"),
    ]);
    assert.deepEqual(events, []);
  });

  it("mapeia um tool call para action e o ToolMessage para observation", () => {
    const { events } = toTrace([
      new HumanMessage("liste os alertas"),
      new AIMessage({
        content: "",
        tool_calls: [{ name: "list_alerts", args: { status: "firing" }, id: "call_1" }],
      }),
      new ToolMessage({ content: ok({ alerts: [] }), tool_call_id: "call_1" }),
      new AIMessage("nenhum alerta"),
    ]);
    assert.deepEqual(events, [
      { type: "action", tool: "list_alerts", args: { status: "firing" }, callId: "call_1" },
      { type: "observation", callId: "call_1", ok: true, result: { alerts: [] } },
    ]);
  });

  it("correlaciona callId com tool_call_id", () => {
    const { events } = toTrace([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "list_alerts", args: {}, id: "call_abc" }],
      }),
      new ToolMessage({ content: ok(null), tool_call_id: "call_abc" }),
      new AIMessage("pronto"),
    ]);
    const action = events[0] as { callId?: string };
    const observation = events[1] as { callId?: string };
    assert.equal(action.callId, observation.callId);
    assert.equal(action.callId, "call_abc");
  });

  it("mapeia múltiplos tool calls da mesma mensagem, na ordem", () => {
    const { events } = toTrace([
      new AIMessage({
        content: "",
        tool_calls: [
          { name: "list_alerts", args: { status: "firing" }, id: "c1" },
          { name: "list_alerts", args: { status: "resolved" }, id: "c2" },
        ],
      }),
      new ToolMessage({ content: ok(1), tool_call_id: "c1" }),
      new ToolMessage({ content: ok(2), tool_call_id: "c2" }),
      new AIMessage("feito"),
    ]);
    assert.deepEqual(
      events.map((event) => event.type),
      ["action", "action", "observation", "observation"],
    );
  });

  it("marca observação de erro de domínio como ok: false com a mensagem", () => {
    const { events } = toTrace([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "open_incident", args: { service: "x" }, id: "c1" }],
      }),
      new ToolMessage({
        content: fail("Serviço não cadastrado: x"),
        tool_call_id: "c1",
      }),
      new AIMessage("não deu"),
    ]);
    assert.deepEqual(events[1], {
      type: "observation",
      callId: "c1",
      ok: false,
      error: "Serviço não cadastrado: x",
    });
  });

  it("trata conteúdo de tool que não é JSON como observação bem-sucedida", () => {
    const { events } = toTrace([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "list_alerts", args: {}, id: "c1" }],
      }),
      new ToolMessage({ content: "texto cru", tool_call_id: "c1" }),
      new AIMessage("fim"),
    ]);
    assert.deepEqual(events[1], {
      type: "observation",
      callId: "c1",
      ok: true,
      result: "texto cru",
    });
  });

  it("emite thought para mensagem intermediária sem tool calls", () => {
    const { events } = toTrace([
      new AIMessage("vou precisar listar antes"),
      new AIMessage({
        content: "",
        tool_calls: [{ name: "list_alerts", args: {}, id: "c1" }],
      }),
      new ToolMessage({ content: ok([]), tool_call_id: "c1" }),
      new AIMessage("resposta final"),
    ]);
    assert.deepEqual(events[0], { type: "thought", text: "vou precisar listar antes" });
  });

  it("não coloca a resposta final em events", () => {
    const { events, answer } = toTrace([
      new AIMessage({
        content: "",
        tool_calls: [{ name: "list_alerts", args: {}, id: "c1" }],
      }),
      new ToolMessage({ content: ok([]), tool_call_id: "c1" }),
      new AIMessage("3 alertas em disparo"),
    ]);
    assert.ok(!events.some((event) => event.type === "answer"));
    assert.equal(answer, "3 alertas em disparo");
  });
});

describe("helpers de mensagens", () => {
  it("lastText devolve o texto da última mensagem do modelo", () => {
    assert.equal(
      lastText([new AIMessage("primeira"), new HumanMessage("x"), new AIMessage("  última  ")]),
      "última",
    );
  });

  it("lastText devolve string vazia quando não há mensagem do modelo", () => {
    assert.equal(lastText([new HumanMessage("só eu")]), "");
  });

  it("countAiMessages conta apenas mensagens do modelo", () => {
    assert.equal(
      countAiMessages([
        new HumanMessage("pergunta"),
        new AIMessage("uma"),
        new AIMessage("duas"),
      ]),
      2,
    );
  });
});
