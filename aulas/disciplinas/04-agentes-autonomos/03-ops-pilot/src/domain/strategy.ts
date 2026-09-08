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
  | { readonly type: "answer"; readonly text: string; readonly partial: boolean };

export type RunMetrics = {
  readonly llmCalls: number;
  readonly latencyMs: number;
};

export type StrategyInput = {
  readonly request: string;
  readonly maxIterations: number;
  readonly store: OpsStore;
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
