import type { DatabaseSync } from "node:sqlite";

import { MERCADINHO_SERVICES, SEED_ALERTS, SEED_RUNBOOKS } from "../seed-data.js";

/**
 * Popula o cenário "Mercadinho" quando o armazenamento está vazio. Idempotente: usa
 * `INSERT OR IGNORE` por chave primária e só roda quando `services` não tem nenhuma linha, então
 * reabrir o store sobre um arquivo já semeado nunca duplica dados.
 */
export function seedIfEmpty(db: DatabaseSync): void {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM services").get() as {
    count: number;
  };
  if (count > 0) return;

  const insertService = db.prepare("INSERT OR IGNORE INTO services (id, name) VALUES (?, ?)");
  for (const service of MERCADINHO_SERVICES) {
    insertService.run(service.id, service.name);
  }

  const insertAlert = db.prepare(
    "INSERT OR IGNORE INTO alerts (id, service_id, severity, status, summary) VALUES (?, ?, ?, ?, ?)",
  );
  for (const alert of SEED_ALERTS) {
    insertAlert.run(alert.id, alert.serviceId, alert.severity, alert.status, alert.summary);
  }

  const insertRunbook = db.prepare(
    "INSERT OR IGNORE INTO runbooks (service_id, content) VALUES (?, ?)",
  );
  for (const runbook of SEED_RUNBOOKS) {
    insertRunbook.run(runbook.serviceId, runbook.content);
  }
}
