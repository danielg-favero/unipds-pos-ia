import { createModel } from "../../agents/model.js";
import type { TraceEvent } from "../../domain/strategy.js";
import { blackboardAsText, type BlackboardEntry, type State } from "../state.js";

const PLANEJADOR_PROMPT = [
  "Você é o PLANEJADOR do plantão. Você NÃO tem acesso a nenhuma ferramenta.",
  "Com base só no que já está no quadro compartilhado, organize um plano de ação objetivo,",
  "em passos numerados. Não invente fatos que não estejam no quadro.",
  "Se o quadro ainda não tem informação suficiente para planejar, diga isso explicitamente",
  "em vez de supor dados.",
].join(" ");

/**
 * O planejador nunca recebe ferramentas (017, FR-006) — só o modelo, sem
 * `createReactAgent`/`bindTools`, para que a ausência de ferramentas seja
 * estrutural e não apenas convencional.
 */
export async function planejadorNode(
  state: State,
): Promise<{ entry: BlackboardEntry; events: readonly TraceEvent[] }> {
  const response = await createModel().invoke([
    ["system", PLANEJADOR_PROMPT],
    [
      "user",
      [
        `Pedido do plantonista: ${state.input.request}`,
        `Instrução do supervisor: ${state.pendingBrief}`,
        `Quadro compartilhado até agora:\n${blackboardAsText(state)}`,
      ].join("\n\n"),
    ],
  ]);

  const text = response.text.trim();

  return {
    entry: { role: "planejador", summary: text },
    events: [{ type: "thought", text }],
  };
}
