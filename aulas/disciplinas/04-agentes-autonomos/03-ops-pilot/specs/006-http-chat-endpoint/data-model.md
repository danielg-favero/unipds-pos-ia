# Data Model: Endpoint HTTP de Chat

Esta feature não introduz novas entidades persistentes (nenhuma tabela/coluna nova em `OpsStore`). Os "dados" aqui são formatos de mensagem HTTP, validados na fronteira e compostos a partir de tipos já existentes em `src/domain/strategy.ts`.

## ChatRequest (entrada)

Schema Zod: `chatRequestSchema` (novo, em `src/http/schemas.ts` ou co-localizado com o server).

| Campo      | Tipo                | Obrigatório | Default   | Regras de validação                                                |
|------------|---------------------|-------------|-----------|----------------------------------------------------------------------|
| `message`  | `string`             | sim         | —         | `min(1)` após trim conceitual (string vazia ou só espaços é inválida) |
| `strategy` | `string`             | não         | `"react"` | resolvida contra `strategyNames()`; se ausente, aplica-se o default antes da resolução |
| `reflect`  | `boolean`            | não         | `false`   | sem coerção — apenas `true`/`false` literais são aceitos             |

Objeto rejeita campos desconhecidos (parse estrito) para dar sinais claros de erro de integração.

## ChatResponse (saída de sucesso — 200)

Corresponde a `StrategyRun` (`src/domain/strategy.ts`), serializado como JSON:

| Campo     | Tipo                        | Descrição                                                        |
|-----------|-----------------------------|-------------------------------------------------------------------|
| `answer`  | `string`                    | Resposta final da estratégia executada                            |
| `trace`   | `TraceEvent[]`               | Sequência de eventos (`thought`, `plan`, `action`, `observation`, `critique`, `answer`) já produzida pela estratégia |
| `metrics` | `{ llmCalls: number; latencyMs: number }` | Métricas de execução (`RunMetrics`)                    |

Não há transformação de formato entre `StrategyRun` e o corpo HTTP — é um passthrough serializado, mantendo consistência com o restante do sistema (arena, MCP).

## ErrorResponse (saída de erro)

Formato comum para os três casos de erro (400, 422, 504), com um campo distintivo por caso:

| Status | Campo(s) específicos                                  | Origem                                                        |
|--------|---------------------------------------------------------|----------------------------------------------------------------|
| 400    | `issues: ZodIssue[]`                                    | `error.issues` do `chatRequestSchema.safeParse(...)`            |
| 422    | `requested: string`, `available: string[]`              | `UnknownStrategyError` (já existe em `src/domain/errors.ts`)     |
| 504    | (sem corpo obrigatório específico; mensagem genérica)   | timeout de 180s excedido                                        |

Estrutura sugerida (comum a todos): `{ "error": string, ...campos específicos acima }`.

## Relações com entidades existentes

- `ChatRequest.strategy` referencia uma chave do catálogo em `src/agents/registry.ts` (`strategies` / `strategyNames()`).
- `ChatResponse` é produzida chamando `ReasoningStrategy.run({ request: message, maxIterations, store })`, onde `store` é a instância de `OpsStore` (SQLite) do servidor e `maxIterations` usa o mesmo default já usado pelo CLI (8, `src/cli/args.ts`).
- Nenhuma nova tabela SQLite é criada; o endpoint apenas orquestra estratégias e a store já existentes.
