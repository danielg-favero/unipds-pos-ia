import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { MemoryOpsStore } from "../store/memory.js";
import type { OpsStore } from "../store/port.js";
import { SqliteMemoryStore } from "../store/sqlite/sqlite-memory-store.js";
import { SqliteOpsStore } from "../store/sqlite/sqlite-ops-store.js";
import { makeCheckProviderStatusTool, makeMemoryTools, makeTools, TOOL_NAMES } from "./tools.js";

type Result = { ok: true; data: unknown } | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const invoke = async (tool: any, input: unknown) =>
  JSON.parse((await tool.invoke(input)) as string) as Result;

const stores: readonly (readonly [string, () => OpsStore])[] = [
  ["MemoryOpsStore", () => new MemoryOpsStore()],
  ["SqliteOpsStore(:memory:)", () => new SqliteOpsStore(":memory:")],
];

for (const [label, makeStore] of stores) {
  describe(`tools sobre ${label}`, () => {
    it("expõe as cinco tools esperadas", () => {
      const tools = makeTools(makeStore());
      assert.deepEqual(
        tools.map((t) => t.name),
        [...TOOL_NAMES],
      );
    });

    it("list_alerts: padrão devolve só firing", async () => {
      const [listAlerts] = makeTools(makeStore());
      const result = await invoke(listAlerts!, {});
      assert.equal(result.ok, true);
      const data = (result as { ok: true; data: { alerts: { status: string }[] } }).data;
      assert.equal(data.alerts.length, 3);
      assert.ok(data.alerts.every((alert) => alert.status === "firing"));
    });

    it("open_incident + resolve_incident: fluxo feliz", async () => {
      const store = makeStore();
      const [, openIncident, resolveIncident] = makeTools(store);
      const opened = await invoke(openIncident!, {
        title: "fila travada",
        service: "checkout-api",
        severity: "high",
      });
      assert.equal(opened.ok, true);
      const id = (opened as { ok: true; data: { id: string } }).data.id;

      const resolved = await invoke(resolveIncident!, { id });
      assert.equal(resolved.ok, true);
      assert.equal((resolved as { ok: true; data: { status: string } }).data.status, "resolved");
    });

    it("open_incident: serviço inexistente vira erro de domínio, não exceção", async () => {
      const [, openIncident] = makeTools(makeStore());
      const result = await invoke(openIncident!, {
        title: "x",
        service: "servico-fantasma",
        severity: "low",
      });
      assert.equal(result.ok, false);
    });

    it("list_incidents: padrão devolve só abertos", async () => {
      const store = makeStore();
      const [, openIncident, , listIncidents] = makeTools(store);
      await invoke(openIncident!, { title: "a", service: "checkout-api", severity: "low" });
      const result = await invoke(listIncidents!, {});
      assert.equal(result.ok, true);
      const data = (result as { ok: true; data: { incidents: { status: string }[] } }).data;
      assert.equal(data.incidents.length, 1);
      assert.equal(data.incidents[0]?.status, "open");
    });

    it("list_incidents: status 'resolved' e 'all'", async () => {
      const store = makeStore();
      const [, openIncident, resolveIncident, listIncidents] = makeTools(store);
      const opened = await invoke(openIncident!, {
        title: "a",
        service: "checkout-api",
        severity: "low",
      });
      const id = (opened as { ok: true; data: { id: string } }).data.id;
      await invoke(resolveIncident!, { id });

      const resolved = await invoke(listIncidents!, { status: "resolved" });
      assert.equal(
        (resolved as { ok: true; data: { incidents: unknown[] } }).data.incidents.length,
        1,
      );

      const all = await invoke(listIncidents!, { status: "all" });
      assert.equal((all as { ok: true; data: { incidents: unknown[] } }).data.incidents.length, 1);
    });

    it("consultar_runbook: serviço com runbook", async () => {
      const [, , , , consultarRunbook] = makeTools(makeStore());
      const result = await invoke(consultarRunbook!, { service: "checkout-api" });
      assert.equal(result.ok, true);
      const data = (result as { ok: true; data: { content: string | null } }).data;
      assert.ok(typeof data.content === "string" && data.content.length > 0);
    });

    it("consultar_runbook: serviço sem runbook devolve content null, não falha", async () => {
      const [, , , , consultarRunbook] = makeTools(makeStore());
      const result = await invoke(consultarRunbook!, { service: "search-indexer" });
      assert.equal(result.ok, true);
      const data = (result as { ok: true; data: { content: string | null } }).data;
      assert.equal(data.content, null);
    });

    it("consultar_runbook: serviço inexistente vira erro de domínio", async () => {
      const [, , , , consultarRunbook] = makeTools(makeStore());
      const result = await invoke(consultarRunbook!, { service: "servico-fantasma" });
      assert.equal(result.ok, false);
    });
  });
}

