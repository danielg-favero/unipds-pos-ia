import type { StrategyRun } from "../domain/strategy.js";
import type { Incident } from "../domain/types.js";

export const SCENARIO_IDS = ["c1", "c2", "c3"] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export type BenchScenario = {
  readonly id: ScenarioId;
  readonly label: string;
  readonly request: string;
  /**
   * Acerto verificado no ESTADO do store após a execução — nunca no texto da
   * resposta. Recebe os incidentes na ordem em que foram criados e o
   * `StrategyRun` completo, para distinguir "nenhum incidente porque a
   * estratégia concluiu sem precisar de um" de "nenhum incidente porque a
   * execução falhou antes de fazer qualquer coisa" (ver `concluded`).
   */
  readonly check: (incidents: readonly Incident[], run: StrategyRun) => boolean;
};

/**
 * A execução terminou de verdade, não por estouro de limite, erro do
 * provedor (ex.: cota do OpenRouter) ou qualquer outro corte precoce. Toda
 * `StrategyRun` termina em `answer`; `partial: true` é como o contrato sinaliza
 * "não confie neste resultado como se fosse a resposta completa".
 */
export const concluded = (run: StrategyRun): boolean => {
  const last = run.trace.at(-1);
  return last?.type === "answer" && !last.partial;
};

/** C2: a ordem pedida no cenário — checkout, payment, catalog. */
const C2_SERVICE_ORDER = ["checkout-api", "payments-worker", "catalog-service"] as const;

export const SCENARIOS: readonly BenchScenario[] = [
  {
    id: "c1",
    label: "direto",
    request: "quantos alertas críticos estão disparando?",
    // Pergunta somente-leitura: acertar é concluir a execução (não falhar por
    // cota/limite) SEM abrir ou alterar nenhum incidente — o teste é se a
    // estratégia resiste a agir sobre um pedido que só pede uma contagem.
    // `concluded` evita o falso positivo de uma execução que erra cedo (ex.:
    // 429) e "acerta" só porque não deu tempo de fazer nada.
    check: (incidents, run) => concluded(run) && incidents.length === 0,
  },
  {
    id: "c2",
    label: "estruturado",
    request:
      "abra 3 incidentes sev2 para checkout, payment e catalog, nessa mesma ordem, e resolva o primeiro.",
    // sev2 = "high": convenção sev1..sev4 == critical..low, a mesma ordem do
    // enum de severidade do domínio (ver src/domain/types.ts:severityRank).
    check: (incidents, run) =>
      concluded(run) &&
      incidents.length === 3 &&
      incidents.every((incident) => incident.severity === "high") &&
      incidents.every((incident, index) => incident.serviceId === C2_SERVICE_ORDER[index]) &&
      incidents[0]?.status === "resolved" &&
      incidents[1]?.status === "open" &&
      incidents[2]?.status === "open",
  },
  {
    id: "c3",
    label: "dinâmico",
    request: "dos alertas disparando, abra um incidente para o mais antigo e diga quantos sobraram",
    // "mais antigo" = menor id entre os firing (alert-01, checkout-api,
    // critical) — os ids do seed são sequenciais na ordem de criação, então
    // o menor id é o mais antigo. A severidade correta do incidente é a do
    // próprio alerta, não uma severidade inventada.
    check: (incidents, run) =>
      concluded(run) &&
      incidents.length === 1 &&
      incidents[0]?.serviceId === "checkout-api" &&
      incidents[0]?.severity === "critical" &&
      incidents[0]?.status === "open",
  },
];
