import type { ApprovalTool, PendingApproval, PendingApprovalStatus } from "../domain/approval.js";

export type CreatePendingApprovalInput = {
  readonly id: string;
  readonly conversationId: string;
  readonly tool: ApprovalTool;
  readonly args: Readonly<Record<string, unknown>>;
  readonly description: string;
};

/**
 * Persistência de ações sensíveis pendentes de aprovação humana (016). Mesmo
 * padrão de `RequestTraceStore` (015): porta dedicada, não faz parte de
 * `OpsStore`, para não alterar o contrato consumido pelas estratégias/CLI.
 */
export interface ApprovalStore {
  create(input: CreatePendingApprovalInput): Promise<PendingApproval>;
  get(id: string): Promise<PendingApproval | undefined>;
  /** Id da conversa associada, gravado em `create` — usado para compor a resposta de `/chat/:id/decision`. */
  getConversationId(id: string): Promise<string | undefined>;
  /** Lança `ApprovalNotFoundError`/`ApprovalNotPendingError` — só decide uma aprovação ainda `pending`. */
  decide(id: string, status: Exclude<PendingApprovalStatus, "pending">, result?: unknown): Promise<PendingApproval>;
}
