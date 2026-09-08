import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import {
  IncidentAlreadyResolvedError,
  IncidentNotFoundError,
  ServiceNotFoundError,
  ValidationError,
} from "../domain/errors.js";
import { JsonOpsStore, readDatabase, seedDatabase, writeDatabase } from "./json.js";

let dir: string;
let counter = 0;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "ops-json-"));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Cada teste ganha um arquivo próprio, semeado — determinístico e isolado. */
const freshStore = async (): Promise<{ store: JsonOpsStore; path: string }> => {
  const path = join(dir, `db-${(counter += 1)}.json`);
  await writeDatabase(path, seedDatabase());
  return { store: new JsonOpsStore(path), path };
};

describe("JsonOpsStore — leitura do que já existe", () => {
  it("lê os 6 serviços e 6 alertas do arquivo semeado", async () => {
    const { store } = await freshStore();
    assert.equal((await store.listServices()).length, 6);
    assert.equal((await store.listAlerts()).length, 6);
    assert.equal((await store.listAlerts("firing")).length, 3);
    assert.equal((await store.listAlerts("resolved")).length, 3);
  });

  it("devolve alertas em ordem estável por id", async () => {
    const { store } = await freshStore();
    assert.deepEqual(
      (await store.listAlerts()).map((alert) => alert.id),
      ["alert-01", "alert-02", "alert-03", "alert-04", "alert-05", "alert-06"],
    );
  });
});

describe("JsonOpsStore — escrita persiste no arquivo", () => {
  it("grava o incidente aberto em disco", async () => {
    const { store, path } = await freshStore();
    const incident = await store.openIncident({
      title: "5xx no checkout",
      serviceId: "checkout-api",
      severity: "critical",
    });
    assert.equal(incident.id, "inc-1");

    const onDisk = await readDatabase(path);
    assert.equal(onDisk.incidents.length, 1);
    assert.equal(onDisk.incidents[0]?.status, "open");
  });

  it("um novo store enxerga o que o anterior escreveu", async () => {
    const { store, path } = await freshStore();
    await store.openIncident({ title: "a", serviceId: "auth-service", severity: "high" });

    const reopened = new JsonOpsStore(path);
    assert.equal((await reopened.listIncidents()).length, 1);
  });

  it("grava a resolução em disco", async () => {
    const { store, path } = await freshStore();
    const opened = await store.openIncident({
      title: "fila travada",
      serviceId: "payments-worker",
      severity: "high",
    });
    await store.resolveIncident(opened.id);

    const onDisk = await readDatabase(path);
    assert.equal(onDisk.incidents[0]?.status, "resolved");
  });

  it("serializa escritas concorrentes sem perder incidentes", async () => {
    const { store, path } = await freshStore();
    await Promise.all(
      ["a", "b", "c"].map((title) =>
        store.openIncident({ title, serviceId: "checkout-api", severity: "low" }),
      ),
    );

    const onDisk = await readDatabase(path);
    assert.equal(onDisk.incidents.length, 3);
    assert.deepEqual(
      onDisk.incidents.map((incident) => incident.id).toSorted(),
      ["inc-1", "inc-2", "inc-3"],
    );
  });
});

describe("JsonOpsStore — erros de domínio", () => {
  it("rejeita serviço não cadastrado sem escrever", async () => {
    const { store, path } = await freshStore();
    await assert.rejects(
      () => store.openIncident({ title: "x", serviceId: "fantasma", severity: "low" }),
      ServiceNotFoundError,
    );
    assert.equal((await readDatabase(path)).incidents.length, 0);
  });

  it("rejeita incidente inexistente", async () => {
    const { store } = await freshStore();
    await assert.rejects(() => store.resolveIncident("inc-999"), IncidentNotFoundError);
  });

  it("rejeita incidente já resolvido sem alterar o estado", async () => {
    const { store, path } = await freshStore();
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
    assert.equal((await readDatabase(path)).incidents.length, 1);
  });
});

describe("readDatabase — validação de fronteira", () => {
  it("recusa arquivo ausente apontando o comando de seed", async () => {
    await assert.rejects(
      () => readDatabase(join(dir, "nao-existe.json")),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.message, /npm run seed/);
        return true;
      },
    );
  });

  it("recusa JSON malformado", async () => {
    const path = join(dir, "quebrado.json");
    await writeFile(path, "{ nao é json", "utf8");
    await assert.rejects(() => readDatabase(path), ValidationError);
  });

  it("recusa JSON com formato inesperado", async () => {
    const path = join(dir, "formato.json");
    await writeFile(path, JSON.stringify({ services: "nope" }), "utf8");
    await assert.rejects(() => readDatabase(path), ValidationError);
  });

  it("aceita arquivo sem a chave incidents, tratando como lista vazia", async () => {
    const path = join(dir, "sem-incidents.json");
    const { incidents: _ignored, ...rest } = seedDatabase();
    await writeFile(path, JSON.stringify(rest), "utf8");
    assert.deepEqual((await readDatabase(path)).incidents, []);
  });
});
