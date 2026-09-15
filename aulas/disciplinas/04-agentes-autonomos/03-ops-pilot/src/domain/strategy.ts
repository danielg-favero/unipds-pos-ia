import type { ContextBreakdown } from "../context/tokens.js";
import type { MemoryStore } from "../memory/memory-store.js";
import type { ConversationMessage } from "../store/conversation-port.js";
import type { OpsStore } from "../store/port.js";

export type TraceEvent =
  | { readonly type: "thought"; readonly text: string }
  | { readonly type: "plan"; readonly steps: readonly string[] }
  | {
      readonly type: "action";
      readonly tool: string;
      readonly args: Readonly<Record<string, unknown>>;
      readonly callId?: string;
    }
  | {
      readonly type: "observation";
      readonly callId?: string;
      readonly ok: boolean;
      readonly result?: unknown;
      readonly error?: string;
    }
  | { readonly type: "critique"; readonly text: string }
  | { readonly type: "answer"; readonly text: string; readonly partial: boolean }
  /** Decisão do roteador do grafo unificado (013): `manual` distingue override explícito de decisão automática/fallback. */
  | { readonly type: "route"; readonly route: string; readonly reason: string; readonly manual: boolean }
  /** Troca do modelo primário para o de reserva dentro de uma interação (014, FR-004). Emitido no máximo uma vez por execução. */
  | {
      readonly type: "fallback";
      readonly primaryModel: string;
      readonly fallbackModel: string;
      readonly reason: string;
    };

export type RunMetrics = {
  readonly llmCalls: number;
  readonly latencyMs: number;
  readonly historyMessages: number;
  /** Soma do uso real de tokens de prompt de todas as chamadas da interação; ausente se o provedor nunca reportou (FR-005, 010). */
  readonly promptTokensReal?: number;
  /** Estimativa por fonte (chars/4); sempre presente, mesmo com fontes vazias (FR-004, 010). */
  readonly contextBreakdown: ContextBreakdown;
  /** Modelo que efetivamente produziu a resposta final: primário, ou a reserva se houve fallback (014, FR-005). */
  readonly modelUsed?: string;
};

export type StrategyInput = {
  readonly request: string;
  readonly maxIterations: number;
  readonly store: OpsStore;
  readonly history?: readonly ConversationMessage[];
  /** Fatos memorizados do usuário, relevantes para `request` (recall). */
  readonly memories?: readonly string[];
  /** Resumo acumulado das mensagens que já saíram da janela de `history` (011). */
  readonly historySummary?: string;
  /** Usuário da conversa; junto de `memoryStore`, habilita a tool `forget_preference` (009). */
  readonly userId?: string;
  readonly memoryStore?: MemoryStore;
  /** Nome de rota forçado manualmente, contornando a decisão automática do roteador (013). */
  readonly overrideRoute?: string;
};

export type StrategyRun = {
  readonly answer: string;
  readonly trace: readonly TraceEvent[];
  readonly metrics: RunMetrics;
};

export interface ReasoningStrategy {
  readonly name: string;
  run(input: StrategyInput): Promise<StrategyRun>;
}

/**
 * Fecha uma execução no formato do contrato: o último evento é sempre um
 * `answer`, e `answer.text` é idêntico a `StrategyRun.answer` (obrigação S3).
 */
export const finishRun = (
  trace: readonly TraceEvent[],
  answer: string,
  partial: boolean,
  metrics: RunMetrics,
): StrategyRun => ({
  answer,
  trace: [...trace, { type: "answer", text: answer, partial }],
  metrics,
});
