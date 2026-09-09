# Implementation Plan: Persistência Real de Operações (SQLite)

**Branch**: `003-persistencia-sqlite` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-persistencia-sqlite/spec.md`

## Summary

Adicionar um adaptador `SqliteOpsStore` que implementa a porta `OpsStore` já existente usando
`node:sqlite` (`DatabaseSync`), tornando incidentes, alertas, serviços e runbooks duráveis entre
reinícios. O schema (4 tabelas) é criado de forma idempotente no construtor, com `CHECK` para todo
campo de domínio fechado, e populado com o cenário "Mercadinho" também de forma idempotente. Duas
tools novas (`list_incidents`, `consultar_runbook`) expõem o histórico e os runbooks ao agente. A
composição do arena passa a injetar o `SqliteOpsStore` como padrão de execução real, mantendo o
`MemoryOpsStore` como o store usado por testes e pelo bench (cenários reproduzíveis, sem I/O em
disco). Todas as queries usam prepared statements — nenhuma concatenação de SQL com entrada externa.

## Technical Context

**Language/Version**: TypeScript ESM (`strict: true`) sobre Node 24 LTS

**Primary Dependencies**: `node:sqlite` (`DatabaseSync`, stdlib — sem dependência nova de pacote),
Zod (validação de fronteira), `@langchain/core` (`tool()` para as novas tools)

**Storage**: SQLite em arquivo único via `node:sqlite`; caminho configurável por `OPSPILOT_DB`
(default `./data/opspilot.db`); `:memory:` para testes automatizados

**Testing**: `node:test` via `tsx` (`npm test`), cada arquivo de teste do `SqliteOpsStore` abre um
`DatabaseSync(":memory:")` isolado por teste/suite

**Target Platform**: processo Node.js de servidor/CLI (mesmo runtime do restante do OpsPilot)

**Project Type**: single project (biblioteca + CLI/agents dentro de `src/`)

**Performance Goals**: sem meta de throughput dedicada — operações são de baixo volume (dezenas de
linhas por tabela); latência de uma consulta preparada em SQLite local é desprezível frente à
latência do LLM

**Constraints**: nenhuma dependência de pacote externo para o driver SQLite (usa o módulo nativo do
Node); DDL idempotente (não falha ao rodar sobre um banco já inicializado); nenhuma concatenação de
SQL com entrada externa (regra V da constitution)

**Scale/Scope**: cenário único de seed ("Mercadinho": 5 serviços, 6 alertas, runbooks de 3
serviços); volume de incidentes de uso real de um plantão, não um cenário de alta escala

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como a feature atende |
|---|---|
| I. Camadas Explícitas | `SqliteOpsStore` vive em `src/store/`, implementa a porta `OpsStore`; domínio (`src/domain/`) segue sem I/O; tools em `src/agents/tools.ts` continuam falando só com a porta, nunca com `DatabaseSync` diretamente. |
| II. Validações na Fronteira | Entradas das tools novas (`status`, `service`) continuam validadas com Zod antes de chegar ao store, como as tools existentes. |
| III. Erros são de Domínio | `SqliteOpsStore` levanta as mesmas classes de `src/domain/errors.ts` (`ServiceNotFoundError`, `IncidentNotFoundError`, `IncidentAlreadyResolvedError`); nenhum erro de driver SQLite escapa cru para a borda. |
| IV. Teste é Parte da Tarefa | Toda tabela/query nova ganha teste sobre `:memory:`; testes das tools existentes passam a rodar sobre `SqliteOpsStore` além do `MemoryOpsStore`. |
| V. Segurança por Padrão | Todas as queries usam prepared statements (`db.prepare(...).run/get/all`); `OPSPILOT_DB` é só um caminho de arquivo, não um segredo; `data/` fica no `.gitignore`. |
| VI. Funções Puras | Efeitos colaterais (leitura/escrita do arquivo `.db`) ficam isolados dentro de `SqliteOpsStore`; conversão linha→domínio é função pura auxiliar. |
| Stack (SQLite via `node:sqlite`) | Esta feature É a implementação da decisão já registrada na constitution v1.1.0 — sem desvio. |

Nenhuma violação identificada. Gate aprovado sem necessidade de `Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
specs/003-persistencia-sqlite/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── domain/
│   ├── types.ts               # +Runbook, +Incident.resolvedAt/summary (existente, estendido)
│   └── errors.ts               # sem mudança de forma; usado pelo novo store
├── store/
│   ├── port.ts                  # +listIncidents, +getRunbook na interface OpsStore
│   ├── memory.ts                # ganha os mesmos métodos novos (paridade de contrato)
│   ├── seed-data.ts             # +SEED_RUNBOOKS (fonte única, reusada pelo seed do SQLite)
│   └── sqlite/
│       ├── sqlite-ops-store.ts  # SqliteOpsStore (implementa OpsStore via node:sqlite)
│       ├── schema.ts            # DDL idempotente das 4 tabelas + CHECKs
│       └── seed.ts              # seed idempotente do cenário Mercadinho
├── agents/
│   └── tools.ts                 # +list_incidents, +consultar_runbook; revisão de descrições (6 regras)
└── arena.ts / cli/args.ts       # composição: --store sqlite (novo padrão real), memory para testes/bench

tests/ (co-locados como *.test.ts, padrão já usado no repo)
├── src/store/sqlite/sqlite-ops-store.test.ts
├── src/store/sqlite/schema.test.ts
└── src/agents/tools.test.ts     # passa a rodar também sobre SqliteOpsStore(":memory:")
```

**Structure Decision**: Single project. Segue o layout já existente em `src/store/` (paralelo a
`src/store/sequelize/`), adicionando `src/store/sqlite/` como novo adaptador. Nenhuma nova pasta de
topo é criada; testes continuam co-locados como `*.test.ts` ao lado do código, no padrão do repo.

## Complexity Tracking

> Not applicable — Constitution Check passou sem violações.
