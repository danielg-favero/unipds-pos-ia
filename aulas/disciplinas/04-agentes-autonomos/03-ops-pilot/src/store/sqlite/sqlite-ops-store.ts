import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import {
  IncidentAlreadyResolvedError,
  IncidentNotFoundError,
  ServiceNotFoundError,
} from "../../domain/errors.js";
import type { Alert, AlertStatus, Incident, Runbook, Service } from "../../domain/types.js";
import type { IncidentListFilter, OpenIncidentInput, OpsStore } from "../port.js";
import { ensureSchema } from "./schema.js";
import { seedIfEmpty } from "./seed.js";

type ServiceRow = { id: string; name: string };
type AlertRow = {
  id: string;
  service_id: string;
  severity: string;
  status: string;
  summary: string;
};
type IncidentRow = {
  id: string;
  title: string;
  service_id: string;
  severity: string;
  status: string;
  resolved_at: string | null;
  summary: string | null;
};
type RunbookRow = { service_id: string; content: string };

const toService = (row: ServiceRow): Service => ({ id: row.id, name: row.name });

const toAlert = (row: AlertRow): Alert => ({
  id: row.id,
  serviceId: row.service_id,
  severity: row.severity as Alert["severity"],
  status: row.status as AlertStatus,
  summary: row.summary,
});

const toIncident = (row: IncidentRow): Incident => ({
  id: row.id,
  title: row.title,
  serviceId: row.service_id,
  severity: row.severity as Incident["severity"],
  status: row.status as Incident["status"],
  resolvedAt: row.resolved_at,
  summary: row.summary,
});

/**
 * Adaptador SQLite: persistência real via `node:sqlite` (`DatabaseSync`). Satisfaz a mesma porta e
 * levanta os mesmos erros de domínio dos demais adaptadores. Toda query é um prepared statement —
 * nenhum SQL é concatenado com entrada externa.
 */
export class SqliteOpsStore implements OpsStore {
  readonly #db: DatabaseSync;
  readonly #stmts: {
    readonly listServices: StatementSync;
    readonly listAlerts: StatementSync;
    readonly listAlertsAll: StatementSync;
    readonly findService: StatementSync;
    readonly insertIncident: StatementSync;
    readonly countIncidents: StatementSync;
    readonly findIncident: StatementSync;
    readonly resolveIncident: StatementSync;
    readonly listIncidentsByStatus: StatementSync;
    readonly listIncidentsAll: StatementSync;
    readonly findRunbook: StatementSync;
  };

  constructor(path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    ensureSchema(this.#db);
    seedIfEmpty(this.#db);

    this.#stmts = {
      listServices: this.#db.prepare("SELECT id, name FROM services ORDER BY id"),
      listAlerts: this.#db.prepare(
        "SELECT id, service_id, severity, status, summary FROM alerts WHERE status = ? ORDER BY id",
      ),
      listAlertsAll: this.#db.prepare(
        "SELECT id, service_id, severity, status, summary FROM alerts ORDER BY id",
      ),
      findService: this.#db.prepare("SELECT id, name FROM services WHERE id = ?"),
      insertIncident: this.#db.prepare(
        "INSERT INTO incidents (id, title, service_id, severity, status, resolved_at, summary) VALUES (?, ?, ?, ?, 'open', NULL, NULL)",
      ),
      countIncidents: this.#db.prepare("SELECT COUNT(*) AS count FROM incidents"),
      findIncident: this.#db.prepare(
        "SELECT id, title, service_id, severity, status, resolved_at, summary FROM incidents WHERE id = ?",
      ),
      resolveIncident: this.#db.prepare(
        "UPDATE incidents SET status = 'resolved', resolved_at = ? WHERE id = ?",
      ),
      listIncidentsByStatus: this.#db.prepare(
        "SELECT id, title, service_id, severity, status, resolved_at, summary FROM incidents WHERE status = ? ORDER BY id",
      ),
      listIncidentsAll: this.#db.prepare(
        "SELECT id, title, service_id, severity, status, resolved_at, summary FROM incidents ORDER BY id",
      ),
      findRunbook: this.#db.prepare("SELECT service_id, content FROM runbooks WHERE service_id = ?"),
    };
  }

  async listServices(): Promise<readonly Service[]> {
    return (this.#stmts.listServices.all() as ServiceRow[]).map(toService);
  }

  async listAlerts(status?: AlertStatus): Promise<readonly Alert[]> {
    const rows =
      status === undefined
        ? (this.#stmts.listAlertsAll.all() as AlertRow[])
        : (this.#stmts.listAlerts.all(status) as AlertRow[]);
    return rows.map(toAlert);
  }

  async openIncident(input: OpenIncidentInput): Promise<Incident> {
    const service = this.#stmts.findService.get(input.serviceId) as ServiceRow | undefined;
    if (service === undefined) throw new ServiceNotFoundError(input.serviceId);

    const { count } = this.#stmts.countIncidents.get() as { count: number };
    const id = `inc-${count + 1}`;
    this.#stmts.insertIncident.run(id, input.title, input.serviceId, input.severity);

    const row = this.#stmts.findIncident.get(id) as IncidentRow;
    return toIncident(row);
  }

  async resolveIncident(id: string): Promise<Incident> {
    const current = this.#stmts.findIncident.get(id) as IncidentRow | undefined;
    if (current === undefined) throw new IncidentNotFoundError(id);
    if (current.status === "resolved") throw new IncidentAlreadyResolvedError(id);

    this.#stmts.resolveIncident.run(new Date().toISOString(), id);
    const row = this.#stmts.findIncident.get(id) as IncidentRow;
    return toIncident(row);
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    const row = this.#stmts.findIncident.get(id) as IncidentRow | undefined;
    return row === undefined ? undefined : toIncident(row);
  }

  async listIncidents(filter: IncidentListFilter = "open"): Promise<readonly Incident[]> {
    const rows =
      filter === "all"
        ? (this.#stmts.listIncidentsAll.all() as IncidentRow[])
        : (this.#stmts.listIncidentsByStatus.all(filter) as IncidentRow[]);
    return rows.map(toIncident);
  }

  async getRunbook(serviceId: string): Promise<Runbook | undefined> {
    const service = this.#stmts.findService.get(serviceId) as ServiceRow | undefined;
    if (service === undefined) throw new ServiceNotFoundError(serviceId);

    const row = this.#stmts.findRunbook.get(serviceId) as RunbookRow | undefined;
    return row === undefined ? undefined : { serviceId: row.service_id, content: row.content };
  }

  close(): void {
    this.#db.close();
  }
}
