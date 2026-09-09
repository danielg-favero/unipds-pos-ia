import type { DatabaseSync } from "node:sqlite";

import { ALERT_STATUSES, INCIDENT_STATUSES, SEVERITIES } from "../../domain/types.js";

const inList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(",");

/**
 * DDL idempotente: `CREATE TABLE IF NOT EXISTS`, seguro para rodar toda vez que o store é aberto.
 * Os valores dos `CHECK` vêm das constantes de domínio para nunca divergir de `src/domain/types.ts`.
 */
export function ensureSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id   TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id         TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id),
      severity   TEXT NOT NULL CHECK (severity IN (${inList(SEVERITIES)})),
      status     TEXT NOT NULL CHECK (status IN (${inList(ALERT_STATUSES)})),
      summary    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      service_id  TEXT NOT NULL REFERENCES services(id),
      severity    TEXT NOT NULL CHECK (severity IN (${inList(SEVERITIES)})),
      status      TEXT NOT NULL CHECK (status IN (${inList(INCIDENT_STATUSES)})),
      resolved_at TEXT,
      summary     TEXT,
      CHECK ((status = 'open' AND resolved_at IS NULL) OR (status = 'resolved'))
    );

    CREATE TABLE IF NOT EXISTS runbooks (
      service_id TEXT PRIMARY KEY REFERENCES services(id),
      content    TEXT NOT NULL
    );
  `);
}
