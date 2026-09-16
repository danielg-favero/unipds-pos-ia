import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MessageComposer } from "../../src/chat/message-composer";

describe("MessageComposer", () => {
  it("dispara onSend com o texto digitado e limpa o campo", async () => {
    const onSend = vi.fn();
    render(<MessageComposer onSend={onSend} />);
    const input = screen.getByLabelText("Mensagem para o agente");

    await userEvent.type(input, "liste os alertas ativos");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSend).toHaveBeenCalledWith("liste os alertas ativos");
    expect(input).toHaveValue("");
  });

  it("não envia mensagem vazia", async () => {
    const onSend = vi.fn();
    render(<MessageComposer onSend={onSend} />);
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("desabilitado não envia", async () => {
    const onSend = vi.fn();
    render(<MessageComposer onSend={onSend} disabled />);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });
});
