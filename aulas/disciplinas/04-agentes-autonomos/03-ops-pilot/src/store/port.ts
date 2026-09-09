import type { Alert, AlertStatus, Incident, Runbook, Service, Severity } from "../domain/types.js";

export type OpenIncidentInput = {
  readonly title: string;
  readonly serviceId: string;
  readonly severity: Severity;
};

export type IncidentListFilter = "open" | "resolved" | "all";

/**
 * Única fronteira de I/O de dados do núcleo. Adaptadores que a satisfazem:
 * `MemoryOpsStore` (padrão, testes e bench), `SqliteOpsStore` (persistência real) e
 * `SequelizeOpsStore` (MySQL, legado).
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
  /** Sem `filter` ou `"open"`: só abertos. Sempre ordenado por `id`. */
  listIncidents(filter?: IncidentListFilter): Promise<readonly Incident[]>;
  /**
   * `undefined` quando o serviço existe mas não tem runbook cadastrado.
   * Lança `ServiceNotFoundError` quando o serviço não existe.
   */
  getRunbook(serviceId: string): Promise<Runbook | undefined>;
}
