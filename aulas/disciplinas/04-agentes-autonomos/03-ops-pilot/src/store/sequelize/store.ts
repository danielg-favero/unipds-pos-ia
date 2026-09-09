import type { Sequelize } from "sequelize";

import {
  IncidentAlreadyResolvedError,
  IncidentNotFoundError,
  ServiceNotFoundError,
  UnsupportedByStoreError,
} from "../../domain/errors.js";
import type { Alert, AlertStatus, Incident, Runbook, Service } from "../../domain/types.js";
import type { IncidentListFilter, OpenIncidentInput, OpsStore } from "../port.js";
import { createSequelize } from "./connection.js";
import { initModels, type OpsModels } from "./models.js";

/**
 * Adaptador MySQL. Satisfaz a mesma porta e levanta os mesmos erros de domínio
 * do adaptador em memória, para que a troca seja transparente ao arena.
 */
export class SequelizeOpsStore implements OpsStore {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly models: OpsModels,
  ) {}

  async listServices(): Promise<readonly Service[]> {
    const rows = await this.models.Service.findAll({ order: [["id", "ASC"]] });
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async listAlerts(status?: AlertStatus): Promise<readonly Alert[]> {
    const rows = await this.models.Alert.findAll({
      ...(status === undefined ? {} : { where: { status } }),
      order: [["id", "ASC"]],
    });
    return rows.map((row) => ({
      id: row.id,
      serviceId: row.serviceId,
      severity: row.severity,
      status: row.status,
      summary: row.summary,
    }));
  }

  async openIncident(input: OpenIncidentInput): Promise<Incident> {
    const service = await this.models.Service.findByPk(input.serviceId);
    if (service === null) throw new ServiceNotFoundError(input.serviceId);

    const created = await this.models.Incident.create({
      id: `inc-${(await this.models.Incident.count()) + 1}`,
      title: input.title,
      serviceId: input.serviceId,
      severity: input.severity,
      status: "open",
    });
    return this.#toIncident(created);
  }

  async resolveIncident(id: string): Promise<Incident> {
    const row = await this.models.Incident.findByPk(id);
    if (row === null) throw new IncidentNotFoundError(id);
    if (row.status === "resolved") throw new IncidentAlreadyResolvedError(id);

    row.status = "resolved";
    row.resolvedAt = new Date().toISOString();
    await row.save();
    return this.#toIncident(row);
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    const row = await this.models.Incident.findByPk(id);
    return row === null ? undefined : this.#toIncident(row);
  }

  async listIncidents(filter: IncidentListFilter = "open"): Promise<readonly Incident[]> {
    const rows = await this.models.Incident.findAll({
      ...(filter === "all" ? {} : { where: { status: filter } }),
      order: [["id", "ASC"]],
    });
    return rows.map((row) => this.#toIncident(row));
  }

  async getRunbook(_serviceId: string): Promise<Runbook | undefined> {
    throw new UnsupportedByStoreError("getRunbook (adaptador MySQL não modela runbooks; use --store sqlite)");
  }

  async close(): Promise<void> {
    await this.sequelize.close();
  }

  #toIncident(row: InstanceType<OpsModels["Incident"]>): Incident {
    return {
      id: row.id,
      title: row.title,
      serviceId: row.serviceId,
      severity: row.severity,
      status: row.status,
      resolvedAt: row.resolvedAt,
      summary: row.summary,
    };
  }
}

/** Conecta, valida o acesso e devolve o store pronto. */
export async function createSequelizeStore(): Promise<SequelizeOpsStore> {
  const sequelize = createSequelize();
  const models = initModels(sequelize);
  await sequelize.authenticate();
  return new SequelizeOpsStore(sequelize, models);
}
