# Contract: `src/context/context-builder.ts`

Interface pública consumida por `src/agents/react.ts` e `src/agents/plan-and-execute.ts` (e por testes). É um contrato interno (módulo TypeScript dentro do monorepo), não uma API HTTP.

## Exports

```ts
export const DEFAULT_CONTEXT_BUDGET: ContextBudget; // { summary: 200, history: 1200, memory: 300 }

export function readBudgetFromEnv(env?: NodeJS.ProcessEnv): ContextBudget;

export function buildPromptSections(input: PromptBuildInput): PromptSections;
```

Tipos (`ContextBudget`, `PromptBuildInput`, `ScoredMemory`, `PromptSections`) conforme `data-model.md`.

### `readBudgetFromEnv`

- **Pre**: nenhuma (aceita `env` ausente).
- **Post**: retorna `ContextBudget` completo; cada campo é o valor de `CONTEXT_BUDGET_SUMMARY`/`_HISTORY`/`_MEMORY` em `env` se for um inteiro `>= 0`, senão o default correspondente.
- **Nunca lança.**

### `buildPromptSections`

- **Pre**: `input.budget` opcional — se omitido, usa `readBudgetFromEnv()`.
- **Post**:
  - `output.systemPrompt === input.systemPrompt` e `output.request === input.request` sempre (FR-002).
  - `estimateTokens(output.historySummary ?? "") <= input.budget.summary` (ou `.summary`, se `budget` foi passado explicitamente).
  - soma de `estimateTokens(m.content)` para `m` em `output.history` `<= budget.history`.
  - soma de `estimateTokens(m.fact)` para `m` em `output.memories` `<= budget.memory`.
  - `output.history` é um sufixo contíguo de `input.history` (mensagens mais recentes), na mesma ordem relativa.
  - `output.memories` é o subconjunto de `input.memories` com os maiores scores que cabem no teto, em ordem decrescente de score.
- **Nunca lança** — qualquer entrada (incluindo arrays vazios, `budget` zerado) produz uma saída válida.

## Consumo pelas estratégias (mudança de comportamento observável)

- `react.ts`: `initialMessages` passa a ser derivado de `buildPromptSections(...)` em vez de usar `history`/`memories`/`historySummary` brutos sem teto. O formato de cada mensagem (`{ role, content }`) não muda.
- `plan-and-execute.ts`: `memoryBlock`/`historyBlock`/`contextBlock` passam a ser formatados a partir do `PromptSections` retornado, em vez de `input.memories`/`input.history` brutos.
- `buildContextBreakdown` (métricas, feature 010) continua recebendo os dados **originais** (`input.history`, `input.memories`, não os cortados) — o orçamento de prompt (novo) e o breakdown de métricas (existente) medem coisas diferentes: um mede o que foi *enviado* ao provedor após corte, o outro mede o que estava *disponível* antes do corte. Ver nota em `quickstart.md`.
