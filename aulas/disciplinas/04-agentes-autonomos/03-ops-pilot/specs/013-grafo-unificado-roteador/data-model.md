# Data Model: Grafo Unificado com Roteamento Automático de Estratégia

Esta feature não introduz nova persistência (SQLite) nem novas entidades de domínio no sentido de
`Key Entities` de longa duração. As "entidades" abaixo são formas de dados que trafegam dentro de
uma única execução (`StrategyRun`) e não sobrevivem além dela — equivalentes aos objetos já
existentes em `src/domain/strategy.ts`.

## `TraceEvent` (atualizado)

Union discriminado já existente em `src/domain/strategy.ts`. Adiciona um novo variant.

| Campo (variant `route`) | Tipo      | Obrigatório | Descrição |
|--------------------------|-----------|-------------|-----------|
| `type`                   | `"route"` | sim         | Discriminador do variant. |
| `route`                  | `string`  | sim         | Nome da estratégia escolhida (deve corresponder a uma chave existente no catálogo de estratégias-base, ex. `"react"`, `"plan-and-execute"`). |
| `reason`                 | `string`  | sim         | Justificativa da escolha — vinda do LLM (`withStructuredOutput`) na decisão automática, ou uma frase fixa (`"override manual via /chat"`) no caso de override, ou `"fallback: <motivo>"` em caso de falha/ambiguidade do roteador. |
| `manual`                 | `boolean` | sim         | `true` quando a estratégia veio de override explícito do usuário (FR-007); `false` quando decidida automaticamente pelo roteador (FR-003), incluindo o caso de fallback. |

Regras de validação:
- `route` só pode ser um nome presente no catálogo de estratégias-base disponíveis para roteamento
  (não inclui variantes `reflect:*`, que continuam sendo aplicadas por fora, como decoradores).
- Exatamente um evento `route` existe por execução da estratégia `"production"` (nunca zero, nunca
  mais de um — a decisão de roteamento acontece uma única vez por pedido, conforme Assumptions da
  spec).
- O evento `route`, quando presente, sempre aparece antes de qualquer evento produzido pela
  estratégia-base escolhida e antes do evento final `answer`.

Os demais variants de `TraceEvent` (`thought`, `plan`, `action`, `observation`, `critique`,
`answer`) não mudam de forma.

## `RouteDecision` (interno ao nó `router`, não exportado como tipo público novo)

Representa o resultado bruto da chamada estruturada ao modelo antes de virar um `TraceEvent`.

| Campo    | Tipo                                  | Obrigatório | Descrição |
|----------|----------------------------------------|-------------|-----------|
| `route`  | enum dos nomes das estratégias-base    | sim         | Estratégia escolhida pelo modelo. |
| `reason` | `string` (mínimo 1 caractere)          | sim         | Justificativa textual da escolha. |

Validado via schema Zod (`z.object({ route: z.enum([...]), reason: z.string().min(1) })`),
seguindo o padrão de `verdictSchema` em `src/agents/reflection.ts`. Uma saída que falhe a validação
Zod, ou cujo `route` não seja uma chave válida, é tratada como falha do roteador (ver research.md
§3) e não chega a virar um `RouteDecision` — vira diretamente o fallback.

## `ProductionGraphState` (estado interno do `StateGraph`, não exportado)

Estado acumulado entre os nós do grafo unificado, seguindo o padrão de `PlanExecuteState` em
`src/agents/plan-and-execute.ts` (`Annotation.Root`).

| Campo           | Tipo                          | Reducer                          | Descrição |
|-----------------|--------------------------------|-----------------------------------|-----------|
| `input`         | `StrategyInput`                | substitui (default: entrada inicial) | Entrada original recebida por `run()` — inclui `overrideRoute` quando aplicável. |
| `overrideRoute` | `string \| undefined`          | substitui                         | Nome da estratégia forçada via override manual (FR-005/FR-006), se houver. |
| `trace`         | `TraceEvent[]`                 | concatena                         | Trace acumulado por todos os nós já executados. |
| `route`         | `RouteDecision \| undefined`   | substitui                         | Decisão de roteamento (automática ou construída a partir do override), preenchida pelo nó `router`. |
| `run`           | `StrategyRun \| undefined`     | substitui                         | Resultado (`answer`/`trace`/`metrics`) produzido pelo nó da estratégia-base escolhida, consumido pelo nó `respond`. |

Este estado é um detalhe de implementação do grafo (`production-graph.ts`) — não é exposto fora do
módulo; o contrato externo continua sendo `ReasoningStrategy`/`StrategyInput`/`StrategyRun`.

## Relações

```text
StrategyInput ──(run)──▶ ProductionGraphState
                              │
                              ├─ nó "context": prepara seções de prompt/contexto (sem novo campo de estado; reaproveita input)
                              │
                              ├─ nó "router": lê overrideRoute OU chama withStructuredOutput
                              │                 └─▶ produz RouteDecision ─▶ TraceEvent{type:"route"}
                              │
                              ├─ nó da estratégia escolhida (react | plan-and-execute):
                              │     delega para o ReasoningStrategy existente ─▶ StrategyRun parcial
                              │
                              └─ nó "respond": finishRun(...) ─▶ StrategyRun final (answer + trace + metrics)
```

Nenhuma entidade aqui exige migração de schema SQLite nem novo store — tudo é transitório à
execução de uma requisição `/chat`.
