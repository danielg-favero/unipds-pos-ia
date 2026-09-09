import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { makeTools } from "../agents/tools.js";
import { MemoryOpsStore } from "../store/memory.js";
import { createOpsPilotServer } from "./server.js";

type Result = { ok: true; data: unknown } | { ok: false; error: string };

async function connectedClient(store: MemoryOpsStore) {
  const server = createOpsPilotServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<Result> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return JSON.parse(content[0]!.text) as Result;
}

describe("opspilot MCP server", () => {
  it("expõe exatamente list_alerts, open_incident e resolve_incident", async () => {
    const client = await connectedClient(new MemoryOpsStore());
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).toSorted(),
      ["list_alerts", "open_incident", "resolve_incident"].toSorted(),
    );
  });

  it("list_alerts: sem filtro devolve só firing; 'all' devolve todos", async () => {
    const client = await connectedClient(new MemoryOpsStore());

    const firing = await callTool(client, "list_alerts", {});
    assert.equal(firing.ok, true);
    const firingAlerts = (firing as { ok: true; data: { alerts: { status: string }[] } }).data
      .alerts;
    assert.ok(firingAlerts.length > 0);
    assert.ok(firingAlerts.every((a) => a.status === "firing"));

    const all = await callTool(client, "list_alerts", { status: "all" });
    assert.equal(all.ok, true);
    const allAlerts = (all as { ok: true; data: { alerts: unknown[] } }).data.alerts;
    assert.ok(allAlerts.length >= firingAlerts.length);
  });

  it("list_alerts: filtro inválido é rejeitado pela validação de schema", async () => {
    const client = await connectedClient(new MemoryOpsStore());
    const result = await client.callTool({ name: "list_alerts", arguments: { status: "bogus" } });
    assert.equal(result.isError, true);
  });

  it("open_incident + resolve_incident: fluxo feliz", async () => {
    const client = await connectedClient(new MemoryOpsStore());

    const opened = await callTool(client, "open_incident", {
      title: "fila travada",
      service: "checkout-api",
      severity: "high",
    });
    assert.equal(opened.ok, true);
    const id = (opened as { ok: true; data: { id: string } }).data.id;

    const resolved = await callTool(client, "resolve_incident", { id });
    assert.equal(resolved.ok, true);
    assert.equal((resolved as { ok: true; data: { status: string } }).data.status, "resolved");
  });

  it("open_incident/resolve_incident: erros de domínio voltam como ok:false, não exceção", async () => {
    const client = await connectedClient(new MemoryOpsStore());

    const openedOnMissingService = await callTool(client, "open_incident", {
      title: "x",
      service: "servico-fantasma",
      severity: "low",
    });
    assert.equal(openedOnMissingService.ok, false);

    const resolvedMissing = await callTool(client, "resolve_incident", { id: "inc-inexistente" });
    assert.equal(resolvedMissing.ok, false);
  });

  it("open_incident: entrada inválida é rejeitada pela validação de schema", async () => {
    const client = await connectedClient(new MemoryOpsStore());
    const emptyTitle = await client.callTool({
      name: "open_incident",
      arguments: { title: "", service: "checkout-api", severity: "high" },
    });
    assert.equal(emptyTitle.isError, true);

    const badSeverity = await client.callTool({
      name: "open_incident",
      arguments: { title: "x", service: "checkout-api", severity: "catastrophic" },
    });
    assert.equal(badSeverity.isError, true);
  });

  it("MCP e LangChain produzem o mesmo resultado para a mesma entrada e estado", async () => {
    const store = new MemoryOpsStore();
    const client = await connectedClient(store);
    const [, openIncidentTool] = makeTools(store);

    const input = { title: "consistência", service: "checkout-api", severity: "medium" as const };
    const viaMcp = await callTool(client, "open_incident", input);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const viaLangChain = JSON.parse(
      (await (openIncidentTool as any).invoke(input)) as string,
    ) as Result;

    assert.equal(viaMcp.ok, true);
    assert.equal(viaLangChain.ok, true);
    const mcpData = (viaMcp as { ok: true; data: Record<string, unknown> }).data;
    const langChainData = (viaLangChain as { ok: true; data: Record<string, unknown> }).data;
    assert.deepEqual(
      { ...mcpData, id: undefined },
      { ...langChainData, id: undefined },
    );
  });
});
