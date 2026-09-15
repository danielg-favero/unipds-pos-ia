# Data Model: Orçamento de Contexto por Seção

Módulo é uma função pura; "entidades" abaixo são tipos TypeScript, não tabelas.

## `ContextBudget`

Configuração de tetos por seção (tokens estimados, ver research.md §1).

```ts
type ContextBudget = {
  readonly summary: number;  // default 200
  readonly history: number;  // default 1200
  readonly memory: number;   // default 300
};
```

- Campos: inteiros `>= 0`. `0` omite a seção por completo (FR-011).
- `system` e a mensagem/request atual **não têm campo de orçamento** — são sempre incluídos por inteiro (FR-002); não fazem parte deste tipo.

**Validação/origem**: `readBudgetFromEnv(env?: NodeJS.ProcessEnv): ContextBudget` lê `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_HISTORY`, `CONTEXT_BUDGET_MEMORY`; valor ausente ou inválido (não numérico ou negativo) cai no default (FR-009).

## `PromptBuildInput`

Entrada bruta para a montagem, já no formato que `StrategyInput` (src/domain/strategy.ts) expõe.

```ts
type PromptBuildInput = {
  readonly systemPrompt: string;               // intocável (FR-002)
  readonly request: string;                    // intocável (FR-002)
  readonly historySummary?: string;             // seção "resumo"
  readonly history: readonly ConversationMessage[]; // seção "janela" — ordem cronológica (mais antiga primeiro)
  readonly memories: readonly ScoredMemory[];   // seção "memória"
  readonly budget?: ContextBudget;              // default: readBudgetFromEnv()
};

type ScoredMemory = {
  readonly fact: string;
  readonly score: number; // maior = mais relevante; usado para decidir prioridade de corte (FR-007)
};
```

- `history`: mesmo tipo de `ConversationMessage` já usado em `src/store/conversation-port.ts` (tem `role`, `content`).
- `ScoredMemory`: forma mínima compatível com `RecalledMemory` (`src/memory/memory-store.ts`, que já tem `fact` e `score`) e com `input.memories: readonly string[]` atual de `StrategyInput` — ver nota de migração em `contracts/`.

## `PromptSections` (saída)

```ts
type PromptSections = {
  readonly systemPrompt: string;         // igual à entrada, nunca cortado
  readonly request: string;              // igual à entrada, nunca cortado
  readonly historySummary?: string;      // cortado (truncado) para caber em budget.summary, ou omitido se vazio/budget=0
  readonly history: readonly ConversationMessage[]; // subconjunto mais recente que cabe em budget.history
  readonly memories: readonly ScoredMemory[];       // subconjunto de maior score que cabe em budget.memory
};
```

- Cada strategy (`react.ts`, `plan-and-execute.ts`) consome `PromptSections` e formata no seu próprio formato de mensagem (lista de `BaseMessage`-like ou bloco de texto concatenado) — a decisão de formatação de saída final não é parte deste tipo (research.md §2).

## Regras de corte (por seção)

| Seção | Unidade do item | Regra ao exceder o teto | Regra em teto = 0 ou seção vazia |
|---|---|---|---|
| `historySummary` | texto único | trunca o texto (mantém o início, corta o final) até caber em `budget.summary` | omite (`undefined`) |
| `history` | mensagem individual | remove mensagens mais antigas primeiro (FIFO pelo início do array), preserva ordem cronológica relativa das restantes | array vazio |
| `memories` | memória individual | ordena por `score` decrescente (estável — research.md §3), inclui do maior para o menor até o próximo item estourar o teto, descarta o resto | array vazio |

Nenhuma seção lança erro em nenhum cenário (FR-011) — a função de montagem é total (sempre retorna `PromptSections`).
