import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { ConfigError } from "../domain/errors.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Tentativas no MESMO modelo antes de considerá-lo esgotado (014, FR-002). Pequeno de propósito: não mascarar por muito tempo um erro de configuração (ex.: 429/401). */
export const RETRY_ATTEMPTS = 2;

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1),
});

export type ModelPlan = {
  readonly apiKey: string;
  readonly primaryModel: string;
  /** `undefined` quando `OPENROUTER_MODEL_FALLBACK` não está definido (014, FR-008) — não é erro de configuração. */
  readonly fallbackModel: string | undefined;
};

/**
 * Lê e valida a configuração do OpenRouter. A leitura do ambiente acontece na
 * chamada, nunca no import, para que os testes possam importar este módulo sem
 * credenciais. A mensagem de erro cita o nome da variável, jamais seu valor.
 */
export function getModelPlan(): ModelPlan {
  const parsed = EnvSchema.safeParse({
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  });

  if (!parsed.success) {
    // Reporta o NOME da variável, nunca o valor.
    const missing = [
      ...new Set(parsed.error.issues.map((issue) => String(issue.path[0]))),
    ].join(", ");
    throw new ConfigError(
      `Configuração do OpenRouter inválida: defina ${missing} no ambiente.`,
    );
  }

  const fallbackRaw = process.env.OPENROUTER_MODEL_FALLBACK;
  const fallbackModel = fallbackRaw !== undefined && fallbackRaw.length > 0 ? fallbackRaw : undefined;

  return {
    apiKey: parsed.data.OPENROUTER_API_KEY,
    primaryModel: parsed.data.OPENROUTER_MODEL,
    fallbackModel,
  };
}

/** Constrói um `ChatOpenAI` para um nome de modelo específico, com as credenciais já validadas. */
export function createModelNamed(model: string, apiKey: string): ChatOpenAI {
  return new ChatOpenAI({
    model,
    apiKey,
    temperature: 0,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });
}

/**
 * Ponto único de configuração do modelo primário, sem retry/fallback — usado
 * pelos consumidores de saída estruturada em tarefas de apoio (crítico,
 * roteador, resumo de histórico, aprendizado), fora do escopo de resiliência
 * de 014 (ver research.md R5).
 */
export function createModel(): ChatOpenAI {
  const { apiKey, primaryModel } = getModelPlan();
  return createModelNamed(primaryModel, apiKey);
}

async function retryAsync<T>(run: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export type ResilienceOutcome<T> = {
  readonly result: T;
  /** Modelo que efetivamente produziu `result` (014, FR-005). */
  readonly modelUsed: string;
  /** `true` se o primário se esgotou e a reserva assumiu (014, FR-004). */
  readonly usedFallback: boolean;
};

/**
 * Executa `run(modelo)` com retry no modelo primário e, se
 * `OPENROUTER_MODEL_FALLBACK` estiver configurado e o primário se esgotar,
 * retry no modelo de reserva (014, US1/US2). Se ambos se esgotarem, o erro do
 * último candidato é propagado ao chamador (US3) — nunca há retry infinito.
 *
 * Recebe `run` (em vez de um `Runnable` já pronto) porque consumidores como
 * `react.ts` precisam reconstruir todo o agente (com tools) por tentativa —
 * `createReactAgent` exige um `ChatOpenAI` "de verdade" (com `bindTools`), que
 * um `Runnable` composto por `.withFallbacks()` deixa de expor.
 */
export async function withModelResilience<T>(
  plan: Pick<ModelPlan, "primaryModel" | "fallbackModel">,
  run: (model: string) => Promise<T>,
): Promise<ResilienceOutcome<T>> {
  try {
    const result = await retryAsync(() => run(plan.primaryModel), RETRY_ATTEMPTS);
    return { result, modelUsed: plan.primaryModel, usedFallback: false };
  } catch (primaryError) {
    if (plan.fallbackModel === undefined) throw primaryError;
    const result = await retryAsync(() => run(plan.fallbackModel!), RETRY_ATTEMPTS);
    return { result, modelUsed: plan.fallbackModel, usedFallback: true };
  }
}
