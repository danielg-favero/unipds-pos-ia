import { useState } from "react";
import type { PendingApproval } from "../api/types";

export type ApprovalCardProps = {
  readonly approval: PendingApproval;
  readonly onDecide: (decision: "approve" | "deny") => Promise<void> | void;
};

const STATUS_LABEL: Record<PendingApproval["status"], string> = {
  pending: "Pendente de aprovação",
  approved: "Aprovado",
  denied: "Negado",
};

/** Cartão aprovar/negar (016, FR-008–FR-011) — nunca reenvia decisão de um cartão já decidido. */
export function ApprovalCard({ approval, onDecide }: ApprovalCardProps) {
  const [busy, setBusy] = useState(false);
  const decided = approval.status !== "pending";

  const handleDecide = async (decision: "approve" | "deny") => {
    if (decided || busy) return;
    setBusy(true);
    try {
      await onDecide(decision);
    } finally {
      setBusy(false);
    }
  };

  const statusColor =
    approval.status === "approved"
      ? "var(--color-success)"
      : approval.status === "denied"
        ? "var(--color-danger)"
        : "var(--color-text-muted)";

  return (
    <section
      role="group"
      aria-label="Ação pendente de aprovação"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        padding: "var(--space-4)",
        background: "var(--color-surface)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <strong>Ação sensível: {approval.tool === "open_incident" ? "Abrir incidente" : "Resolver incidente"}</strong>
        <span style={{ color: statusColor, fontWeight: 600 }}>{STATUS_LABEL[approval.status]}</span>
      </div>
      <p style={{ margin: 0 }}>{approval.description}</p>
      {decided ? (
        approval.result !== undefined && (
          <pre
            style={{
              margin: 0,
              background: "var(--color-surface-raised)",
              padding: "var(--space-2)",
              borderRadius: "var(--radius)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.85em",
              overflowX: "auto",
            }}
          >
            {JSON.stringify(approval.result, null, 2)}
          </pre>
        )
      ) : (
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            type="button"
            onClick={() => void handleDecide("approve")}
            disabled={busy}
            style={{
              padding: "var(--space-2) var(--space-4)",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--color-success-bg)",
              color: "var(--color-success)",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Aprovar
          </button>
          <button
            type="button"
            onClick={() => void handleDecide("deny")}
            disabled={busy}
            style={{
              padding: "var(--space-2) var(--space-4)",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--color-danger-bg)",
              color: "var(--color-danger)",
              fontWeight: 600,
              cursor: busy ? "not-allowed" : "pointer",
            }}
          >
            Negar
          </button>
        </div>
      )}
    </section>
  );
}
