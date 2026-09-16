import { useState, type CSSProperties } from "react";
import { ApprovalCard } from "../approval/approval-card";
import { TracePanel } from "../trace/trace-panel";
import type { Message } from "./types";

export type MessageListProps = {
  readonly messages: readonly Message[];
  readonly onDecide: (message: Message, decision: "approve" | "deny") => void;
};

const bubbleStyle = (role: Message["role"]): CSSProperties => ({
  alignSelf: role === "operator" ? "flex-end" : "flex-start",
  maxWidth: "70%",
  padding: "var(--space-3)",
  borderRadius: "var(--radius)",
  background: role === "operator" ? "var(--color-primary)" : "var(--color-surface)",
  color: role === "operator" ? "var(--color-primary-text)" : "var(--color-text)",
});

export function MessageList({ messages, onDecide }: MessageListProps) {
  const [openTraceId, setOpenTraceId] = useState<string | undefined>(undefined);

  if (messages.length === 0) {
    return (
      <p style={{ color: "var(--color-text-muted)", padding: "var(--space-6)", textAlign: "center" }}>
        Nenhuma mensagem ainda. Descreva o que está acontecendo para começar.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)" }}>
      {messages.map((message) => (
        <div key={message.id} style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {message.pendingApproval !== undefined ? (
            <ApprovalCard
              approval={message.pendingApproval}
              onDecide={(decision) => onDecide(message, decision)}
            />
          ) : (
            <div style={bubbleStyle(message.role)}>
              {message.status === "sending" && (
                <span role="status" style={{ fontStyle: "italic", color: "var(--color-text-muted)" }}>
                  processando…
                </span>
              )}
              {message.status === "error" && (
                <span role="alert" style={{ color: "var(--color-danger)" }}>
                  {message.errorText ?? "Falha ao enviar. Tente novamente."}
                </span>
              )}
              {message.status === "done" && <span>{message.text}</span>}
            </div>
          )}

          {message.role === "agent" && message.status === "done" && message.pendingApproval === undefined && (
            <button
              type="button"
              onClick={() => setOpenTraceId(openTraceId === message.id ? undefined : message.id)}
              style={{
                alignSelf: "flex-start",
                background: "transparent",
                border: "none",
                color: "var(--color-primary)",
                cursor: "pointer",
                padding: 0,
                fontSize: "0.85em",
              }}
            >
              {openTraceId === message.id ? "ocultar raciocínio" : "ver raciocínio"}
            </button>
          )}

          {openTraceId === message.id && (
            <TracePanel trace={message.trace} onClose={() => setOpenTraceId(undefined)} />
          )}
        </div>
      ))}
    </div>
  );
}
