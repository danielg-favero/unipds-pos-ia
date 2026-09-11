# Implementation Plan: Endpoint HTTP de Chat

**Branch**: `006-http-chat-endpoint` | **Date**: 2026-09-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-http-chat-endpoint/spec.md`

## Summary

Expor `POST /chat` em `src/http/server.ts` (Express), validando o corpo com Zod (`message` obrigatório, `strategy` opcional com default `react`, `reflect` opcional com default `false`). O handler resolve a estratégia a partir do catálogo já existente em `src/agents/registry.ts` (usando a chave `reflect:<strategy>` quando `reflect: true`), executa com um timeout de 180s, e devolve `{ answer, trace, metrics }` (passthrough de `StrategyRun`). Erros de validação viram 400 (issues do zod), estratégia desconhecida vira 422 (`UnknownStrategyError`), timeout vira 504. O app Express é construído via fábrica com dependências injetáveis (catálogo de estratégias + store) para permitir um teste de integração com uma estratégia fake determinística, sem chamadas de rede.

## Technical Context

**Language/Version**: TypeScript ESM (`strict: true`) sobre Node 24 LTS

**Primary Dependencies**: Express 5 (já dependência), Zod 4 (já dependência), reaproveita `src/agents/registry.ts` e `src/domain/strategy.ts` existentes — nenhuma dependência nova

**Storage**: SQLite via `node:sqlite` (`SqliteOpsStore`, já implementada em `src/store/sqlite/`), instanciada uma vez no boot do servidor

**Testing**: `node:test` via `tsx` (`npm test`), seguindo o padrão `*.test.ts`; teste de integração usa `fetch` nativo contra o servidor Express em porta efêmera, com estratégia fake injetada (sem `supertest`, para não adicionar dependência)

**Target Platform**: processo Node de longa duração (serviço HTTP interno)

**Project Type**: extensão single-project do backend TypeScript existente

**Performance Goals**: sem meta de throughput explícita; único requisito temporal é o timeout de 180s por requisição (FR-009)

**Constraints**: zero chamadas de rede real nos testes automatizados do endpoint (FR-010); sem autenticação nesta fase (fora de escopo, ver Assumptions do spec)

**Scale/Scope**: uma única rota (`POST /chat`); sem paginação, sem múltiplos recursos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Como esta feature cumpre |
|---|---|
| I. Camadas Explícitas (`http → service → store`) | `src/http/server.ts` só orquestra: valida entrada, resolve estratégia via registry, chama `strategy.run(...)` (que já encapsula a lógica de "serviço"), formata resposta. Nenhuma lógica de domínio nova é adicionada na camada HTTP. |
| II. Validações na Fronteira (Zod) | `chatRequestSchema` valida o corpo antes de qualquer uso; sem validação, sem execução. |
| III. Erros são de Domínio | 400 vem de `ZodError`, 422 vem de `UnknownStrategyError` (já existe em `src/domain/errors.ts`), 504 vem de um timeout tratado explicitamente — todos traduzidos na borda HTTP, nenhum erro genérico de runtime vaza como 500 sem tratamento. |
| IV. Teste é Parte da Tarefa (NON-NEGOTIABLE) | Teste de integração cobrindo 200/400/422/504 é parte explícita do escopo (FR-010, SC-005); `typecheck`/`test` continuam sendo o gate de conclusão. |
| V. Segurança por Padrão | Nenhum segredo novo introduzido; nenhuma leitura de `.env` na camada HTTP em si (o modelo já lê via `createModel()` existente). Endpoint não expõe ações destrutivas novas além das já guardadas pelas tools existentes. |
| VI. Funções Puras | A validação (`chatRequestSchema.safeParse`) e a resolução de nome de estratégia são puras; o efeito colateral (chamar a estratégia, que por sua vez toca a store) fica isolado no handler da rota, não espalhado em helpers. |

**Resultado**: PASS, sem violações a justificar em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-http-chat-endpoint/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── post-chat.md     # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created here)
```

### Source Code (repository root)

```text
src/
├── agents/
│   └── registry.ts        # reaproveitado sem alterações estruturais (fonte de verdade do catálogo)
├── domain/
│   ├── strategy.ts         # ReasoningStrategy, StrategyRun, RunMetrics (reaproveitados)
│   └── errors.ts           # UnknownStrategyError (reaproveitado)
├── http/                   # NOVO
│   ├── server.ts           # createServer(deps) — fábrica do app Express + bootstrap do processo principal
│   ├── schemas.ts          # NOVO — chatRequestSchema (Zod)
│   └── server.test.ts      # NOVO — teste de integração com estratégia fake, sem rede
└── store/
    └── sqlite/
        └── sqlite-ops-store.ts  # reaproveitado como store padrão do servidor
```

**Structure Decision**: Projeto single-project já existente (`src/agents`, `src/domain`, `src/store`, `src/cli`, `src/mcp`). Esta feature adiciona um novo módulo de camada de borda, `src/http/`, espelhando o padrão já usado por `src/mcp/` (fiação fina sobre domínio/agents existentes, com uma fábrica que aceita dependências injetáveis para testabilidade). Nenhuma reestruturação de diretórios existentes é necessária.

## Complexity Tracking

*Sem violações à Constitution Check — seção não aplicável.*
