import type { TraceEvent } from "../api/types";
import { TraceEventView } from "./trace-event";

export type TracePanelProps = {
  readonly trace: readonly TraceEvent[] | undefined;
  readonly onClose: () => void;
};

/** Painel do "ver raciocínio" (016, FR-005–FR-007). */
export function TracePanel({ trace, onClose }: TracePanelProps) {
  return (
    <aside
      role="dialog"
      aria-label="Raciocínio da resposta"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        background: "var(--color-surface)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>Raciocínio</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar raciocínio"
          style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1.1em" }}
        >
          ×
        </button>
      </div>
      {trace === undefined || trace.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
          Nenhum passo de raciocínio detalhado disponível para esta resposta.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {trace.map((event, i) => (
            <TraceEventView key={i} event={event} />
          ))}
        </div>
      )}
    </aside>
  );
}
