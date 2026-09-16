/**
 * Preços aproximados de USD por 1K tokens de prompt, só para os modelos mais
 * usados via OpenRouter neste projeto. Não é uma tabela oficial/atualizada —
 * serve como estimativa de custo para `GET /stats`. Modelo ausente daqui, ou
 * terminado em `:free`, custa 0 (mesmo padrão do OpenRouter para tiers grátis).
 */
const PRICE_PER_1K_PROMPT_TOKENS_USD: Readonly<Record<string, number>> = {
  "openai/gpt-4o": 0.0025,
  "openai/gpt-4o-mini": 0.00015,
  "anthropic/claude-3.5-sonnet": 0.003,
  "anthropic/claude-3-haiku": 0.00025,
  "google/gemini-flash-1.5": 0.000075,
};

const isFreeTier = (model: string): boolean => model.endsWith(":free");

/** Estimativa de custo a partir dos tokens de prompt reportados (sem tokens de completion, não rastreados hoje). */
export const estimateCostUsd = (
  model: string | undefined,
  promptTokens: number | undefined,
): number => {
  if (model === undefined || promptTokens === undefined) return 0;
  if (isFreeTier(model)) return 0;
  const pricePerK = PRICE_PER_1K_PROMPT_TOKENS_USD[model] ?? 0;
  return (promptTokens / 1000) * pricePerK;
};
