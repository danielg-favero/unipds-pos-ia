import { errorMessage } from "../domain/errors.js";

/**
 * O SDK da OpenAI quebra ao parsear respostas de erro do OpenRouter que vêm sem
 * `choices` — um 429 de quota chega como `Cannot read properties of undefined
 * (reading 'map')` ou como `Failed to parse. Text: ""`. Traduzir esses sintomas
 * de volta para a causa evita horas caçando um bug que não existe no código.
 */
export function describeProviderError(error: unknown): string {
  const message = errorMessage(error);
  const status = (error as { status?: number } | null)?.status;

  if (status === 429 || /rate limit|free-models-per-day/i.test(message)) {
    return "OpenRouter recusou a chamada por limite de uso (429). Verifique a cota do modelo em OPENROUTER_MODEL.";
  }

  if (status === 401 || status === 403) {
    return "OpenRouter recusou a credencial. Confira OPENROUTER_API_KEY.";
  }

  // Sintomas de uma resposta de erro que o SDK não conseguiu parsear.
  if (
    /Cannot read properties of undefined \(reading 'map'\)/.test(message) ||
    /Failed to parse\. Text: ""/.test(message)
  ) {
    return "O provedor devolveu uma resposta vazia ou de erro que não pôde ser interpretada — geralmente limite de uso ou modelo indisponível. Confira a cota e o valor de OPENROUTER_MODEL.";
  }

  return message;
}
