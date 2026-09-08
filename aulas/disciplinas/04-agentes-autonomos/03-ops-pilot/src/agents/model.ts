import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

import { ConfigError } from "../domain/errors.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const EnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1),
});

/**
 * Ponto único de configuração do modelo. A leitura do ambiente acontece na
 * chamada, nunca no import, para que os testes possam importar este módulo sem
 * credenciais. A mensagem de erro cita o nome da variável, jamais seu valor.
 */
export function createModel(): ChatOpenAI {
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

  return new ChatOpenAI({
    model: parsed.data.OPENROUTER_MODEL,
    apiKey: parsed.data.OPENROUTER_API_KEY,
    temperature: 0,
    configuration: { baseURL: OPENROUTER_BASE_URL },
  });
}
