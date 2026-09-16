import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatView } from "../../src/chat/chat-view";
import { setApiUrl } from "../../src/config/api-settings";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("ChatView", () => {
  beforeEach(() => {
    setApiUrl("http://localhost:3000");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mostra a mensagem do operador e depois a resposta do agente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          answer: "os alertas estão ok",
          trace: [{ type: "answer", text: "os alertas estão ok", partial: false }],
          metrics: { llmCalls: 1, latencyMs: 1, historyMessages: 0 },
          conversation: "c1",
          requestId: "r1",
        }),
      ),
    );

    render(<ChatView />);
    await userEvent.type(screen.getByLabelText("Mensagem para o agente"), "como estão os alertas?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(screen.getByText("como estão os alertas?")).toBeInTheDocument();
    expect(await screen.findByText("os alertas estão ok")).toBeInTheDocument();
  });

  it("erro de rede mostra mensagem de erro sem travar a conversa", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));

    render(<ChatView />);
    await userEvent.type(screen.getByLabelText("Mensagem para o agente"), "oi");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("202 renderiza um cartão de aprovação em vez de texto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(202, {
          conversation: "c1",
          pendingApproval: {
            id: "r1",
            tool: "resolve_incident",
            args: { id: "inc-1" },
            description: "Resolver incidente inc-1",
            status: "pending",
          },
        }),
      ),
    );

    render(<ChatView />);
    await userEvent.type(screen.getByLabelText("Mensagem para o agente"), "resolva o inc-1");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("group", { name: "Ação pendente de aprovação" })).toBeInTheDocument();
  });
});
