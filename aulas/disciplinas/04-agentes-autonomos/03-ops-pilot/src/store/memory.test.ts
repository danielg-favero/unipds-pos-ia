import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  IncidentAlreadyResolvedError,
  IncidentNotFoundError,
  ServiceNotFoundError,
} from "../domain/errors.js";
import { MemoryOpsStore } from "./memory.js";

describe("MemoryOpsStore — estado inicial", () => {
  it("nasce com 6 serviços", async () => {
    const store = new MemoryOpsStore();
    assert.equal((await store.listServices()).length, 6);
  });

  it("nasce com 6 alertas: 3 firing e 3 resolved", async () => {
    const store = new MemoryOpsStore();
    assert.equal((await store.listAlerts()).length, 6);
    assert.equal((await store.listAlerts("firing")).length, 3);
    assert.equal((await store.listAlerts("resolved")).length, 3);
  });

  it("nasce sem incidentes", async () => {
    const store = new MemoryOpsStore();
    assert.deepEqual(await store.listIncidents(), []);
  });

  it("isola instâncias: mudar uma não afeta a outra", async () => {
    const a = new MemoryOpsStore();
    const b = new MemoryOpsStore();
    await a.openIncident({ title: "x", serviceId: "checkout-api", severity: "low" });
    assert.equal((await b.listIncidents()).length, 0);
  });
});

describe("MemoryOpsStore — listAlerts", () => {
  it("devolve ordem estável por id", async () => {
    const store = new MemoryOpsStore();
    const ids = (await store.listAlerts()).map((alert) => alert.id);
    assert.deepEqual(ids, [
      "alert-01",
      "alert-02",
      "alert-03",
      "alert-04",
      "alert-05",
      "alert-06",
    ]);
  });

  it("filtra por status", async () => {
    const store = new MemoryOpsStore();
    const firing = await store.listAlerts("firing");
    assert.ok(firing.every((alert) => alert.status === "firing"));
    assert.deepEqual(
      firing.map((alert) => alert.id),
      ["alert-01", "alert-02", "alert-03"],
    );
  });

  it("devolve lista vazia quando não há alertas, sem lançar", async () => {
    const store = new MemoryOpsStore([], []);
    assert.deepEqual(await store.listAlerts("firing"), []);
  });
});

describe("MemoryOpsStore — openIncident", () => {
  it("cria incidente aberto e devolve o id", async () => {
    const store = new MemoryOpsStore();
    const incident = await store.openIncident({
      title: "5xx no checkout",
      serviceId: "checkout-api",
      severity: "critical",
    });
    assert.equal(incident.id, "inc-1");
    assert.equal(incident.status, "open");
    assert.equal(incident.serviceId, "checkout-api");
  });

  it("gera ids sequenciais", async () => {
    const store = new MemoryOpsStore();
    const first = await store.openIncident({
      title: "a",
      serviceId: "checkout-api",
      severity: "low",
    });
    const second = await store.openIncident({
      title: "b",
      serviceId: "auth-service",
      severity: "high",
    });
    assert.deepEqual([first.id, second.id], ["inc-1", "inc-2"]);
  });

  it("rejeita serviço não cadastrado sem alterar o estado", async () => {
    const store = new MemoryOpsStore();
    await assert.rejects(
      () =>
        store.openIncident({
          title: "x",
          serviceId: "servico-fantasma",
          severity: "low",
        }),
      ServiceNotFoundError,
    );
    assert.equal((await store.listIncidents()).length, 0);
  });
});

describe("MemoryOpsStore — resolveIncident", () => {
  it("resolve um incidente aberto", async () => {
    const store = new MemoryOpsStore();
    const opened = await store.openIncident({
      title: "fila travada",
      serviceId: "payments-worker",
      severity: "high",
    });
    const resolved = await store.resolveIncident(opened.id);
    assert.equal(resolved.status, "resolved");
    assert.equal((await store.getIncident(opened.id))?.status, "resolved");
  });

  it("rejeita id inexistente sem alterar o estado", async () => {
    const store = new MemoryOpsStore();
    await store.openIncident({
      title: "a",
      serviceId: "checkout-api",
      severity: "low",
    });
    await assert.rejects(() => store.resolveIncident("inc-999"), IncidentNotFoundError);
    assert.equal((await store.getIncident("inc-1"))?.status, "open");
  });

  it("rejeita incidente já resolvido sem alterar o estado", async () => {
    const store = new MemoryOpsStore();
    const opened = await store.openIncident({
      title: "a",
      serviceId: "checkout-api",
      severity: "low",
    });
    await store.resolveIncident(opened.id);
    await assert.rejects(
      () => store.resolveIncident(opened.id),
      IncidentAlreadyResolvedError,
    );
    assert.equal((await store.listIncidents("all")).length, 1);
  });
});

describe("MemoryOpsStore — listIncidents", () => {
  const withOpenAndResolved = async (): Promise<MemoryOpsStore> => {
    const store = new MemoryOpsStore();
    await store.openIncident({ title: "aberto", serviceId: "checkout-api", severity: "low" });
    const toResolve = await store.openIncident({
      title: "vai ser resolvido",
      serviceId: "auth-service",
      severity: "medium",
    });
    await store.resolveIncident(toResolve.id);
    return store;
  };

  it("sem filtro devolve só abertos", async () => {
    const store = await withOpenAndResolved();
    const incidents = await store.listIncidents();
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0]?.status, "open");
  });

  it("filtro 'resolved' devolve só resolvidos", async () => {
    const store = await withOpenAndResolved();
    const incidents = await store.listIncidents("resolved");
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0]?.status, "resolved");
  });

  it("filtro 'all' devolve todos", async () => {
    const store = await withOpenAndResolved();
    assert.equal((await store.listIncidents("all")).length, 2);
  });
});

describe("MemoryOpsStore — getRunbook", () => {
  it("devolve o conteúdo de um serviço com runbook cadastrado", async () => {
    const store = new MemoryOpsStore();
    const runbook = await store.getRunbook("checkout-api");
    assert.ok(typeof runbook?.content === "string" && runbook.content.length > 0);
  });

  it("devolve undefined para serviço sem runbook cadastrado", async () => {
    const store = new MemoryOpsStore();
    assert.equal(await store.getRunbook("search-indexer"), undefined);
  });

  it("lança ServiceNotFoundError para serviço inexistente", async () => {
    const store = new MemoryOpsStore();
    await assert.rejects(() => store.getRunbook("servico-fantasma"), ServiceNotFoundError);
  });
});
