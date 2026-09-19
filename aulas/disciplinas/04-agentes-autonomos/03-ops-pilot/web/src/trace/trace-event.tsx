import type { CSSProperties, ReactNode } from "react";
import type { TraceEvent } from "../api/types";

const row: CSSProperties = {
  padding: "var(--space-2) var(--space-3)",
  borderRadius: "var(--radius)",
  border: "1px solid var(--color-border)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
};

const label = (text: string, color: string): ReactNode => (
  <span style={{ fontSize: "0.75em", fontWeight: 700, textTransform: "uppercase", color }}>{text}</span>
);

/**
 * Um render por `TraceEvent["type"]` (016, research.md §6). O `never` no
 * `default` faz o build quebrar se o union de `TraceEvent` ganhar um tipo novo
 * sem visualização correspondente aqui.
 */
export function TraceEventView({ event }: { readonly event: TraceEvent }) {
  switch (event.type) {
    case "thought":
      return (
        <div style={row}>
          {label("Pensamento", "var(--color-text-muted)")}
          <span>{event.text}</span>
        </div>
      );
    case "plan":
      return (
        <div style={row}>
          {label("Plano", "var(--color-primary)")}
          <ol style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
            {event.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      );
    case "action":
      return (
        <div style={row}>
          {label("Ação", "var(--color-primary)")}
          <span>
            <strong>{event.tool}</strong>
          </span>
          <pre style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "0.85em", overflowX: "auto" }}>
            {JSON.stringify(event.args, null, 2)}
          </pre>
        </div>
      );
    case "observation":
      return (
        <div style={row}>
          {label("Observação", event.ok ? "var(--color-success)" : "var(--color-danger)")}
          {event.error !== undefined && <span>{event.error}</span>}
          {event.result !== undefined && (
            <pre style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "0.85em", overflowX: "auto" }}>
              {JSON.stringify(event.result, null, 2)}
            </pre>
          )}
        </div>
      );
    case "critique":
      return (
        <div style={row}>
          {label("Crítica", "var(--color-text-muted)")}
          <span>{event.text}</span>
        </div>
      );
    case "answer":
      return (
        <div style={row}>
          {label(event.partial ? "Resposta (parcial)" : "Resposta", "var(--color-success)")}
          <span>{event.text}</span>
        </div>
      );
    case "route":
      return (
        <div style={row}>
          {label(`Rota${event.manual ? " (manual)" : ""}`, "var(--color-text-muted)")}
          <span>
            {event.route} — {event.reason}
          </span>
        </div>
      );
    case "fallback":
      return (
        <div style={row}>
          {label("Contingência de modelo", "var(--color-danger)")}
          <span>
            {event.primaryModel} → {event.fallbackModel} ({event.reason})
          </span>
        </div>
      );
    case "handoff":
      return (
        <div style={row}>
          {label("Handoff", "var(--color-primary)")}
          <span>
            {event.from} → {event.to}: {event.brief}
          </span>
        </div>
      );
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
