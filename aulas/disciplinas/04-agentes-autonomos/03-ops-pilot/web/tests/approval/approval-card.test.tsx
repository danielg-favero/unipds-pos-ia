import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "../../src/approval/approval-card";
import type { PendingApproval } from "../../src/api/types";

const baseApproval: PendingApproval = {
  id: "r1",
  tool: "resolve_incident",
  args: { id: "inc-1" },
  description: "Resolver incidente inc-1",
  status: "pending",
};

describe("ApprovalCard", () => {
  it("estado pending mostra botões aprovar/negar habilitados", () => {
    render(<ApprovalCard approval={baseApproval} onDecide={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Negar" })).toBeEnabled();
  });

  it("clicar em Aprovar chama onDecide('approve')", async () => {
    const onDecide = vi.fn();
    render(<ApprovalCard approval={baseApproval} onDecide={onDecide} />);
    await userEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(onDecide).toHaveBeenCalledWith("approve");
  });

  it("estado approved não mostra botões de decisão", () => {
    render(<ApprovalCard approval={{ ...baseApproval, status: "approved" }} onDecide={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
    expect(screen.getByText("Aprovado")).toBeInTheDocument();
  });

  it("estado denied não mostra botões de decisão", () => {
    render(<ApprovalCard approval={{ ...baseApproval, status: "denied" }} onDecide={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Negar" })).not.toBeInTheDocument();
    expect(screen.getByText("Negado")).toBeInTheDocument();
  });
});
