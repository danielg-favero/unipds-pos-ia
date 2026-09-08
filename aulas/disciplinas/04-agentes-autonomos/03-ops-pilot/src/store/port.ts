import type { Alert, AlertStatus, Incident, Service, Severity } from "../domain/types.js";

export type OpenIncidentInput = {
  readonly title: string;
  readonly serviceId: string;
  readonly severity: Severity;
};

/**
 * Única fronteira de I/O de dados do núcleo. Dois adaptadores a satisfazem:
 * `MemoryOpsStore` (padrão, testes) e `SequelizeOpsStore` (MySQL).
 */
export interface OpsStore {
  /** Sem `status`, devolve todos. Sempre ordenado por `id`. */
  listAlerts(status?: AlertStatus): Promise<readonly Alert[]>;
  listServices(): Promise<readonly Service[]>;
  /** Lança `ServiceNotFoundError` se o serviço não existir. */
  openIncident(input: OpenIncidentInput): Promise<Incident>;
  /** Lança `IncidentNotFoundError` ou `IncidentAlreadyResolvedError`. */
  resolveIncident(id: string): Promise<Incident>;
  getIncident(id: string): Promise<Incident | undefined>;
}
