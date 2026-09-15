# Contract: `src/context/tokens.ts`

```ts
function estimateTokens(text: string): number;
function extractPromptTokens(output: LLMResult): number | undefined;
```

## `estimateTokens(text)`

- Retorna `Math.ceil(text.length / 4)`.
- `""` retorna `0`.
- Função pura, determinística, sem I/O.

## `extractPromptTokens(output)`

- Percorre `output.generations` (lista de listas de `Generation`); para cada `ChatGeneration` (tem
  `.message`), lê `message.usage_metadata?.input_tokens`.
- Soma todos os valores encontrados.
- Se nenhuma generation tiver `usage_metadata`, retorna `undefined` (não `0`).

---

# Contract: `RunTracker` (`src/agents/metrics.ts`, estendido)

```ts
class RunTracker {
  constructor(historyMessages?: number);
  readonly counter: CallCounter; // callback a passar em config.callbacks

  /** Soma o uso real de uma chamada concluída — chamado via callback handleLLMEnd. */
  // (implementação interna; não é uma API pública nova além de counter/snapshot)

  snapshot(contextBreakdown: ContextBreakdown): RunMetrics;
}
```

- `snapshot` passa a exigir `contextBreakdown` (cada estratégia já o calcula antes de finalizar a
  execução) e inclui `promptTokensReal` acumulado internamente pelo `counter`/tracker desde a
  construção — `undefined` se nenhuma chamada reportou uso real.
- Comportamento de `llmCalls`/`latencyMs`/`historyMessages` não muda.

---

# Contract: `POST /chat` (resposta, campo `metrics` estendido)

Nenhuma mudança no corpo da requisição. O campo `metrics` da resposta (já existente) ganha dois
campos novos:

```jsonc
{
  "answer": "...",
  "trace": [...],
  "metrics": {
    "llmCalls": 2,
    "latencyMs": 1200,
    "historyMessages": 4,
    "promptTokensReal": 850,       // ausente (campo não aparece) se o provedor não reportou
    "contextBreakdown": {
      "history": 120,
      "memories": 30,
      "systemPrompt": 90,
      "request": 15
    }
  },
  "conversation": "..."
}
```

- `contextBreakdown` está sempre presente.
- `promptTokensReal` está ausente do JSON (não `null`) quando nenhuma chamada da interação reportou
  uso real (FR-005) — consistente com `JSON.stringify` omitindo chaves com valor `undefined`.
