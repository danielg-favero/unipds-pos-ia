import { ApprovalRequiredError, describeApprovalAction } from "../domain/approval.js";
import type { OpsStore } from "../store/port.js";
import type { ApprovalStore } from "../store/approval-port.js";

/**
 * Decora `openIncident`/`resolveIncident` para nunca executar de fato: em vez
 * disso registra a ação como pendente e lança `ApprovalRequiredError`, que
 * `asToolResult` (agents/tools.ts) traduz em observação para o modelo. O
 * guardrail vive nesta camada — fora do controle do LLM — para que nenhuma
 * "decisão" do modelo consiga pular a confirmação humana (research.md §2,
 * constitution "Segurança por Padrão").
 */
export function withApprovalGuardrail(
  store: OpsStore,
  requestId: string,
  conversationId: string,
  approvalStore: ApprovalStore,
): OpsStore {
  return {
    // Delegação explícita: `store` é normalmente uma instância de classe com
    // métodos no protótipo (SqliteOpsStore/MemoryOpsStore), então `{...store}`
    // copiaria só propriedades próprias e perderia todo o resto da interface.
    listAlerts: (...args) => store.listAlerts(...args),
    listServices: (...args) => store.listServices(...args),
    getIncident: (...args) => store.getIncident(...args),
    listIncidents: (...args) => store.listIncidents(...args),
    getRunbook: (...args) => store.getRunbook(...args),

    async openIncident(input) {
      const description = describeApprovalAction("open_incident", input);
      const approval = await approvalStore.create({
        id: requestId,
        conversationId,
        tool: "open_incident",
        args: input,
        description,
      });
      throw new ApprovalRequiredError(approval);
    },

    async resolveIncident(id) {
      const args = { id };
      const description = describeApprovalAction("resolve_incident", args);
      const approval = await approvalStore.create({
        id: requestId,
        conversationId,
        tool: "resolve_incident",
        args,
        description,
      });
      throw new ApprovalRequiredError(approval);
    },
  };
}
