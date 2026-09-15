# Implementation Plan: Orçamento de Contexto por Seção

**Branch**: `012-orcamento-contexto` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-orcamento-contexto/spec.md`

## Summary

Centralizar em `src/context/context-builder.ts` a montagem do prompt (mensagens iniciais) consumido por todas as estratégias de raciocínio (`react`, `plan-and-execute`; `reflection` delega para uma estratégia interna e não monta prompt própria). O builder aplica um teto de tamanho (estimado via `estimateTokens`, já existente em `src/context/tokens.ts`) por seção — resumo (200), janela de histórico (1200, corta as mensagens mais antigas primeiro) e memórias (300, corta as de menor `score` primeiro) — configurável via `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_HISTORY`, `CONTEXT_BUDGET_MEMORY`. `system` (system prompt da estratégia) e a mensagem/pedido atual nunca são cortados. `react.ts` e `plan-and-execute.ts` passam a chamar o builder em vez de montar suas próprias listas de mensagens/blocos de texto.

## Technical Context

**Language/Version**: TypeScript ESM (Node 24 LTS), `strict: true`

**Primary Dependencies**: nenhuma nova — reaproveita `estimateTokens`/`ContextBreakdown` de `src/context/tokens.ts` e os tipos de `src/domain/strategy.ts` (`StrategyInput`, `RecalledMemory`-like scored memories)

**Storage**: N/A (função pura em memória; não acessa store/DB)

**Testing**: `node:test` via `tsx`, seguindo o padrão de `src/context/tokens.test.ts`

**Target Platform**: servidor Node (mesmo runtime do restante do OpsPilot)

**Project Type**: single project (biblioteca interna dentro do monorepo do OpsPilot)

**Performance Goals**: N/A — função síncrona, O(n log n) no pior caso (ordenar mensagens/memórias para corte), custo desprezível frente à chamada ao LLM

**Constraints**: `system` e mensagem atual nunca truncados (FR-002); corte determinístico (FR-012); leitura de env uma vez por chamada de montagem (sem hot-reload)

**Scale/Scope**: 1 módulo novo (`context-builder.ts` + teste), 2 strategies refatoradas para consumi-lo (`react.ts`, `plan-and-execute.ts`); `reflection.ts` não muda (não monta prompt própria)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Camadas Explícitas**: `context-builder.ts` vive em `src/context/`, é chamado por `src/agents/*` (camada de estratégia) — não faz I/O, não depende de `store`. Conforme.
- **II. Validações na Fronteira**: as variáveis de ambiente `CONTEXT_BUDGET_*` são a única entrada externa desta feature; serão parseadas com uma validação simples (numérico, não-negativo) e fallback para o default, sem exigir um schema Zod completo por serem apenas 3 inteiros com fallback trivial (justificativa registrada, não é uma violação — Zod seria over-engineering para `Number()` + `isFinite`/`>= 0`).
- **III. Erros são de Domínio**: builder é função pura, nunca lança — entradas inválidas (env malformada) resultam em fallback ao default (FR-009), não em exceção.
- **IV. Teste é Parte da Tarefa**: testes cobrem a ordem de corte (histórico mais antigo primeiro, memória menor score primeiro), tetos zero/vazio, e defaults — conforme US2 da spec.
- **V. Segurança por Padrão**: não introduz ações destrutivas nem lê segredos; só lê `process.env.CONTEXT_BUDGET_*`.
- **VI. Funções Puras**: `buildPrompt`/`applyBudget` são funções puras (entrada → saída, sem efeito colateral); a única leitura de `process.env` fica isolada em uma função de parsing de configuração separada, chamada pelas strategies (camada de borda), não pelo core do builder.

Nenhuma violação — gate passa sem necessidade de `Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
specs/012-orcamento-contexto/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts                  # existente — estimateTokens, ContextBreakdown (reaproveitado)
│   ├── tokens.test.ts
│   ├── context-builder.ts         # NOVO — orçamento por seção + montagem do prompt
│   └── context-builder.test.ts    # NOVO
├── agents/
│   ├── react.ts                   # ALTERADO — usa context-builder em vez de montar initialMessages manualmente
│   ├── plan-and-execute.ts        # ALTERADO — usa context-builder em vez de montar memoryBlock/historyBlock manualmente
│   └── reflection.ts              # sem mudanças (delega para strategy interna)
└── domain/
    └── strategy.ts                # sem mudanças de tipo (StrategyInput já expõe history/memories/historySummary)
```

**Structure Decision**: Projeto único (biblioteca interna). Novo módulo em `src/context/context-builder.ts`, ao lado de `tokens.ts` (mesma camada de utilidades de contexto), consumido pela camada `src/agents/*` conforme o fluxo de dependências `http/cli → service → store` da constitution (aqui: `agents` → `context`, sem I/O).

## Complexity Tracking

*Sem violações — seção não aplicável.*
