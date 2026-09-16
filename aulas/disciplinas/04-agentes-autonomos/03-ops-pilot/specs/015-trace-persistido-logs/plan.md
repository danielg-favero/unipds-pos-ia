# Implementation Plan: Trace Persistido e Logs Estruturados

**Branch**: `015-trace-persistido-logs` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-trace-persistido-logs/spec.md`

## Summary

`POST /chat` passa a gerar um `requestId` por requisição, devolvido no corpo e no header
`X-Request-Id`. A execução da estratégia já produz `StrategyRun.trace` (`TraceEvent[]`) e
`RunMetrics` (`src/domain/strategy.ts`); esta feature persiste esses dados em SQLite — uma
linha de métricas em `requests` e um evento por item do trace em `trace_events`, na ordem
em que aparecem no array — e expõe `GET /requests/:id` para reconstituir registro + trace
ordenado. Em paralelo, `src/obs/logger.ts` emite uma linha JSON por evento com apenas
metadados (sem os payloads completos de `args`/`result`), usada para acompanhamento em
tempo real via stdout. A escrita de trace é best-effort: falha nela nunca derruba a resposta
já calculada ao cliente (Assumptions da spec).

## Technical Context

**Language/Version**: TypeScript (ESM, `strict: true`) sobre Node 24 LTS

**Primary Dependencies**: Express 5, Zod 4, `node:sqlite` (`DatabaseSync`), `node:crypto` (`randomUUID`)

**Storage**: SQLite via `node:sqlite`, mesmo arquivo `OPSPILOT_DB` (default `./data/opspilot.db`; testes usam `:memory:`), seguindo o padrão de `SqliteConversationStore`/`SqliteOpsStore`

**Testing**: `node:test` via `tsx` (`npm test`), seguindo o padrão de `src/http/server.test.ts`

**Target Platform**: Servidor HTTP Node (processo único, `src/http/server.ts`)

**Project Type**: Single project (serviço HTTP + CLI/MCP compartilhando `src/`)

**Performance Goals**: Sem meta numérica nova; persistência de trace não pode adicionar latência perceptível à resposta de `/chat` (é posterior ao `res.json` já enviado, ver Constraints)

**Constraints**: Escrita de trace/log é fire-and-forget em relação à resposta HTTP — nunca atrasa nem derruba `/chat` (mesmo padrão já usado para `reflectLearning`/`updateHistorySummary` em `src/http/server.ts`); linhas de log não podem conter payloads completos (FR-008, SC-005)

**Scale/Scope**: Volume da mesma ordem das demais tabelas do serviço (uso interno/operacional); sem requisito de particionamento ou retenção automática nesta fase (Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Camadas Explícitas (`http → service → store`) | PASS — `http/server.ts` apenas orquestra; persistência entra por um novo `TraceStore` em `store/sqlite/`; formatação de log fica isolada em `obs/logger.ts`, sem I/O de domínio. |
| II. Validações na Fronteira (Zod) | PASS — `GET /requests/:id` valida `:id` via Zod antes de consultar; corpo de `/chat` já validado (schema existente, sem mudança de contrato de entrada). |
| III. Erros são de Domínio | PASS — "requisição não encontrada" (FR-007) vira erro de domínio traduzido para 404 na borda HTTP, mesmo padrão de `UnknownStrategyError`. |
| IV. Teste é Parte da Tarefa | PASS — cada história de usuário (US1–US3) ganha testes `node:test`; `typecheck`/`test` verdes antes de prosseguir. |
| V. Segurança por Padrão | PASS — nenhum segredo novo; sem leitura de `.env` adicional; sem ações destrutivas. |
| VI. Funções Puras | PASS — formatação de linha de log e serialização de evento são funções puras (mesmo padrão de `formatTrace` em `domain/trace.ts`); efeito colateral (escrita SQLite/stdout) isolado em `store`/`obs`. |

Nenhuma violação — sem necessidade de `Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
specs/015-trace-persistido-logs/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
# Option 1: Single project (DEFAULT) — layout já usado pelo repo

src/
├── domain/
│   ├── errors.ts             # + RequestNotFoundError
│   └── trace.ts               # (existente, sem mudança de contrato)
├── obs/
│   └── logger.ts              # NOVO: logLine(event) -> 1 linha JSON em stdout
├── store/
│   ├── request-trace-port.ts  # NOVO: interface RequestTraceStore
│   └── sqlite/
│       ├── request-trace-schema.ts     # NOVO: DDL requests + trace_events
│       └── sqlite-request-trace-store.ts # NOVO: adaptador SQLite
├── http/
│   ├── schemas.ts             # + requestIdParamSchema
│   └── server.ts              # + requestId por requisição, header, persistência
└── ...

src/**/*.test.ts   # testes colocalizados (padrão já usado no repo, ex. server.test.ts)
```

**Structure Decision**: Mantém a estrutura single-project já existente. Novo domínio de
observabilidade fica em `src/obs/` (logging puro, sem I/O de banco) e `src/store/` ganha um
port + adaptador SQLite seguindo exatamente o padrão de `ConversationStore` /
`SqliteConversationStore` já presente no repositório. `http/server.ts` é o único ponto que
conhece `requestId`, grava (fire-and-forget) e expõe a nova rota — mantendo `domain` livre de I/O.

## Complexity Tracking

*Sem violações da Constitution Check — seção não aplicável.*
