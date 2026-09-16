import { useState } from "react";
import { postChat, postDecision } from "../api/ops-pilot-client";
import { OpsPilotApiError } from "../api/types";
import { MessageComposer } from "./message-composer";
import { MessageList } from "./message-list";
import type { Message } from "./types";

const OPERATOR_ID = "operador-1";

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

/** Orquestra o estado da conversa (016, US1/US3): envia mensagens, trata 202 e decisões de aprovação. */
export function ChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);

  const updateMessage = (id: string, patch: Partial<Message>) => {
    setMessages((current) => current.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const handleSend = async (text: string) => {
    const operatorMessage: Message = { id: newId(), role: "operator", text, status: "done" };
    const agentMessageId = newId();
    const agentPlaceholder: Message = { id: agentMessageId, role: "agent", text: "", status: "sending" };
    setMessages((current) => [...current, operatorMessage, agentPlaceholder]);
    setSending(true);

    try {
      const result = await postChat({ message: text, userId: OPERATOR_ID, conversation });
      setConversation(result.conversation);

      if (result.kind === "success") {
        updateMessage(agentMessageId, {
          text: result.answer,
          status: "done",
          trace: result.trace,
          requestId: result.requestId,
        });
      } else {
        updateMessage(agentMessageId, {
          status: "done",
          pendingApproval: result.pendingApproval,
          requestId: result.pendingApproval.id,
        });
      }
    } catch (error) {
      const errorText = error instanceof OpsPilotApiError ? error.message : "Falha de rede. Tente novamente.";
      updateMessage(agentMessageId, { status: "error", errorText });
    } finally {
      setSending(false);
    }
  };

  const handleDecide = async (message: Message, decision: "approve" | "deny") => {
    if (message.requestId === undefined) return;
    try {
      const result = await postDecision(message.requestId, decision);
      const approval = message.pendingApproval;
      updateMessage(message.id, {
        pendingApproval:
          approval === undefined
            ? undefined
            : {
                ...approval,
                status: decision === "approve" ? "approved" : "denied",
                decidedAt: new Date().toISOString(),
              },
        trace: result.trace,
      });
    } catch {
      // Falha de rede/decisão duplicada (409): a UI mantém o cartão como está —
      // o operador pode tentar de novo; nenhuma decisão local é assumida (SC-005).
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <MessageList messages={messages} onDecide={(message, decision) => void handleDecide(message, decision)} />
      </div>
      <MessageComposer onSend={(text) => void handleSend(text)} disabled={sending} />
    </div>
  );
}
