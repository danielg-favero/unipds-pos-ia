/** Espelha `src/domain/strategy.ts::TraceEvent` do backend (contracts/http-api.md). */
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
  | { readonly type: "route"; readonly route: string; readonly reason: string; readonly manual: boolean }
  | {
      readonly type: "fallback";
      readonly primaryModel: string;
      readonly fallbackModel: string;
      readonly reason: string;
    }
  | {
      readonly type: "handoff";
      readonly from: "supervisor" | "analista" | "planejador" | "executor";
      readonly to: "analista" | "planejador" | "executor" | "done";
      readonly brief: string;
    };

export type RunMetrics = {
  readonly llmCalls: number;
  readonly latencyMs: number;
  readonly historyMessages: number;
  readonly promptTokensReal?: number;
  readonly modelUsed?: string;
};

export type ApprovalTool = "open_incident" | "resolve_incident";
export type PendingApprovalStatus = "pending" | "approved" | "denied";

export type PendingApproval = {
  readonly id: string;
  readonly tool: ApprovalTool;
  readonly args: Readonly<Record<string, unknown>>;
  readonly description: string;
  readonly status: PendingApprovalStatus;
  readonly result?: unknown;
  readonly decidedAt?: string;
};

export type ChatSuccess = {
  readonly kind: "success";
  readonly answer: string;
  readonly trace: readonly TraceEvent[];
  readonly metrics: RunMetrics;
  readonly conversation: string;
  readonly requestId: string;
};

export type ChatPendingApproval = {
  readonly kind: "pendingApproval";
  readonly conversation: string;
  readonly pendingApproval: PendingApproval;
};

export type ChatResult = ChatSuccess | ChatPendingApproval;

export class OpsPilotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "OpsPilotApiError";
  }
}
