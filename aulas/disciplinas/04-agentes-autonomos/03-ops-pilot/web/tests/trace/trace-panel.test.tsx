import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TracePanel } from "../../src/trace/trace-panel";

describe("TracePanel", () => {
  it("mostra mensagem clara quando o trace está vazio", () => {
    render(<TracePanel trace={[]} onClose={vi.fn()} />);
    expect(screen.getByText(/nenhum passo de raciocínio/i)).toBeInTheDocument();
  });

  it("renderiza os eventos do trace quando presentes", () => {
    render(
      <TracePanel
        trace={[{ type: "answer", text: "ok", partial: false }]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("chama onClose ao clicar em fechar", async () => {
    const onClose = vi.fn();
    render(<TracePanel trace={[]} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /fechar raciocínio/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
