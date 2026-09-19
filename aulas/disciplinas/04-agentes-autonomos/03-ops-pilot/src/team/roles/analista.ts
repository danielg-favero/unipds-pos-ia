import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { toTrace } from "../../agents/from-messages.js";
import { createModel } from "../../agents/model.js";
import { makeTools } from "../../agents/tools.js";
import type { TraceEvent } from "../../domain/strategy.js";
import { blackboardAsText, type BlackboardEntry, type State } from "../state.js";

/** Subconjunto somente-leitura de `makeTools` (017, FR-005). */
export const ANALISTA_TOOL_NAMES = ["list_alerts", "list_incidents", "consultar_runbook"] as const;

const ANALISTA_PROMPT = [
  "Você é o ANALISTA do plantão. Sua única função: produzir diagnóstico FACTUAL do estado atual,",
  "usando as ferramentas de leitura. Liste: alertas disparando (com severidade), incidentes recentes",
  "(abertos e resolvidos), runbooks relevantes e fatos conhecidos do time.",
  "NÃO proponha soluções. NÃO abra nem resolva nada.",
  "FORMATO: tópicos telegráficos. Seja cético: se um dado não está nas observações, não afirme.",
].join(" ");

/** Recursão pequena: o analista faz uma rodada curta de leitura, não uma investigação aberta. */
const ANALISTA_RECURSION_LIMIT = 6;

export async function analistaNode(
  state: State,
): Promise<{ entry: BlackboardEntry; events: readonly TraceEvent[] }> {
  const tools = makeTools(state.input.store).filter((tool) =>
    (ANALISTA_TOOL_NAMES as readonly string[]).includes(tool.name),
  );
  const agent = createReactAgent({
    llm: createModel(),
    tools,
    prompt: ANALISTA_PROMPT,
    version: "v2",
  });

  const instruction = [
    `Pedido do plantonista: ${state.input.request}`,
    `Instrução do supervisor: ${state.pendingBrief}`,
    `Quadro compartilhado até agora:\n${blackboardAsText(state)}`,
  ].join("\n\n");

  const result = await agent.invoke(
    { messages: [{ role: "user", content: instruction }] },
    { recursionLimit: ANALISTA_RECURSION_LIMIT },
  );
  const { events, answer } = toTrace(result.messages.slice(1));

  return {
    entry: { role: "analista", summary: answer },
    events,
  };
}
