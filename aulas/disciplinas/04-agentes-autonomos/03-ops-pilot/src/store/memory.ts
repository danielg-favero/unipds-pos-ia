import {
  IncidentAlreadyResolvedError,
  IncidentNotFoundError,
  ServiceNotFoundError,
} from "../domain/errors.js";
import type { Alert, AlertStatus, Incident, Service } from "../domain/types.js";
import type { OpenIncidentInput, OpsStore } from "./port.js";
import { SEED_ALERTS, SEED_SERVICES } from "./seed-data.js";

/**
 * Adaptador em memória: padrão do arena e único store usado nos testes.
 * Cada instância nasce com o seed completo e é isolada das demais.
 */
export class MemoryOpsStore implements OpsStore {
  readonly #services: readonly Service[];
  readonly #alerts: readonly Alert[];
  #incidents: Incident[] = [];
  #nextIncident = 1;

  constructor(
    services: readonly Service[] = SEED_SERVICES,
    alerts: readonly Alert[] = SEED_ALERTS,
  ) {
    this.#services = [...services];
    this.#alerts = [...alerts];
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
    };
    this.#nextIncident += 1;
    this.#incidents = [...this.#incidents, incident];
    return incident;
  }

  async resolveIncident(id: string): Promise<Incident> {
    const current = this.#incidents.find((incident) => incident.id === id);
    if (current === undefined) throw new IncidentNotFoundError(id);
    if (current.status === "resolved") throw new IncidentAlreadyResolvedError(id);

    const resolved: Incident = { ...current, status: "resolved" };
    this.#incidents = this.#incidents.map((incident) =>
      incident.id === id ? resolved : incident,
    );
    return resolved;
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    return this.#incidents.find((incident) => incident.id === id);
  }

  /** Somente para inspeção em testes; não faz parte da porta. */
  async listIncidents(): Promise<readonly Incident[]> {
    return [...this.#incidents];
  }
}
