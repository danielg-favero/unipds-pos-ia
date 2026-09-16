import { DomainError } from "./errors.js";

/** Ações sensíveis que exigem aprovação humana antes de executar (016, research.md §2). */
export const APPROVAL_TOOLS = ["open_incident", "resolve_incident"] as const;
export type ApprovalTool = (typeof APPROVAL_TOOLS)[number];

export const isApprovalTool = (tool: string): tool is ApprovalTool =>
  (APPROVAL_TOOLS as readonly string[]).includes(tool);

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

/**
 * Lançado pelo `OpsStore` decorado com o guardrail (`withApprovalGuardrail`) no
 * lugar de executar `open_incident`/`resolve_incident` de fato. Capturado por
 * `asToolResult` como qualquer outro erro de domínio — o modelo recebe uma
 * observação de que a ação exige aprovação, nunca a executa sozinho.
 */
export class ApprovalRequiredError extends DomainError {
  constructor(readonly approval: PendingApproval) {
    super(`Ação sensível "${approval.tool}" registrada e pendente de aprovação humana (id: ${approval.id}).`);
  }
}

export class ApprovalNotFoundError extends DomainError {
  constructor(readonly id: string) {
    super(`Aprovação não encontrada: ${id}`);
  }
}

export class ApprovalNotPendingError extends DomainError {
  constructor(readonly approval: PendingApproval) {
    super(`Decisão já registrada para ${approval.id}: ${approval.status}`);
  }
}

const asText = (value: unknown): string => (typeof value === "string" ? value : String(value ?? ""));

export const describeApprovalAction = (
  tool: ApprovalTool,
  args: Readonly<Record<string, unknown>>,
): string =>
  tool === "open_incident"
    ? `Abrir incidente "${asText(args.title)}" para o serviço ${asText(args.service)} (severidade ${asText(args.severity)})`
    : `Resolver incidente ${asText(args.id)}`;
