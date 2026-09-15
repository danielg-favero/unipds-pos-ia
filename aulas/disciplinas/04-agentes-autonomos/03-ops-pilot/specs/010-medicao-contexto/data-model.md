# Data Model: Medição de Consumo de Contexto

Nenhuma tabela nova — esta feature só estende tipos em memória, retornados na resposta do `/chat`.

## Tipos TypeScript

```ts
// src/context/tokens.ts
export type ContextBreakdown = {
  readonly history: number;
  readonly memories: number;
  readonly systemPrompt: number;
  readonly request: number;
};

/** Math.ceil(text.length / 4) — heurística determinística, sem tokenizador. */
export function estimateTokens(text: string): number;

/** Soma usage_metadata.input_tokens de todas as ChatGeneration de um LLMResult; undefined se nenhuma reportar uso. */
export function extractPromptTokens(output: LLMResult): number | undefined;
```

```ts
// src/domain/strategy.ts (RunMetrics estendido)
export type RunMetrics = {
  readonly llmCalls: number;
  readonly latencyMs: number;
  readonly historyMessages: number;
  /** Soma do uso real de tokens de prompt de todas as chamadas da interação; ausente se o provedor nunca reportou (FR-005). */
  readonly promptTokensReal?: number;
  /** Estimativa por fonte (chars/4); sempre presente, mesmo com fontes vazias (FR-004). */
  readonly contextBreakdown: ContextBreakdown;
};
```

## Invariantes

- `contextBreakdown` está sempre presente em todo `RunMetrics` — nunca `undefined`/ausente (FR-003,
  FR-004). Fontes sem conteúdo contribuem com `0`, nunca com erro.
- `promptTokensReal`, quando presente, é a soma do uso real de **todas** as chamadas ao modelo dentro
  da mesma interação do `/chat` (FR-002) — incluindo, em `reflect:<strategy>`, as chamadas da base e
  do crítico.
- `promptTokensReal` é `undefined` se e somente se nenhuma chamada da interação reportou
  `usage_metadata` (FR-005) — nunca `0` nesse caso.
- A soma das quatro fontes de `contextBreakdown` é uma aproximação do prompt total enviado ao modelo,
  não uma reconciliação exata de `promptTokensReal` (spec Edge Cases) — os dois números podem
  divergir, e isso é esperado.
