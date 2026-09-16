import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageList } from "../../src/chat/message-list";
import type { Message } from "../../src/chat/types";

describe("MessageList", () => {
  it("mostra estado vazio sem mensagens", () => {
    render(<MessageList messages={[]} onDecide={vi.fn()} />);
    expect(screen.getByText(/nenhuma mensagem ainda/i)).toBeInTheDocument();
  });

  it("mostra indicador de processando para mensagem sending", () => {
    const messages: Message[] = [{ id: "1", role: "agent", text: "", status: "sending" }];
    render(<MessageList messages={messages} onDecide={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("processando…");
  });

  it("mostra erro para mensagem com status error", () => {
    const messages: Message[] = [
      { id: "1", role: "agent", text: "", status: "error", errorText: "falhou" },
    ];
    render(<MessageList messages={messages} onDecide={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("falhou");
  });

  it("mostra o botão ver raciocínio para resposta concluída do agente", () => {
    const messages: Message[] = [
      {
        id: "1",
        role: "agent",
        text: "resposta",
        status: "done",
        trace: [{ type: "answer", text: "resposta", partial: false }],
      },
    ];
    render(<MessageList messages={messages} onDecide={vi.fn()} />);
    expect(screen.getByRole("button", { name: /ver raciocínio/i })).toBeInTheDocument();
  });
});
