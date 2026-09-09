import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

import { ensureSchema } from "./schema.js";

const freshDb = (): DatabaseSync => {
  const db = new DatabaseSync(":memory:");
  ensureSchema(db);
  db.prepare("INSERT INTO services (id, name) VALUES (?, ?)").run("checkout-api", "Checkout API");
  return db;
};

describe("schema — DDL idempotente", () => {
  it("rodar ensureSchema duas vezes sobre o mesmo db não falha", () => {
    const db = new DatabaseSync(":memory:");
    ensureSchema(db);
    assert.doesNotThrow(() => ensureSchema(db));
  });
});

describe("schema — CHECK de campos de domínio fechado", () => {
  it("rejeita severidade fora do domínio em incidents", () => {
    const db = freshDb();
    assert.throws(() =>
      db
        .prepare(
          "INSERT INTO incidents (id, title, service_id, severity, status) VALUES (?, ?, ?, ?, ?)",
        )
        .run("inc-1", "x", "checkout-api", "sev1", "open"),
    );
  });

  it("rejeita status fora do domínio em incidents", () => {
    const db = freshDb();
    assert.throws(() =>
      db
        .prepare(
          "INSERT INTO incidents (id, title, service_id, severity, status) VALUES (?, ?, ?, ?, ?)",
        )
        .run("inc-1", "x", "checkout-api", "high", "mitigated"),
    );
  });

  it("rejeita incidente 'open' com resolved_at preenchido", () => {
    const db = freshDb();
    assert.throws(() =>
      db
        .prepare(
          "INSERT INTO incidents (id, title, service_id, severity, status, resolved_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run("inc-1", "x", "checkout-api", "high", "open", "2026-01-01T00:00:00.000Z"),
    );
  });

  it("rejeita severidade fora do domínio em alerts", () => {
    const db = freshDb();
    assert.throws(() =>
      db
        .prepare(
          "INSERT INTO alerts (id, service_id, severity, status, summary) VALUES (?, ?, ?, ?, ?)",
        )
        .run("alert-1", "checkout-api", "sev1", "firing", "x"),
    );
  });

  it("rejeita status fora do domínio em alerts", () => {
    const db = freshDb();
    assert.throws(() =>
      db
        .prepare(
          "INSERT INTO alerts (id, service_id, severity, status, summary) VALUES (?, ?, ?, ?, ?)",
        )
        .run("alert-1", "checkout-api", "high", "mitigated", "x"),
    );
  });
});
