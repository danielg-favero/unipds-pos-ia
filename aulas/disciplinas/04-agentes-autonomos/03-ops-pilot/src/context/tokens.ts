import type { LLMResult } from "@langchain/core/outputs";

import type { ConversationMessage } from "../store/conversation-port.js";

export type ContextBreakdown = {
  readonly history: number;
  readonly memories: number;
  readonly systemPrompt: number;
  readonly request: number;
};

/**
 * Soma `usage_metadata.input_tokens` de todas as `ChatGeneration` de um `LLMResult` — o campo
 * padronizado do LangChain para uso real reportado pelo provedor (ver research.md §1). `undefined`
 * quando nenhuma generation reporta uso, nunca `0` (FR-005).
 */
export function extractPromptTokens(output: LLMResult): number | undefined {
  let total = 0;
  let seen = false;

  for (const generations of output.generations) {
    for (const generation of generations) {
      const inputTokens =
        "message" in generation
          ? (generation.message as { usage_metadata?: { input_tokens?: number } }).usage_metadata
              ?.input_tokens
          : undefined;
      if (inputTokens !== undefined) {
        total += inputTokens;
        seen = true;
      }
    }
  }

  return seen ? total : undefined;
}

/** Heurística determinística e barata, sem tokenizador (research.md §3). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export type ContextBreakdownInput = {
  readonly history: readonly ConversationMessage[];
  readonly memories: readonly string[];
  readonly systemPrompt: string;
  readonly request: string;
};

/**
 * Composição estimada do contexto por fonte (010, FR-003/FR-004). Fontes vazias contribuem com `0`,
 * nunca lançam.
 */
export function buildContextBreakdown(input: ContextBreakdownInput): ContextBreakdown {
  const sum = (texts: readonly string[]): number =>
    texts.reduce((total, text) => total + estimateTokens(text), 0);

  return {
    history: sum(input.history.map((message) => message.content)),
    memories: sum(input.memories),
    systemPrompt: estimateTokens(input.systemPrompt),
    request: estimateTokens(input.request),
  };
}