describe("check_provider_status", () => {
  const okBody = (indicator: string, description: string) => ({
    status: { indicator, description },
  });

  it("github padrão devolve status compacto", async () => {
    const fakeFetch = (async (url: string | URL | Request) => {
      assert.ok(String(url).includes("githubstatus.com"));
      return new Response(JSON.stringify(okBody("none", "All Systems Operational")), {
        status: 200,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const check = makeCheckProviderStatusTool(fakeFetch);
    const result = (await check.invoke({})) as string;
    assert.match(result, /github/);
    assert.match(result, /none/);
    assert.match(result, /All Systems Operational/);
  });

  it("cloudflare explícito consulta a URL certa", async () => {
    const fakeFetch = (async (url: string | URL | Request) => {
      assert.ok(String(url).includes("cloudflarestatus.com"));
      return new Response(JSON.stringify(okBody("minor", "Minor Service Outage")), {
        status: 200,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const check = makeCheckProviderStatusTool(fakeFetch);
    const result = (await check.invoke({ provider: "cloudflare" })) as string;
    assert.match(result, /cloudflare/);
    assert.match(result, /minor/);
    assert.match(result, /Minor Service Outage/);
  });

  it("timeout após retry devolve erro legível, sem lançar exceção", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      throw new DOMException("The operation was aborted", "AbortError");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const check = makeCheckProviderStatusTool(fakeFetch);
    const result = (await check.invoke({})) as string;
    assert.match(result, /github/);
    assert.equal(calls, 2);
  });

  it("5xx na primeira tentativa, sucesso no retry", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      if (calls === 1) return new Response("", { status: 503 });
      return new Response(JSON.stringify(okBody("none", "All Systems Operational")), {
        status: 200,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const check = makeCheckProviderStatusTool(fakeFetch);
    const result = (await check.invoke({})) as string;
    assert.match(result, /All Systems Operational/);
    assert.equal(calls, 2);
  });

  it("resposta inválida devolve erro legível, sem lançar exceção", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ foo: "bar" }), { status: 200 })) as unknown as typeof fetch;

    const check = makeCheckProviderStatusTool(fakeFetch);
    const result = (await check.invoke({})) as string;
    assert.match(result, /github/);
  });

  it("description orienta quando usar", () => {
    const check = makeCheckProviderStatusTool();
    const description = check.description.toLowerCase();
    assert.match(description, /externo/);
    assert.match(description, /nosso.*provedor|provedor.*nosso/);
    assert.match(description, /fora do ar/);
  });
});

describe("forget_preference (009)", () => {
  let store: SqliteMemoryStore;

  before(() => {
    store = new SqliteMemoryStore(":memory:");
  });
  after(() => store.close());

  it("sem nenhum candidato, devolve ok: false e não chama forget", async () => {
    const [forgetPreference] = makeMemoryTools(store, "u1");
    const result = await invoke(forgetPreference!, { description: "algo que nunca foi dito" });
    assert.equal(result.ok, false);
  });

  it("com exatamente um candidato, esquece e confirma o fato removido", async () => {
    await store.remember("u2", "prefiro respostas curtas");
    const [forgetPreference] = makeMemoryTools(store, "u2");

    const result = await invoke(forgetPreference!, { description: "prefiro respostas curtas" });
    assert.equal(result.ok, true);
    assert.equal(
      (result as { ok: true; data: { forgotten: string } }).data.forgotten,
      "prefiro respostas curtas",
    );

    const recalled = await store.recall("u2", "prefiro respostas curtas");
    assert.equal(recalled.length, 0);
  });

  it("com múltiplos candidatos plausíveis, não apaga nada e devolve as opções", async () => {
    await store.remember("u3", "gosto de futebol");
    await store.remember("u3", "meu time é o Flamengo");
    await store.remember("u3", "trabalho como engenheiro de dados");
    const [forgetPreference] = makeMemoryTools(store, "u3");

    const result = await invoke(forgetPreference!, { description: "qual seu time de futebol favorito?" });
    assert.equal(result.ok, true);
    const data = (result as { ok: true; data: { candidates: string[] } }).data;
    assert.ok(data.candidates.length > 1);

    const stillThere = await store.recall("u3", "qual seu time de futebol favorito?", 10);
    assert.equal(stillThere.length, data.candidates.length);
  });

  it("nunca resolve preferência de outro usuário", async () => {
    await store.remember("u4", "fato secreto do u4");
    const [forgetPreference] = makeMemoryTools(store, "u5");

    const result = await invoke(forgetPreference!, { description: "fato secreto do u4" });
    assert.equal(result.ok, false);

    const stillThere = await store.recall("u4", "fato secreto do u4");
    assert.equal(stillThere.length, 1);
  });
});
