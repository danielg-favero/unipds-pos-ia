import type { RequestStatRow } from "../domain/stats.js";
import type { RunMetrics, TraceEvent } from "../domain/strategy.js";

export type RequestStatus = "ok" | "error" | "timeout";

export type RequestRecord = {
  readonly id: string;
  readonly conversationId: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly durationMs?: number;
  readonly status: RequestStatus;
  readonly llmCalls?: number;
  readonly promptTokensReal?: number;
  readonly modelUsed?: string;
  /** Rota do grafo unificado (013) decidida nessa execução, se houver (015). */
  readonly route?: string;
  /** Estimativa de custo em USD (015, `domain/pricing.ts`); 0 para modelos `:free` ou desconhecidos. */
  readonly costUsd?: number;
  readonly error?: string;
};

export type TraceEventRecord = {
  readonly seq: number;
  readonly node: string;
  readonly event: TraceEvent;
  readonly createdAt: string;
};

export type RequestWithTrace = {
  readonly request: RequestRecord;
  readonly trace: readonly TraceEventRecord[];
};

/**
 * Porta de persistência de trace de requisições (015). `startRequest` grava a
 * linha inicial de `requests`; `finishRequest` completa com as métricas finais.
 * Ambos e `appendTraceEvents` são pensados para uso fire-and-forget após a
 * resposta HTTP já ter sido enviada (research.md §5) — falhas aqui nunca devem
 * propagar para o caminho principal de `/chat`.
 */
export interface RequestTraceStore {
  startRequest(id: string, conversationId: string): Promise<void>;
  finishRequest(
    id: string,
    result: {
      readonly status: RequestStatus;
      readonly metrics?: RunMetrics;
      readonly route?: string;
      readonly costUsd?: number;
      readonly error?: string;
    },
  ): Promise<void>;
  /** Preserva a posição de cada evento no array `StrategyRun.trace` (FR-005). */
  appendTraceEvents(requestId: string, events: readonly TraceEvent[]): Promise<void>;
  getRequestWithTrace(id: string): Promise<RequestWithTrace | undefined>;
  /** Linhas cruas de `requests` com `started_at >= sinceIso`, para agregação em `domain/stats.ts` (`GET /stats`). */
  statsSince(sinceIso: string): Promise<readonly RequestStatRow[]>;
}
