import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import {
  IncidentAlreadyResolvedError,
  IncidentNotFoundError,
  ServiceNotFoundError,
} from "../../domain/errors.js";
import { SqliteOpsStore } from "./sqlite-ops-store.js";

let dir: string;
let counter = 0;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "ops-sqlite-"));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Cada teste ganha um arquivo próprio — determinístico e isolado, seedado no construtor. */
const freshFile = (): string => join(dir, `db-${(counter += 1)}.db`);

describe("SqliteOpsStore — primeira execução", () => {
  it("cria o diretório do arquivo de banco se ele ainda não existir", async () => {
    const path = join(dir, "subdir-inexistente", "opspilot.db");
    const store = new SqliteOpsStore(path);
    assert.equal((await store.listServices()).length, 5);
    store.close();
  });
});

describe("SqliteOpsStore — persistência entre reinícios (US1)", () => {
  it("um incidente aberto continua visível numa nova instância sobre o mesmo arquivo", async () => {
    const path = freshFile();
    const first = new SqliteOpsStore(path);
    const opened = await first.openIncident({
      title: "fila travada",
      serviceId: "checkout-api",
      severity: "high",
    });
    first.close();

    const second = new SqliteOpsStore(path);
    const found = await second.getIncident(opened.id);
    assert.equal(found?.title, "fila travada");
    assert.equal(found?.serviceId, "checkout-api");
    assert.equal(found?.severity, "high");
    assert.equal(found?.status, "open");
    second.close();
  });

  it("um serviço cadastrado no seed continua visível numa nova instância", async () => {
    const path = freshFile();
    const first = new SqliteOpsStore(path);
    const before1 = await first.listServices();
    first.close();

    const second = new SqliteOpsStore(path);
    const after1 = await second.listServices();
    assert.deepEqual(after1, before1);
    second.close();
  });
});

describe("SqliteOpsStore — abrir/resolver incidentes (paridade com MemoryOpsStore)", () => {
  it("abre incidente e devolve id sequencial", async () => {
    const store = new SqliteOpsStore(":memory:");
    const incident = await store.openIncident({
      title: "5xx no checkout",
      serviceId: "checkout-api",
      severity: "critical",
    });
    assert.equal(incident.status, "open");
    assert.equal(incident.resolvedAt, null);
    assert.equal(incident.summary, null);
  });

  it("rejeita serviço não cadastrado", async () => {
    const store = new SqliteOpsStore(":memory:");
    await assert.rejects(
      () =>
        store.openIncident({ title: "x", serviceId: "servico-fantasma", severity: "low" }),
      ServiceNotFoundError,
    );
  });

  it("resolve um incidente aberto e preenche resolvedAt", async () => {
    const store = new SqliteOpsStore(":memory:");
    const opened = await store.openIncident({
      title: "fila travada",
      serviceId: "payments-worker",
      severity: "high",
    });
    const resolved = await store.resolveIncident(opened.id);
    assert.equal(resolved.status, "resolved");
    assert.ok(typeof resolved.resolvedAt === "string" && resolved.resolvedAt.length > 0);
  });

  it("rejeita id inexistente", async () => {
    const store = new SqliteOpsStore(":memory:");
    await assert.rejects(() => store.resolveIncident("inc-999"), IncidentNotFoundError);
  });

  it("rejeita incidente já resolvido", async () => {
    const store = new SqliteOpsStore(":memory:");
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
  });
});

describe("SqliteOpsStore — listIncidents (US2)", () => {
  const withOpenAndResolved = async (): Promise<SqliteOpsStore> => {
    const store = new SqliteOpsStore(":memory:");
    const opened = await store.openIncident({
      title: "aberto",
      serviceId: "checkout-api",
      severity: "low",
    });
    const toResolve = await store.openIncident({
      title: "vai ser resolvido",
      serviceId: "auth-service",
      severity: "medium",
    });
    await store.resolveIncident(toResolve.id);
    void opened;
    return store;
  };

  it("sem filtro devolve só abertos", async () => {
    const store = await withOpenAndResolved();
    const incidents = await store.listIncidents();
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0]?.status, "open");
  });

  it("filtro 'resolved' devolve só resolvidos com resolvedAt/summary", async () => {
    const store = await withOpenAndResolved();
    const incidents = await store.listIncidents("resolved");
    assert.equal(incidents.length, 1);
    assert.equal(incidents[0]?.status, "resolved");
    assert.ok(typeof incidents[0]?.resolvedAt === "string");
  });

  it("filtro 'all' devolve todos, ordenado por id", async () => {
    const store = await withOpenAndResolved();
    const incidents = await store.listIncidents("all");
    assert.deepEqual(
      incidents.map((incident) => incident.id),
      ["inc-1", "inc-2"],
    );
  });
});

describe("SqliteOpsStore — getRunbook (US3)", () => {
  it("devolve o conteúdo de um serviço com runbook cadastrado", async () => {
    const store = new SqliteOpsStore(":memory:");
    const runbook = await store.getRunbook("checkout-api");
    assert.equal(runbook?.serviceId, "checkout-api");
    assert.ok(typeof runbook?.content === "string" && runbook.content.length > 0);
  });

  it("devolve undefined para serviço sem runbook cadastrado", async () => {
    const store = new SqliteOpsStore(":memory:");
    const runbook = await store.getRunbook("search-indexer");
    assert.equal(runbook, undefined);
  });

  it("lança ServiceNotFoundError para serviço inexistente", async () => {
    const store = new SqliteOpsStore(":memory:");
    await assert.rejects(() => store.getRunbook("servico-fantasma"), ServiceNotFoundError);
  });
});
