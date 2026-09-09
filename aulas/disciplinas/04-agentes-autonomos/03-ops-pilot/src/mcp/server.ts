import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  asToolResult,
  listAlertsSchema,
  openIncidentSchema,
  resolveIncidentSchema,
} from "../agents/tools.js";
import { MemoryOpsStore } from "../store/memory.js";
import type { OpsStore } from "../store/port.js";

/**
 * Fiação MCP fina sobre as mesmas tools do agente interno: mesmos schemas Zod
 * e mesma tradução de erro de domínio (`asToolResult`), sem redefinir nada.
 */
export function createOpsPilotServer(store: OpsStore): McpServer {
  const server = new McpServer({ name: "opspilot", version: "1.0.0" });

  server.registerTool(
    "list_alerts",
    {
      description:
        "Lista os alertas de monitoramento. Use quando o plantonista perguntar o que está disparando, o estado dos serviços ou 'como está o plantão'. status: firing | resolved | all (padrão: firing).",
      inputSchema: listAlertsSchema.shape,
    },
    async ({ status }) => ({
      content: [
        {
          type: "text",
          text: await asToolResult(async () => ({
            alerts: await store.listAlerts(status === "all" ? undefined : status),
          })),
        },
      ],
    }),
  );

  server.registerTool(
    "open_incident",
    {
      description:
        "Abre um incidente de resposta para um serviço. Use quando um alerta disparando exigir ação de plantão (não use só para registrar leitura de um alerta já resolvido). O serviço informado precisa já estar cadastrado — falha com erro de domínio se não existir. Devolve o id do incidente criado.",
      inputSchema: openIncidentSchema.shape,
    },
    async ({ title, service, severity }) => ({
      content: [
        {
          type: "text",
          text: await asToolResult(async () => {
            const incident = await store.openIncident({ title, serviceId: service, severity });
            return {
              id: incident.id,
              title: incident.title,
              service: incident.serviceId,
              severity: incident.severity,
              status: incident.status,
            };
          }),
        },
      ],
    }),
  );

  server.registerTool(
    "resolve_incident",
    {
      description:
        "Resolve um incidente aberto pelo seu id. Use depois que a causa do incidente foi mitigada. Falha com erro de domínio se o id não existir ou se o incidente já estiver resolvido.",
      inputSchema: resolveIncidentSchema.shape,
    },
    async ({ id }) => ({
      content: [
        {
          type: "text",
          text: await asToolResult(async () => {
            const incident = await store.resolveIncident(id);
            return { id: incident.id, status: incident.status };
          }),
        },
      ],
    }),
  );

  return server;
}

async function main(): Promise<void> {
  const server = createOpsPilotServer(new MemoryOpsStore());
  await server.connect(new StdioServerTransport());
  console.error("opspilot MCP server: pronto (stdio)");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
