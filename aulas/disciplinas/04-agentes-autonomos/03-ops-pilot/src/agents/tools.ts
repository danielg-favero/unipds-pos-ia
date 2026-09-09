import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { errorMessage, isDomainError } from "../domain/errors.js";
import { SEVERITIES } from "../domain/types.js";
import type { OpsStore } from "../store/port.js";

export const listAlertsSchema = z.object({
  status: z
    .enum(["firing", "resolved", "all"])
    .default("firing")
    .describe(
      "Filtro de status do alerta: 'firing' (disparando, padrão), 'resolved' (resolvido) ou 'all' (todos).",
    ),
});

export const openIncidentSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(160)
    .describe("Título curto do incidente (até 160 caracteres), resumindo o problema."),
  service: z
    .string()
    .min(1)
    .describe("Identificador do serviço afetado, já cadastrado (ex.: 'checkout-api')."),
  severity: z
    .enum(SEVERITIES)
    .describe(
      `Severidade do incidente: uma de ${SEVERITIES.join(", ")} (da mais para a menos grave).`,
    ),
});

export const resolveIncidentSchema = z.object({
  id: z.string().min(1).describe("Id do incidente a resolver (ex.: 'inc-3')."),
});

export const listIncidentsSchema = z.object({
  status: z
    .enum(["open", "resolved", "all"])
    .default("open")
    .describe(
      "Filtro de status do incidente: 'open' (abertos, padrão), 'resolved' (resolvidos) ou 'all' (todos).",
    ),
});

export const consultarRunbookSchema = z.object({
  service: z
    .string()
    .min(1)
    .describe(
      "Identificador do serviço cadastrado (ex.: 'checkout-api') cujo runbook será consultado.",
    ),
});

export const checkProviderStatusSchema = z.object({
  provider: z
    .enum(["github", "cloudflare"])
    .default("github")
    .describe(
      "Provedor externo a verificar: 'github' (GitHub, padrão) ou 'cloudflare' (Cloudflare).",
    ),
});

export const TOOL_NAMES = [
  "list_alerts",
  "open_incident",
  "resolve_incident",
  "list_incidents",
  "consultar_runbook",
] as const;

const providerStatusResponseSchema = z.object({
  status: z.object({
    indicator: z.string(),
    description: z.string(),
  }),
});

const PROVIDER_STATUS_URLS = {
  github: "https://www.githubstatus.com/api/v2/status.json",
  cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json",
} as const;

/**
 * Duas tentativas (1 original + 1 retry) em falha de rede ou 5xx; timeout de
 * 5s por tentativa via AbortSignal (regra de resiliência da spec 004).
 */
async function fetchProviderStatus(
  provider: keyof typeof PROVIDER_STATUS_URLS,
  doFetch: typeof fetch,
): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await doFetch(PROVIDER_STATUS_URLS[provider], {
        signal: AbortSignal.timeout(5000),
      });

      if (response.status >= 500) throw new Error(`upstream ${response.status}`);
      if (!response.ok) return `status page de ${provider} respondeu HTTP ${response.status}`;

      const { status } = providerStatusResponseSchema.parse(await response.json());
      return `${provider}: ${status.indicator} — ${status.description}`;
    } catch (error) {
      if (attempt === 2) {
        return `não consegui consultar o status de ${provider} (${(error as Error).message}). Responda com base nos alertas internos e avise o plantonista da limitação.`;
      }
    }
  }
  return "unreachable";
}

/**
 * Erro de domínio vira resultado legível para o modelo, não exceção: o agente
 * enxerga a falha como observação e pode tentar outro caminho dentro do limite
 * de iterações (regra T2).
 */
export const asToolResult = async (run: () => Promise<unknown>): Promise<string> => {
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
 * Constrói as cinco ferramentas de plantão ligadas a um store. Nenhuma delas
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
        "Lista os alertas de monitoramento. Use quando o plantonista perguntar o que está disparando, o estado dos serviços ou 'como está o plantão'. status: firing | resolved | all (padrão: firing).",
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
        "Abre um incidente de resposta para um serviço. Use quando um alerta disparando exigir ação de plantão (não use só para registrar leitura de um alerta já resolvido). O serviço informado precisa já estar cadastrado — falha com erro de domínio se não existir. Devolve o id do incidente criado.",
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
        "Resolve um incidente aberto pelo seu id. Use depois que a causa do incidente foi mitigada. Falha com erro de domínio se o id não existir ou se o incidente já estiver resolvido.",
      schema: resolveIncidentSchema,
    },
  );

  const listIncidents = tool(
    async ({ status }) =>
      asToolResult(async () => ({
        incidents: await store.listIncidents(status),
      })),
    {
      name: "list_incidents",
      description:
        "Lista incidentes registrados. Use quando o plantonista perguntar quais incidentes existem, o histórico do turno, ou pedir para conferir o que já foi aberto/resolvido. status: open | resolved | all (padrão: open).",
      schema: listIncidentsSchema,
    },
  );

  const consultarRunbook = tool(
    async ({ service }) =>
      asToolResult(async () => {
        const runbook = await store.getRunbook(service);
        return { serviceId: service, content: runbook?.content ?? null };
      }),
    {
      name: "consultar_runbook",
      description:
        "Devolve o runbook (passos de resposta recomendados) de um serviço. Use quando o plantonista precisar saber como agir diante de um alerta ou incidente de um serviço específico. O serviço informado precisa já estar cadastrado — falha com erro de domínio se não existir. Se o serviço não tiver runbook cadastrado, devolve conteúdo vazio em vez de falhar.",
      schema: consultarRunbookSchema,
    },
  );

  return [listAlerts, openIncident, resolveIncident, listIncidents, consultarRunbook];
}

export type OpsTools = ReturnType<typeof makeTools>;

/**
 * Tool independente de store: consulta a statuspage pública de um provedor
 * externo. fetchImpl é injetável para testes não baterem na rede real.
 */
export function makeCheckProviderStatusTool(fetchImpl: typeof fetch = fetch) {
  return tool(
    async ({ provider }) => fetchProviderStatus(provider, fetchImpl),
    {
      name: "check_provider_status",
      description:
        "Consulta o status público de um provedor externo (GitHub ou Cloudflare). Use quando houver suspeita de problema externo, para responder 'é o nosso ou do provedor?', ou quando uma dependência parecer fora do ar.",
      schema: checkProviderStatusSchema,
    },
  );
}
