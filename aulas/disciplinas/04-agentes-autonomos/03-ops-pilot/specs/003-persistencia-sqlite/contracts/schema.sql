-- Contract: DDL idempotente do SqliteOpsStore (src/store/sqlite/schema.ts)
-- Gerado a partir das constantes de domínio (SEVERITIES, ALERT_STATUSES, INCIDENT_STATUSES) —
-- os valores abaixo devem ficar em sync com src/domain/types.ts, nunca hardcoded em dois lugares.

CREATE TABLE IF NOT EXISTS services (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id         TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id),
  severity   TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status     TEXT NOT NULL CHECK (status IN ('firing','resolved')),
  summary    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  service_id  TEXT NOT NULL REFERENCES services(id),
  severity    TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status      TEXT NOT NULL CHECK (status IN ('open','resolved')),
  resolved_at TEXT,
  summary     TEXT,
  CHECK ((status = 'open' AND resolved_at IS NULL) OR (status = 'resolved'))
);

CREATE TABLE IF NOT EXISTS runbooks (
  service_id TEXT PRIMARY KEY REFERENCES services(id),
  content    TEXT NOT NULL
);
