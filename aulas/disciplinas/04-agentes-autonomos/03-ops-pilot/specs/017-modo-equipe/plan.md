# Implementation Plan: Modo Equipe (Supervisor Multi-Agente)

**Branch**: `017-modo-equipe` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-modo-equipe/spec.md`

## Summary

Adicionar um novo modo de orquestração multi-agente ("team") ao grafo de agentes do OpsPilot: um supervisor LangGraph decide, a cada passo, qual especialista (`analista`, `planejador`, `executor`) age em seguida, usando `withStructuredOutput({ next, brief })` sobre um quadro compartilhado (blackboard) acumulado no estado do grafo. Cada transição de responsabilidade é registrada como um novo tipo de `TraceEvent` (`"handoff"`), persistido e exibido na visualização "ver raciocínio" já existente no War Room Console. A orquestração é limitada a 8 transições totais por execução. O modo é exposto como mais uma entrada na fábrica de estratégias (`ReasoningStrategy`) já usada por `react`, `plan-and-execute` e `production`, selecionável via o campo `strategy: "team"` do `POST /chat` existente — sem nova rota HTTP.

## Technical Context

**Language/Version**: TypeScript ESM (`strict: true`) sobre Node 24 LTS

**Primary Dependencies**: `@langchain/langgraph` (`StateGraph`/`Annotation`), `@langchain/core` (`withStructuredOutput`, `tool()`), Zod, Express (rota `/chat` já existente)

**Storage**: SQLite via `node:sqlite` (`DatabaseSync`) — reaproveita as tabelas `requests`/`trace_events` já existentes (`src/store/sqlite/request-trace-schema.ts`); nenhuma migração de schema é necessária, pois `trace_events.payload` já serializa `TraceEvent` genericamente e `requests.route` já aceita qualquer string de estratégia

**Testing**: `node:test` via `tsx`, testes colocados (`src/team/*.test.ts`), seguindo o padrão de `production-graph.test.ts` (funções de decisão/modelo injetáveis com fakes determinísticos, sem chamadas reais a LLM/HTTP)

**Target Platform**: Servidor Node (mesmo processo do `src/http/server.ts`); consumido também pelo `web/` (War Room Console, Vite+React) para renderização do handoff no painel de raciocínio

**Project Type**: Extensão de serviço web único (backend + frontend companheiro em `web/`), sem novo serviço/processo

**Performance Goals**: Sem alvo numérico novo; herda os limites já vigentes de `production-graph` (mesma ordem de grandeza de chamadas a modelo por requisição, mas limitado a 8 transições em vez de um `recursionLimit` genérico)

**Constraints**: Teto rígido de 8 transições supervisor→especialista por execução (FR-011); papel executor nunca contorna `withApprovalGuardrail` (FR-007, Princípio V da constitution); papel planejador nunca invoca ferramentas (FR-006); papel analista nunca propõe/executa ações (FR-005)

**Scale/Scope**: Um novo diretório `src/team/` (grafo supervisor + 3 nós de papel), uma extensão pontual em `src/domain/strategy.ts` (`TraceEvent`) e `src/domain/trace.ts` (`formatEvent`), um novo registro em `src/agents/registry.ts`, e a extensão correspondente em `web/src/trace/trace-event.tsx` + `web/src/api/types.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Camadas Explícitas (`http`/`cli` → `service` → `store`) | PASS — `src/team/` fica no mesmo nível de camada que `src/agents/` (orquestração), não faz I/O direto; usa `OpsStore` (já guardado por `withApprovalGuardrail`) injetado via `StrategyInput`, igual às estratégias existentes |
| II. Validações na Fronteira (Zod) | PASS — a decisão do supervisor (`{ next, brief }`) é validada via `withStructuredOutput` + schema Zod, mesmo padrão de `routeSchema` em `production-graph.ts` |
| III. Erros são de Domínio | PASS — falha do supervisor em decidir (saída malformada) segue o mesmo padrão de fallback determinístico do roteador de `production-graph.ts` (não lança para o operador; ver Edge Case correspondente) |
| IV. Teste é Parte da Tarefa (NON-NEGOTIABLE) | PASS — plano inclui testes colocados (`src/team/*.test.ts`) cobrindo handoff, teto de 8, e restrições por papel; `typecheck`/`test` continuam gate de aceite |
| V. Segurança por Padrão (guardrails, deny list) | PASS — papel executor reaproveita `makeTools(guardedStore)` com o mesmo `withApprovalGuardrail` já usado por `react`/`plan-and-execute`; nenhum caminho de execução paralelo é criado (FR-007) |
| VI. Funções Puras | PASS — a lógica de decisão do supervisor e a montagem do blackboard são funções puras sobre o estado do grafo; only os nós de I/O (chamada ao modelo, chamada de ferramenta) têm efeito colateral, isolados como já ocorre em `react.ts`/`plan-and-execute.ts` |

Nenhuma violação identificada; `Complexity Tracking` não é necessária.

## Project Structure

### Documentation (this feature)

```text
specs/017-modo-equipe/
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
├── team/                        # NOVO — grafo supervisor multi-agente
│   ├── state.ts                 # Annotation.Root: blackboard, handoffs, trace, answer, metrics
│   ├── supervisor.ts             # withStructuredOutput({ next, brief }) + fallback determinístico
│   ├── roles/
│   │   ├── analista.ts          # papel somente-leitura (subset de ferramentas de leitura)
│   │   ├── planejador.ts        # papel sem ferramentas
│   │   └── executor.ts          # papel com ferramentas de incidente via guardedStore
│   ├── team-graph.ts            # StateGraph: START → supervisor → {analista|planejador|executor} → supervisor → ... → respond → END
│   ├── team-graph.test.ts
│   ├── supervisor.test.ts
│   └── roles/*.test.ts
├── domain/
│   ├── strategy.ts               # EDITADO — adiciona variante "handoff" a TraceEvent
│   └── trace.ts                  # EDITADO — formatEvent cobre "handoff"
├── agents/
│   ├── registry.ts                # EDITADO — registra strategies.team = teamStrategy
│   └── tools.ts                   # reaproveitado sem alteração (makeTools filtrável por nome)
└── http/
    └── server.ts                  # sem alteração estrutural — "team" chega pelo campo `strategy` já existente

web/
└── src/
    ├── trace/trace-event.tsx      # EDITADO — novo branch de renderização para "handoff"
    └── api/types.ts               # EDITADO — TraceEvent espelhado no frontend
```

**Structure Decision**: Reaproveita a estrutura de serviço único já existente (`src/` backend + `web/` frontend companheiro). O modo equipe é um novo diretório de orquestração (`src/team/`) paralelo a `src/agents/`, registrado como mais uma `ReasoningStrategy` nomeada `"team"` na fábrica já usada por `POST /chat` (campo `strategy`) — não introduz um novo processo, serviço ou rota Express, apenas uma nova estratégia selecionável e uma nova variante de evento de trace.

## Complexity Tracking

*Não aplicável — nenhuma violação de constitution identificada.*
