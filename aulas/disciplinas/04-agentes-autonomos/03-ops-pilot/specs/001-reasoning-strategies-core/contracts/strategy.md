# Contrato: ReasoningStrategy

**Módulo**: `src/domain/strategy.ts` (tipos) — implementações em `src/agents/`.

Origem: FR-001 a FR-007, FR-024.

## Tipos

```ts
export type Severity = "critical" | "high" | "medium" | "low";

export type TraceEvent =
  | { type: "thought"; text: string }
  | { type: "plan"; steps: string[] }
  | { type: "action"; tool: string; args: Record<string, unknown>; callId?: string }
  | { type: "observation"; callId?: string; ok: boolean; result?: unknown; error?: string }
  | { type: "critique"; text: string }
  | { type: "answer"; text: string; partial: boolean };

export type RunMetrics = { llmCalls: number; latencyMs: number };

export type StrategyInput = {
  request: string;
  maxIterations: number;
  store: OpsStore;
};

export type StrategyRun = {
  answer: string;
  trace: readonly TraceEvent[];
  metrics: RunMetrics;
};

export interface ReasoningStrategy {
  readonly name: string;
  run(input: StrategyInput): Promise<StrategyRun>;
}
```

## Obrigações de toda implementação

| # | Obrigação | Requisito |
|---|-----------|-----------|
| S1 | `name` é estável, em kebab-case, único no catálogo | FR-001, FR-028 |
| S2 | `run` nunca rejeita por erro de domínio ou por limite atingido: converte em `answer` com `partial: true` e devolve trace + métricas | FR-005, SC-002 |
| S3 | O último evento do trace é sempre `answer`, e `answer.text` é idêntico a `StrategyRun.answer` | FR-002 |
| S4 | Todo `action` é seguido, antes do próximo `action`, pela sua `observation` | FR-003 |
| S5 | `metrics.llmCalls` reflete toda chamada ao chat model da execução, inclusive as interrompidas | FR-006 |
| S6 | `metrics.latencyMs` é medido de ponta a ponta de `run` | FR-004 |
| S7 | Nenhuma iteração além de `maxIterations`; Plan-and-Execute nunca passa de 8 passos executados | FR-005, FR-023, SC-003 |
| S8 | `run` só toca o estado através de `input.store`; nenhuma leitura de `process.env` fora da fábrica de modelo | FR-008, FR-017 |
| S9 | Nenhum evento do trace contém o valor de `OPENROUTER_API_KEY` | FR-011 |

## Formatação de trace

**Módulo**: `src/domain/trace.ts` — função pura `formatTrace(trace: readonly TraceEvent[]): string`.

- Um bloco por evento, na ordem do array, separados por `\n`.
- Prefixos fixos: `[thought]`, `[plan]`, `[action]`, `[observation]`, `[critique]`, `[answer]`.
- `action` renderiza `tool(argsJson)` com as chaves de `args` **ordenadas alfabeticamente** — é o que torna a saída determinística (FR-007).
- `observation` renderiza `ok` ou `erro: <mensagem>`.
- `plan` renderiza os passos numerados a partir de 1.
- `answer` com `partial: true` recebe o sufixo ` (parcial)`.
- Sem timestamps, sem cores, sem ids não determinísticos: a mesma entrada sempre produz a mesma string (FR-007, SC-007).

## Catálogo de estratégias

**Módulo**: `src/agents/registry.ts`

```ts
export const strategies: Readonly<Record<string, ReasoningStrategy>>;
export function resolveStrategies(names: readonly string[]): ReasoningStrategy[]; // lança UnknownStrategyError
export function strategyNames(): string[]; // ordenado, determinístico
```

Adicionar uma estratégia é adicionar uma entrada aqui — nada no arena muda (SC-005).
