import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import {
  IncidentAlreadyResolvedError,
  IncidentNotFoundError,
  ServiceNotFoundError,
  ValidationError,
} from "../domain/errors.js";
import {
  ALERT_STATUSES,
  INCIDENT_STATUSES,
  SEVERITIES,
  type Alert,
  type AlertStatus,
  type Incident,
  type Service,
} from "../domain/types.js";
import type { OpenIncidentInput, OpsStore } from "./port.js";
import { SEED_ALERTS, SEED_SERVICES } from "./seed-data.js";

export const DEFAULT_DB_PATH = resolve(process.cwd(), "data", "ops-db.json");

const ServiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const AlertSchema = z.object({
  id: z.string().min(1),
  serviceId: z.string().min(1),
  severity: z.enum(SEVERITIES),
  status: z.enum(ALERT_STATUSES),
  summary: z.string().min(1),
});

const IncidentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  serviceId: z.string().min(1),
  severity: z.enum(SEVERITIES),
  status: z.enum(INCIDENT_STATUSES),
});

export const DatabaseSchema = z.object({
  services: z.array(ServiceSchema),
  alerts: z.array(AlertSchema),
  incidents: z.array(IncidentSchema).default([]),
});

export type Database = z.infer<typeof DatabaseSchema>;

export const seedDatabase = (): Database => ({
  services: SEED_SERVICES.map((service) => ({ ...service })),
  alerts: SEED_ALERTS.map((alert) => ({ ...alert })),
  incidents: [],
});

/** Escreve o arquivo formatado e com ordem estável de chaves. */
export async function writeDatabase(path: string, db: Database): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

/** Lê e valida o arquivo na fronteira: conteúdo de disco é entrada externa. */
export async function readDatabase(path: string): Promise<Database> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new ValidationError(
      `Base de dados não encontrada em ${path}. Rode \`npm run seed\` primeiro.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError(`Base de dados inválida: ${path} não é um JSON válido.`);
  }

  const result = DatabaseSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ValidationError(`Base de dados inválida em ${path} — ${issues}`);
  }
  return result.data;
}

/**
 * Store sobre um arquivo JSON: o que o modelo lê já existe em disco, e o que
 * ele cria persiste entre execuções. Leituras e escritas são serializadas para
 * que duas ferramentas concorrentes não sobrescrevam uma à outra.
 */
export class JsonOpsStore implements OpsStore {
  #queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly path: string = DEFAULT_DB_PATH) {}

  async listServices(): Promise<readonly Service[]> {
    return this.#serialize(async (db) => [...db.services]);
  }

  async listAlerts(status?: AlertStatus): Promise<readonly Alert[]> {
    return this.#serialize(async (db) =>
      db.alerts
        .filter((alert) => status === undefined || alert.status === status)
        .toSorted((a, b) => a.id.localeCompare(b.id)),
    );
  }

  async openIncident(input: OpenIncidentInput): Promise<Incident> {
    return this.#serialize(async (db) => {
      if (!db.services.some((service) => service.id === input.serviceId)) {
        throw new ServiceNotFoundError(input.serviceId);
      }
      const incident: Incident = {
        id: `inc-${db.incidents.length + 1}`,
        title: input.title,
        serviceId: input.serviceId,
        severity: input.severity,
        status: "open",
      };
      await writeDatabase(this.path, { ...db, incidents: [...db.incidents, incident] });
      return incident;
    });
  }

  async resolveIncident(id: string): Promise<Incident> {
    return this.#serialize(async (db) => {
      const current = db.incidents.find((incident) => incident.id === id);
      if (current === undefined) throw new IncidentNotFoundError(id);
      if (current.status === "resolved") throw new IncidentAlreadyResolvedError(id);

      const resolved: Incident = { ...current, status: "resolved" };
      await writeDatabase(this.path, {
        ...db,
        incidents: db.incidents.map((incident) => (incident.id === id ? resolved : incident)),
      });
      return resolved;
    });
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    return this.#serialize(async (db) => db.incidents.find((incident) => incident.id === id));
  }

  async listIncidents(): Promise<readonly Incident[]> {
    return this.#serialize(async (db) => [...db.incidents]);
  }

  /** Enfileira a operação para que leitura e escrita nunca se cruzem. */
  #serialize<T>(operation: (db: Database) => Promise<T>): Promise<T> {
    const next = this.#queue.then(
      async () => operation(await readDatabase(this.path)),
      async () => operation(await readDatabase(this.path)),
    );
    this.#queue = next.catch(() => undefined);
    return next;
  }
}
