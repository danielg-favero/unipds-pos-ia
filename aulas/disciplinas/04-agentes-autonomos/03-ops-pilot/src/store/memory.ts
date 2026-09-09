import {
  IncidentAlreadyResolvedError,
  IncidentNotFoundError,
  ServiceNotFoundError,
} from "../domain/errors.js";
import type { Alert, AlertStatus, Incident, Runbook, Service } from "../domain/types.js";
import type { IncidentListFilter, OpenIncidentInput, OpsStore } from "./port.js";
import { SEED_ALERTS, SEED_RUNBOOKS, SEED_SERVICES } from "./seed-data.js";

/**
 * Adaptador em memória: padrão do arena e único store usado nos testes.
 * Cada instância nasce com o seed completo e é isolada das demais.
 */
export class MemoryOpsStore implements OpsStore {
  readonly #services: readonly Service[];
  readonly #alerts: readonly Alert[];
  #incidents: Incident[] = [];
  #nextIncident = 1;

  readonly #runbooks: readonly Runbook[];

  constructor(
    services: readonly Service[] = SEED_SERVICES,
    alerts: readonly Alert[] = SEED_ALERTS,
    runbooks: readonly Runbook[] = SEED_RUNBOOKS,
  ) {
    this.#services = [...services];
    this.#alerts = [...alerts];
    this.#runbooks = [...runbooks];
  }

  async listServices(): Promise<readonly Service[]> {
    return [...this.#services];
  }

  async listAlerts(status?: AlertStatus): Promise<readonly Alert[]> {
    return this.#alerts
      .filter((alert) => status === undefined || alert.status === status)
      .toSorted((a, b) => a.id.localeCompare(b.id));
  }

  async openIncident(input: OpenIncidentInput): Promise<Incident> {
    if (!this.#services.some((service) => service.id === input.serviceId)) {
      throw new ServiceNotFoundError(input.serviceId);
    }
    const incident: Incident = {
      id: `inc-${this.#nextIncident}`,
      title: input.title,
      serviceId: input.serviceId,
      severity: input.severity,
      status: "open",
      resolvedAt: null,
      summary: null,
    };
    this.#nextIncident += 1;
    this.#incidents = [...this.#incidents, incident];
    return incident;
  }

  async resolveIncident(id: string): Promise<Incident> {
    const current = this.#incidents.find((incident) => incident.id === id);
    if (current === undefined) throw new IncidentNotFoundError(id);
    if (current.status === "resolved") throw new IncidentAlreadyResolvedError(id);

    const resolved: Incident = {
      ...current,
      status: "resolved",
      resolvedAt: new Date().toISOString(),
      summary: current.summary,
    };
    this.#incidents = this.#incidents.map((incident) =>
      incident.id === id ? resolved : incident,
    );
    return resolved;
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    return this.#incidents.find((incident) => incident.id === id);
  }

  /** Sem `filter` ou `"open"`: só abertos. Sempre ordenado por `id`. */
  async listIncidents(filter: IncidentListFilter = "open"): Promise<readonly Incident[]> {
    return this.#incidents
      .filter((incident) => filter === "all" || incident.status === filter)
      .toSorted((a, b) => a.id.localeCompare(b.id));
  }

  async getRunbook(serviceId: string): Promise<Runbook | undefined> {
    if (!this.#services.some((service) => service.id === serviceId)) {
      throw new ServiceNotFoundError(serviceId);
    }
    return this.#runbooks.find((runbook) => runbook.serviceId === serviceId);
  }
}
