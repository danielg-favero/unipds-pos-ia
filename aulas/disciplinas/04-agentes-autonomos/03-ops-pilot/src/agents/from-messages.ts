import type { BaseMessage } from "@langchain/core/messages";

import type { TraceEvent } from "../domain/strategy.js";

type ToolCallLike = {
  readonly name?: string;
  readonly args?: Record<string, unknown>;
  readonly id?: string;
};

const toolCallsOf = (message: BaseMessage): readonly ToolCallLike[] => {
  const calls = (message as { tool_calls?: readonly ToolCallLike[] }).tool_calls;
  return Array.isArray(calls) ? calls : [];
};

const toolCallIdOf = (message: BaseMessage): string | undefined =>
  (message as { tool_call_id?: string }).tool_call_id;

/**
 * As ferramentas devolvem `{"ok":false,"error":...}` em falha de domínio.
 * Quando o conteúdo não é esse JSON, tratamos como observação bem-sucedida com
 * o texto cru — é o caso de erros de contrato do próprio runtime de tools.
 */
const readObservation = (
  text: string,
): { ok: boolean; result?: unknown; error?: string } => {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object" && "ok" in parsed) {
      const payload = parsed as { ok: unknown; data?: unknown; error?: unknown };
      return payload.ok === true
        ? { ok: true, result: payload.data }
        : { ok: false, error: String(payload.error ?? "erro desconhecido") };
    }
    return { ok: true, result: parsed };
  } catch {
    return { ok: true, result: text };
  }
};

export const lastText = (messages: readonly BaseMessage[]): string => {
  const last = messages.findLast((message) => message.getType() === "ai");
  return last?.text.trim() ?? "";
};

export const countAiMessages = (messages: readonly BaseMessage[]): number =>
  messages.filter((message) => message.getType() === "ai").length;

/**
 * Traduz o histórico de mensagens do agente para o trace tipado do OpsPilot.
 * Pura: recebe mensagens, devolve eventos — sem rede e sem relógio.
 *
 * A resposta final NÃO entra em `events`; ela sai em `answer` para que a
 * estratégia a acrescente via `finishRun`, garantindo a obrigação S3.
 */
export function toTrace(messages: readonly BaseMessage[]): {
  readonly events: readonly TraceEvent[];
  readonly answer: string;
} {
  const events: TraceEvent[] = [];
  const lastAiIndex = messages.findLastIndex(
    (message) => message.getType() === "ai" && toolCallsOf(message).length === 0,
  );

  messages.forEach((message, index) => {
    const type = message.getType();

    if (type === "ai") {
      const calls = toolCallsOf(message);
      const text = message.text.trim();

      if (calls.length === 0) {
        // A última mensagem sem tool calls é a resposta; as demais são raciocínio.
        if (index !== lastAiIndex && text !== "") {
          events.push({ type: "thought", text });
        }
        return;
      }

      if (text !== "") events.push({ type: "thought", text });
      for (const call of calls) {
        events.push({
          type: "action",
          tool: call.name ?? "desconhecida",
          args: call.args ?? {},
          ...(call.id === undefined ? {} : { callId: call.id }),
        });
      }
      return;
    }

    if (type === "tool") {
      const callId = toolCallIdOf(message);
      events.push({
        type: "observation",
        ...(callId === undefined ? {} : { callId }),
        ...readObservation(message.text),
      });
    }
  });

  return { events, answer: lastText(messages) };
}
