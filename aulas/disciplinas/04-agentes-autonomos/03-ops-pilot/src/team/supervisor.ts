import { z } from "zod";

import { createModel } from "../agents/model.js";
import { TEAM_ROLES, blackboardAsText, type State, type SupervisorDecision } from "./state.js";

export const nextSchema = z.object({
  next: z.enum([...TEAM_ROLES, "done"]),
  brief: z
    .string()
    .min(1)
    .describe("instrução de trabalho para o próximo papel (nó) ou resumo final se done"),
});

const SUPERVISOR_PROMPT = [
  "Você é o supervisor da equipe de plantão do OpsPilot.",
  "Papéis disponíveis:",
  "- analista: só leitura, investiga e relata fatos observáveis; nunca propõe nem executa ações.",
  "- planejador: sem nenhuma ferramenta; organiza um plano de ação com base só no que já está no quadro.",
  "- executor: age sobre incidentes (abrir/resolver), sempre sujeito à confirmação humana existente.",
  "A cada passo, escolha o próximo papel com base no que já foi produzido no quadro compartilhado.",
  'Se o quadro já contém o suficiente para responder ao plantonista, escolha "done" e resuma a resposta final em `brief`.',
  "Nunca escolha um papel que já respondeu tudo que era necessário só para repetir o mesmo trabalho.",
].join("\n");

/** Função de decisão do supervisor, injetável para testes determinísticos sem rede. */
export type SupervisorFn = (state: State) => Promise<SupervisorDecision>;

export const defaultSupervisorFn: SupervisorFn = async (state) => {
  const raw = await createModel()
    .withStructuredOutput(nextSchema)
    .invoke([
      ["system", SUPERVISOR_PROMPT],
      [
        "user",
        `Pedido do plantonista: ${state.input.request}\n\nQuadro compartilhado até agora:\n${blackboardAsText(state)}`,
      ],
    ]);
  return nextSchema.parse(raw);
};

/**
 * Fallback determinístico quando a decisão do supervisor falha (saída
 * malformada ou erro do provedor) — nunca deixa a requisição travar
 * (research.md Decisão 4). Nunca escolhe "executor" por segurança: o papel
 * padrão sem risco é "analista", ou encerrar se já há algo no quadro.
 */
export function fallbackDecision(state: State): SupervisorDecision {
  if (state.blackboard.length > 0) {
    return {
      next: "done",
      brief: "fallback: decisão do supervisor malformada; encerrando com o que já foi produzido",
    };
  }
  return {
    next: "analista",
    brief: "fallback: decisão do supervisor malformada; iniciando pela investigação de leitura",
  };
}

export async function decideNext(
  state: State,
  supervisorFn: SupervisorFn = defaultSupervisorFn,
): Promise<SupervisorDecision> {
  try {
    return await supervisorFn(state);
  } catch {
    return fallbackDecision(state);
  }
}
