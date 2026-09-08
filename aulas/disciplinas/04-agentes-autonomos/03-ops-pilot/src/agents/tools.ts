import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { errorMessage, isDomainError } from "../domain/errors.js";
import { SEVERITIES } from "../domain/types.js";
import type { OpsStore } from "../store/port.js";

export const listAlertsSchema = z.object({
  status: z.enum(["firing", "resolved", "all"]).default("firing"),
});

export const openIncidentSchema = z.object({
  title: z.string().min(1).max(160),
  service: z.string().min(1),
  severity: z.enum(SEVERITIES),
});

export const resolveIncidentSchema = z.object({
  id: z.string().min(1),
});

export const TOOL_NAMES = ["list_alerts", "open_incident", "resolve_incident"] as const;

/**
 * Erro de domínio vira resultado legível para o modelo, não exceção: o agente
 * enxerga a falha como observação e pode tentar outro caminho dentro do limite
 * de iterações (regra T2).
 */
const asToolResult = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    return JSON.stringify({ ok: true, data: await run() });
  } catch (error) {
    if (isDomainError(error)) {
      return JSON.stringify({ ok: false, error: errorMessage(error) });
    }
    throw error;
  }
};

/**
 * Constrói as três ferramentas de plantão ligadas a um store. Nenhuma delas
 * captura estado global — o store entra por injeção (regra T5).
 */
export function makeTools(store: OpsStore) {
  const listAlerts = tool(
    async ({ status }) =>
      asToolResult(async () => ({
        alerts: await store.listAlerts(status === "all" ? undefined : status),
      })),
    {
      name: "list_alerts",
      description:
        "Lista os alertas de monitoramento. Use quando o plantonista perguntar o que está disparando, o estado dos serviços ou 'como está o plantão'. status: firing | resolved | all",
      schema: listAlertsSchema,
    },
  );

  const openIncident = tool(
    async ({ title, service, severity }) =>
      asToolResult(async () => {
        const incident = await store.openIncident({
          title,
          serviceId: service,
          severity,
        });
        return {
          id: incident.id,
          title: incident.title,
          service: incident.serviceId,
          severity: incident.severity,
          status: incident.status,
        };
      }),
    {
      name: "open_incident",
      description:
        "Abre um incidente para um serviço. Use quando um alerta exigir ação de plantão. O serviço precisa estar cadastrado; devolve o id do incidente criado.",
      schema: openIncidentSchema,
    },
  );

  const resolveIncident = tool(
    async ({ id }) =>
      asToolResult(async () => {
        const incident = await store.resolveIncident(id);
        return { id: incident.id, status: incident.status };
      }),
    {
      name: "resolve_incident",
      description:
        "Resolve um incidente aberto pelo seu id. Falha se o id não existir ou se o incidente já estiver resolvido.",
      schema: resolveIncidentSchema,
    },
  );

  return [listAlerts, openIncident, resolveIncident];
}

export type OpsTools = ReturnType<typeof makeTools>;
