import { z } from "zod";

import { createModel } from "../agents/model.js";
import type { MemoryStore } from "./memory-store.js";

export const learningVerdictSchema = z.object({
  hasLearned: z.boolean(),
  fact: z.string().min(1).optional(),
});

export type LearningVerdict = z.infer<typeof learningVerdictSchema>;

export type ReflectLearningInput = {
  readonly request: string;
  readonly answer: string;
  readonly userId: string;
  readonly memoryStore: MemoryStore;
};

/** Nunca lança: falha do modelo/provedor deve virar `{ hasLearned: false }` na chamada real. */
export type LearningReflectorFn = (request: string, answer: string) => Promise<LearningVerdict>;

export const LEARNING_SYSTEM_PROMPT = [
  "Você é o refletor de aprendizado do OpsPilot.",
  "Analise a última mensagem do plantonista (e a resposta que ele recebeu, como contexto) e decida",
  "se ela contém um fato durável sobre o plantonista — uma preferência, característica ou contexto",
  "estável que vale reaproveitar em conversas futuras.",
  "NUNCA trate um pedido de ação pontual (ex.: abrir/resolver um incidente, listar alertas, consultar",
  "um runbook) como fato durável — pedidos pontuais nunca geram fato.",
  "NUNCA extraia senhas, segredos, tokens de acesso ou qualquer informação sensível ou confidencial,",
  "mesmo que o plantonista a mencione junto de um fato durável.",
  "Se a mensagem misturar um pedido pontual com um fato durável, extraia apenas a parte durável.",
  "Se nada qualificar como fato durável e não sensível, devolva hasLearned como false, sem fact.",
].join(" ");

/**
 * Refletor real: uma chamada estruturada (`withStructuredOutput`), mesmo padrão de `critique` em
 * `src/agents/reflection.ts`. Não trata erros — quem embrulha (`reflectLearning`) absorve falhas.
 */
export const defaultLearningReflector: LearningReflectorFn = async (request, answer) => {
  const raw = await createModel()
    .withStructuredOutput(learningVerdictSchema)
    .invoke([
      ["system", LEARNING_SYSTEM_PROMPT],
      ["user", `Mensagem do plantonista: ${request}\nResposta recebida: ${answer}`],
    ]);
  return learningVerdictSchema.parse(raw);
};

/**
 * Orquestra a reflexão de aprendizado sobre uma troca já respondida: nunca lança (FR-006), e só
 * memoriza quando o veredito validado tem `hasLearned: true` e um `fact` não vazio. Pensada para ser
 * chamada sem `await` a partir do `/chat` (fire-and-forget) — ver contracts/learning-reflector.md.
 */
export async function reflectLearning(
  input: ReflectLearningInput,
  reflectorFn: LearningReflectorFn = defaultLearningReflector,
): Promise<void> {
  try {
    const raw = await reflectorFn(input.request, input.answer);
    const verdict = learningVerdictSchema.parse(raw);
    if (verdict.hasLearned && verdict.fact) {
      await input.memoryStore.remember(input.userId, verdict.fact);
    }
  } catch {
    // Falha do provedor, saída malformada ou erro ao memorizar: nada aprendido nesta vez (FR-006/FR-009).
  }
}
