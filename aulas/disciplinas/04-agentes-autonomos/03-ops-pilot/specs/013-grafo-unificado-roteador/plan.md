# Implementation Plan: Grafo Unificado com Roteamento Automático de Estratégia

**Branch**: `013-grafo-unificado-roteador` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-grafo-unificado-roteador/spec.md`

## Summary

Hoje `/chat` exige (ou assume por default) uma estratégia de raciocínio escolhida manualmente
(`react`, `plan-and-execute`, ou suas variantes `reflect:*`) via `strategy` no corpo da requisição,
resolvida por lookup direto em `src/agents/registry.ts`. Esta feature substitui esse lookup por um
único grafo de produção (`src/agents/production-graph.ts`) construído com `StateGraph` do
LangGraph, com nós `context → router → {react|plan-and-execute} → respond`. O nó `router` usa
`createModel().withStructuredOutput(...)` (mesmo padrão já usado em `reflection.ts`) com um schema
`{ route, reason }` e uma tabela das estratégias disponíveis (nome + quando usar) embutida no
prompt, para decidir automaticamente qual estratégia executar quando o cliente não informar uma.
Cada nó do grafo (`context`, `router`, a estratégia executada, `respond`) emite um evento de trace;
a decisão do roteador é registrada como um evento `route` (com a estratégia escolhida e o motivo).
`POST /chat` passa a aceitar `strategy` como override opcional: quando presente, o grafo pula o nó
`router` e usa a estratégia indicada diretamente, sinalizando esse override no trace. O contrato de
saída de `ReasoningStrategy`/`StrategyRun` já existente é reaproveitado — o grafo unificado é
exposto como mais uma implementação de `ReasoningStrategy` (`name: "production"`), preservando a
combinação com `reflect:*` e o restante do fluxo de `/chat` sem alterações.

## Technical Context

**Language/Version**: TypeScript ESM (Node 24 LTS, `strict: true`), executado via `tsx`.

**Primary Dependencies**: `@langchain/langgraph` (`StateGraph`, `Annotation`, `START`/`END`, já em
uso em `plan-and-execute.ts`), `@langchain/core`, `@langchain/openai` (via `createModel()`), `zod`
(schema do roteador e do corpo de `/chat`), `express` (rota `/chat`).

**Storage**: N/A para esta feature (reaproveita `OpsStore`/`ConversationStore`/`MemoryStore`
já injetados em `ServerDeps`, sem novo estado persistente).

**Testing**: `node:test` via `tsx`, seguindo o padrão de `*.test.ts` ao lado do código
(ex.: `react.ts`/`plan-and-execute.ts` não têm teste próprio hoje — a cobertura vem de
`server.test.ts` e testes de integração do grafo/roteador dedicados). Estratégia base é mockar o
modelo (`withStructuredOutput`) como já feito em `reflection.test.ts`.

**Target Platform**: Servidor HTTP Node (backend), sem componente de UI.

**Project Type**: Serviço único (backend HTTP + CLI), sem frontend — estrutura de projeto único.

**Performance Goals**: Sem alvo numérico novo; a decisão de roteamento adiciona no máximo 1 chamada
de LLM extra por pedido sem `strategy` explícito (mesma ordem de grandeza de uma chamada de
`withStructuredOutput` como a do crítico em `reflection.ts`). Deve respeitar o timeout de 180s já
existente em `/chat` (`DEFAULT_TIMEOUT_MS`).

**Constraints**: O contrato de resposta de `ReasoningStrategy.run` (`StrategyRun` = `answer` +
`trace` + `metrics`) não muda. `finishRun` continua sendo o único ponto que fecha um trace com
`answer` final. O roteador nunca pode travar o pedido: falha/ambiguidade cai em uma estratégia
padrão (FR-008).

**Scale/Scope**: Reorganiza o fluxo de decisão de estratégia hoje espalhado entre
`registry.ts`/`server.ts`; não adiciona novas estratégias de raciocínio além das 3 já existentes
(`react`, `plan-and-execute`, e a decisão binária de roteamento em si não é uma 4ª estratégia).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Camadas Explícitas** (`http` → `service` → `store`, domínio sem I/O): o novo
  `production-graph.ts` vive em `src/agents/` (camada de serviço/agente, mesma camada de
  `react.ts`/`plan-and-execute.ts`/`reflection.ts`), não em `src/domain/`. `server.ts` continua só
  chamando `strategy.run(...)` — PASS.
- **II. Validações na Fronteira** (Zod antes de virar domínio): `strategy` continua validado por
  `chatRequestSchema` (já existe); a saída do roteador (`{ route, reason }`) é validada por um
  schema Zod passado a `withStructuredOutput`, no mesmo padrão de `verdictSchema` em
  `reflection.ts` — PASS.
- **III. Erros são de Domínio**: falha do roteador (provedor indisponível, saída inválida) não deve
  lançar — cai em fallback para a estratégia padrão, espelhando o tratamento já existente em
  `critique()` (nunca lança, devolve veredito de reprovação segura) — PASS, a ser confirmado no
  Phase 0.
- **IV. Teste é Parte da Tarefa (NON-NEGOTIABLE)**: cada nó novo (`router`, `context`, `respond`) e
  o comportamento de override precisam de teste antes de fechar a tarefa; `typecheck`/`test` verdes
  são pré-condição — PASS (a cumprir no `/speckit-tasks` + implementação).
- **V. Segurança por Padrão**: nenhum segredo novo; o roteador não introduz ações destrutivas nem
  contorna guardrails existentes (`tools.ts`) — PASS.
- **VI. Funções Puras**: a montagem do grafo e a lógica de decisão de fallback devem ser isoláveis
  de efeitos colaterais sempre que possível; a chamada ao modelo (I/O) fica isolada no nó `router`,
  como já ocorre em `critique()` — PASS.

Nenhuma violação identificada; **Complexity Tracking** não é necessário.

## Project Structure

### Documentation (this feature)

```text
specs/013-grafo-unificado-roteador/
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
├── agents/
│   ├── production-graph.ts       # NOVO: StateGraph unificado (context → router → estratégia → respond)
│   ├── production-graph.test.ts  # NOVO: testes do grafo (roteamento automático, override, fallback)
│   ├── registry.ts                # ATUALIZADO: passa a expor também a estratégia "production"
│   ├── react.ts                   # Reaproveitado como nó/estratégia dentro do grafo (sem mudança de contrato)
│   ├── plan-and-execute.ts        # Reaproveitado como nó/estratégia dentro do grafo (sem mudança de contrato)
│   └── reflection.ts              # Reaproveitado sem mudança (continua decorando qualquer ReasoningStrategy)
├── domain/
│   └── strategy.ts                # ATUALIZADO: novo variant "route" em TraceEvent
├── http/
│   ├── schemas.ts                 # Sem mudança de forma (strategy já é opcional); comentário atualizado
│   └── server.ts                  # ATUALIZADO: default de estratégia passa a ser "production" (roteamento automático)
└── ...
```

**Structure Decision**: Projeto único (backend Node/Express + CLI), sem separação
frontend/backend. A nova lógica entra como mais um arquivo em `src/agents/` (mesmo nível de
`react.ts`/`plan-and-execute.ts`), reaproveitando os contratos já existentes em
`src/domain/strategy.ts` — não há novo diretório de topo nem mudança de camadas.

## Complexity Tracking

> Não aplicável — nenhuma violação de constitution identificada no Constitution Check.
