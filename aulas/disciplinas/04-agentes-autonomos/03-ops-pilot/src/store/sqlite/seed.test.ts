import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { SqliteOpsStore } from "./sqlite-ops-store.js";

let dir: string;
let counter = 0;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "ops-sqlite-seed-"));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

const freshFile = (): string => join(dir, `db-${(counter += 1)}.db`);

describe("seed — cenário Mercadinho (US4)", () => {
  it("um store novo nasce com 5 serviços, 6 alertas (3 firing/3 resolved) e 3 runbooks", async () => {
    const store = new SqliteOpsStore(":memory:");
    const services = await store.listServices();
    const alerts = await store.listAlerts();
    assert.equal(services.length, 5);
    assert.equal(alerts.length, 6);
    assert.equal((await store.listAlerts("firing")).length, 3);
    assert.equal((await store.listAlerts("resolved")).length, 3);

    const runbookServices = ["checkout-api", "payments-worker", "auth-service"];
    for (const serviceId of runbookServices) {
      const runbook = await store.getRunbook(serviceId);
      assert.ok(runbook !== undefined, `esperava runbook para ${serviceId}`);
    }
  });

  it("reabrir o store sobre o mesmo arquivo não duplica o seed", async () => {
    const path = freshFile();
    const first = new SqliteOpsStore(path);
    const servicesBefore = await first.listServices();
    const alertsBefore = await first.listAlerts();
    first.close();

    const second = new SqliteOpsStore(path);
    const servicesAfter = await second.listServices();
    const alertsAfter = await second.listAlerts();
    assert.equal(servicesAfter.length, servicesBefore.length);
    assert.equal(alertsAfter.length, alertsBefore.length);
    second.close();
  });
});
