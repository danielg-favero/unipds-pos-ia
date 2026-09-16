import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TraceEventView } from "../../src/trace/trace-event";
import type { TraceEvent } from "../../src/api/types";

describe("TraceEventView", () => {
  const cases: Array<[string, TraceEvent, string]> = [
    ["thought", { type: "thought", text: "pensando" }, "Pensamento"],
    ["plan", { type: "plan", steps: ["passo 1"] }, "Plano"],
    ["action", { type: "action", tool: "list_alerts", args: {} }, "Ação"],
    ["observation", { type: "observation", ok: true, result: { x: 1 } }, "Observação"],
    ["critique", { type: "critique", text: "revisado" }, "Crítica"],
    ["answer", { type: "answer", text: "final", partial: false }, "Resposta"],
    ["route", { type: "route", route: "react", reason: "padrão", manual: false }, "Rota"],
    [
      "fallback",
      { type: "fallback", primaryModel: "a", fallbackModel: "b", reason: "esgotou" },
      "Contingência de modelo",
    ],
  ];

  it.each(cases)("renderiza o tipo %s com rótulo esperado", (_type, event, expectedLabel) => {
    render(<TraceEventView event={event} />);
    expect(screen.getByText(new RegExp(expectedLabel, "i"))).toBeInTheDocument();
  });
});
