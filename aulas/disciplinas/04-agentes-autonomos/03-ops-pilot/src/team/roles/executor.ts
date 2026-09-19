import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { toTrace } from "../../agents/from-messages.js";
import { createModel } from "../../agents/model.js";
import { makeTools } from "../../agents/tools.js";
import type { TraceEvent } from "../../domain/strategy.js";
import { blackboardAsText, type BlackboardEntry, type State } from "../state.js";

/** Subconjunto de ação de `makeTools` (017, FR-007). */
export const EXECUTOR_TOOL_NAMES = ["open_incident", "resolve_incident"] as const;

const EXECUTOR_PROMPT = [
  "Você é o EXECUTOR do plantão. Sua função: agir sobre incidentes com base no plano já produzido",
  "pelo quadro compartilhado (abrir ou resolver incidentes).",
  "Só abra ou resolva um incidente quando o plano já justificar essa ação.",
  "Se uma ação exigir confirmação humana, respeite a resposta da ferramenta — nunca tente contornar.",
  "Relate o que foi feito (ou o que ainda está pendente de confirmação) de forma objetiva.",
].join(" ");

const EXECUTOR_RECURSION_LIMIT = 6;

/**
 * O executor usa exclusivamente `state.input.store` — o mesmo `OpsStore` já
 * protegido por `withApprovalGuardrail` em `src/http/server.ts` para as demais
 * estratégias. Nenhum store alternativo é criado aqui (017, FR-007: sem
 * bypass do guardrail já existente).
 */
export async function executorNode(
  state: State,
): Promise<{ entry: BlackboardEntry; events: readonly TraceEvent[] }> {
  const tools = makeTools(state.input.store).filter((tool) =>
    (EXECUTOR_TOOL_NAMES as readonly string[]).includes(tool.name),
  );
  const agent = createReactAgent({
    llm: createModel(),
    tools,
    prompt: EXECUTOR_PROMPT,
    version: "v2",
  });

  const instruction = [
    `Pedido do plantonista: ${state.input.request}`,
    `Instrução do supervisor: ${state.pendingBrief}`,
    `Quadro compartilhado até agora:\n${blackboardAsText(state)}`,
  ].join("\n\n");

  const result = await agent.invoke(
    { messages: [{ role: "user", content: instruction }] },
    { recursionLimit: EXECUTOR_RECURSION_LIMIT },
  );
  const { events, answer } = toTrace(result.messages.slice(1));

  return {
    entry: { role: "executor", summary: answer },
    events,
  };
}
