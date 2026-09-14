# Implementation Plan: Memória Semântica por Usuário

**Branch**: `008-memoria-semantica` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-memoria-semantica/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Adicionar um `MemoryStore` por `userId` (remember/recall/forget) sobre uma tabela `memories` em
SQLite, usando embeddings locais (`all-MiniLM-L6-v2` via `@huggingface/transformers`, pooling mean +
normalização, singleton lazy) armazenados como BLOB. `remember` deduplica por similaridade de
cosseno/produto escalar > 0.92; `recall` retorna top-3 por produto escalar com corte mínimo de 0.3.
`POST /chat` passa a exigir `userId`, chama `recall` antes de acionar a estratégia e injeta os fatos
recuperados como contexto adicional do agente — sem exigir palavra em comum entre consulta e fato
(teste dedicado a isso).

## Technical Context

**Language/Version**: TypeScript ESM (Node 24 LTS, `strict: true`)

**Primary Dependencies**: `@huggingface/transformers` (embeddings locais, novo), `zod` (validação de
entrada), `node:sqlite` (`DatabaseSync`, já usado pelo projeto)

**Storage**: SQLite via `node:sqlite`, mesmo arquivo `OPSPILOT_DB` (default `./data/opspilot.db`);
tabela nova `memories` com embedding em coluna `BLOB`; testes usam `:memory:`

**Testing**: `node:test` via `tsx` (`npm test`), seguindo o padrão dos demais stores (`*.test.ts`
ao lado do arquivo)

**Target Platform**: servidor HTTP Node (Linux/macOS), sem dependência de rede para embeddings

**Project Type**: serviço web único (Express) com CLI/MCP adicionais já existentes — sem frontend

**Performance Goals**: `recall` deve responder dentro do orçamento de latência já existente do
`/chat` (sem adicionar timeout dedicado); custo de embedding é local e síncrono por requisição

**Constraints**: processamento 100% local (sem chamadas externas para gerar embeddings, por custo e
privacidade — Assumption da spec); modelo carregado uma única vez por processo (singleton lazy)

**Scale/Scope**: volume de memórias por usuário é pequeno (dezenas a centenas de fatos); `recall`
varre todas as memórias do usuário no cálculo de similaridade (sem índice vetorial dedicado nesta
versão)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Camadas Explícitas** (`http` → `service` → `store`): `MemoryStore` fica em `src/store/`
  (mesma camada de `ConversationStore`/`OpsStore`); `src/http/server.ts` chama `remember`/`recall`
  antes de invocar a estratégia. Geração de embedding (`src/memory/embeddings.ts`) é infraestrutura
  usada pelo store, não pelo domínio. **PASS**
- **II. Validações na Fronteira**: `userId` passa a ser validado por Zod em `chatRequestSchema`
  (novo campo obrigatório). **PASS**
- **III. Erros são de Domínio**: nenhuma condição de erro nova além de entrada inválida (já coberta
  pelo Zod) e falha de forget idempotente (não é erro, por requisito). **PASS**
- **IV. Teste é Parte da Tarefa**: cada peça nova (`embeddings.ts`, `memory-store.ts`, alteração no
  `/chat`) recebe teste; teste obrigatório de recall sem palavra em comum (da spec). **PASS**
- **V. Segurança por Padrão**: sem segredos novos; embeddings são locais, não saem do processo;
  queries usam prepared statements (mesmo padrão do `SqliteConversationStore`). **PASS**
- **VI. Funções Puras**: cálculo de similaridade (produto escalar) é função pura; efeitos colaterais
  (SQLite, carregar modelo) isolados em `src/store/sqlite/` e `src/memory/embeddings.ts`. **PASS**

Nenhuma violação a justificar em `Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
specs/008-memoria-semantica/
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
├── memory/
│   ├── embeddings.ts               # singleton lazy do modelo, embed(text) -> Float32Array
│   ├── embeddings.test.ts
│   ├── memory-store.ts             # interface MemoryStore (remember/recall/forget) + similaridade
│   └── memory-store.test.ts
├── store/
│   └── sqlite/
│       ├── memory-schema.ts        # DDL idempotente da tabela `memories`
│       ├── sqlite-memory-store.ts  # implementação SQLite de MemoryStore (BLOB para embedding)
│       └── sqlite-memory-store.test.ts
└── http/
    ├── schemas.ts                  # chatRequestSchema ganha `userId`
    └── server.ts                   # recall antes da estratégia, remember após resposta (se aplicável)
```

**Structure Decision**: projeto único (sem frontend). `src/memory/` isola a lógica de embeddings e
memória (paralela a `src/store/`, mas com a peça de embedding que não existia antes); a
implementação persistente vive em `src/store/sqlite/`, ao lado de `SqliteConversationStore` e
`SqliteOpsStore`, seguindo o mesmo padrão de DDL idempotente + prepared statements. `src/http/`
recebe apenas as mudanças mínimas para aceitar `userId` e injetar o recall.

## Complexity Tracking

Nenhuma violação da Constitution Check acima — seção não se aplica.
