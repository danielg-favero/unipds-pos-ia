---

description: "Task list template for feature implementation"
---

# Tasks: Persistência Real de Operações (SQLite)

**Input**: Design documents from `/specs/003-persistencia-sqlite/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — Princípio IV da constitution ("Teste é Parte da Tarefa", NON-NEGOTIABLE) e o
pedido original exigem teste para toda lógica nova.

**Organization**: Tarefas agrupadas por user story do spec.md, em ordem de prioridade (P1 → P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1–US4, mapeando o spec.md
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Single project (ver plan.md): `src/store/sqlite/`, `src/store/`, `src/agents/`, `src/domain/`, `src/cli/`.
Testes co-locados como `*.test.ts` ao lado do código-fonte, padrão já usado no repo.

---

## Phase 1: Setup

**Purpose**: preparar a estrutura de arquivos do novo adaptador antes de qualquer lógica.

- [X] T001 Criar `src/store/sqlite/` com `schema.ts`, `sqlite-ops-store.ts`, `seed.ts` (arquivos vazios/esqueleto exportando os símbolos que as fases seguintes vão preencher)

**Nota**: `data/` já está em `.gitignore` (confirmado na fase de constitution) — nenhuma tarefa necessária.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: extensões de domínio e de porta que TODAS as user stories dependem.

**⚠️ CRITICAL**: nenhuma user story pode começar antes desta fase estar completa.

- [X] T002 Estender `Incident` com `resolvedAt: string | null` e `summary: string | null`, e adicionar o tipo `Runbook` em `src/domain/types.ts` (ver data-model.md)
- [X] T003 Estender a porta `OpsStore` em `src/store/port.ts` com `listIncidents(filter?: "open" | "resolved" | "all")` e `getRunbook(serviceId: string): Promise<Runbook | undefined>` (exportar `IncidentListFilter`)
- [X] T004 [P] Ajustar `SEED_SERVICES`/`SEED_ALERTS` em `src/store/seed-data.ts` para os 5 serviços referenciados pelos alertas do cenário Mercadinho (remover `catalog-service`, não referenciado por nenhum alerta) e adicionar `SEED_RUNBOOKS` (checkout-api, payments-worker, auth-service)
- [X] T005 [P] Implementar DDL idempotente das 4 tabelas (`services`, `alerts`, `incidents`, `runbooks`) com `CHECK` de domínio fechado em `src/store/sqlite/schema.ts` (ver contracts/schema.sql), gerando as listas do `CHECK` a partir de `SEVERITIES`/`ALERT_STATUSES`/`INCIDENT_STATUSES` de `src/domain/types.ts`
- [X] T006 Atualizar `MemoryOpsStore` em `src/store/memory.ts` para implementar `listIncidents` e `getRunbook` (paridade de contrato com a porta estendida; depende de T002, T003, T004)

**Checkpoint**: domínio, porta e schema prontos — user stories podem começar.

---

## Phase 3: User Story 1 - Incidente sobrevive a reinício (Priority: P1) 🎯 MVP

**Goal**: incidentes abertos via `SqliteOpsStore` continuam existindo e corretos depois que o
processo é reiniciado.

**Independent Test**: abrir um incidente com uma instância do store apontando para um arquivo,
descartar a instância, abrir uma nova instância apontando para o mesmo arquivo, e confirmar via
`getIncident`/`listAlerts`/`listServices` que os dados persistiram.

### Tests for User Story 1 ⚠️

- [X] T007 [P] [US1] Teste: duas instâncias sucessivas de `SqliteOpsStore` sobre o mesmo arquivo temporário preservam serviços/alertas/incidentes entre si (simula reinício) em `src/store/sqlite/sqlite-ops-store.test.ts`
- [X] T008 [P] [US1] Teste: `openIncident` para serviço inexistente lança `ServiceNotFoundError`; `resolveIncident` para id inexistente lança `IncidentNotFoundError`; resolver duas vezes lança `IncidentAlreadyResolvedError` — sobre `SqliteOpsStore(":memory:")`, em `src/store/sqlite/sqlite-ops-store.test.ts`
- [X] T009 [P] [US1] Teste: inserir diretamente uma linha com `severity`/`status` fora do domínio em `incidents` e `alerts` sobre `SqliteOpsStore(":memory:")` lança erro de `CHECK` em `src/store/sqlite/schema.test.ts`

### Implementation for User Story 1

- [X] T010 [US1] Implementar construtor de `SqliteOpsStore` em `src/store/sqlite/sqlite-ops-store.ts`: resolve caminho via `OPSPILOT_DB` (default `./data/opspilot.db`) ou parâmetro explícito (para `":memory:"` em testes), abre `DatabaseSync`, roda a DDL de `schema.ts`
- [X] T011 [US1] Implementar `listServices` e `listAlerts` com prepared statements (`db.prepare(...).all(...)`) em `src/store/sqlite/sqlite-ops-store.ts` (depende de T010)
- [X] T012 [US1] Implementar `openIncident` (prepared statement `INSERT`, `ServiceNotFoundError` se o serviço não existir, id sequencial `inc-N`) em `src/store/sqlite/sqlite-ops-store.ts` (depende de T010)
- [X] T013 [US1] Implementar `resolveIncident` (prepared statement `UPDATE` setando `status`, `resolved_at`; `IncidentNotFoundError`/`IncidentAlreadyResolvedError`) em `src/store/sqlite/sqlite-ops-store.ts` (depende de T010)
- [X] T014 [US1] Implementar `getIncident` (prepared statement `SELECT` por id) em `src/store/sqlite/sqlite-ops-store.ts` (depende de T010)
- [X] T015 [US1] Adicionar opção `sqlite` ao enum `store` de `src/cli/args.ts` e ao `makeStore` de `src/arena.ts` (import dinâmico de `SqliteOpsStore`, mesmo padrão já usado para `createSequelizeStore`), tornando-a o adaptador real usado fora de testes/bench

**Checkpoint**: US1 completa e testável de forma independente — incidentes reais sobrevivem a reinício.

---

## Phase 4: User Story 2 - Listar e filtrar incidentes (Priority: P1)

**Goal**: o plantonista lista incidentes por status (abertos por padrão, resolvidos, ou todos).

**Independent Test**: popular incidentes abertos e resolvidos, chamar `list_incidents` sem filtro
(espera só abertos), com `resolved` (espera só resolvidos) e com `all` (espera todos).

### Tests for User Story 2 ⚠️

- [X] T016 [P] [US2] Teste: `listIncidents()` sem filtro devolve só abertos; `listIncidents("resolved")` devolve só resolvidos com `resolvedAt`/`summary` preenchidos; `listIncidents("all")` devolve todos, ordenado por `id` — sobre `SqliteOpsStore(":memory:")`, em `src/store/sqlite/sqlite-ops-store.test.ts`
- [X] T017 [P] [US2] Teste equivalente de `listIncidents` sobre `MemoryOpsStore` em `src/store/memory.test.ts`
- [X] T018 [P] [US2] Teste da tool `list_incidents` (status padrão, `resolved`, `all`) via `makeTools` em `src/agents/tools.test.ts`

### Implementation for User Story 2

- [X] T019 [US2] Implementar `listIncidents(filter)` com prepared statement (`WHERE status = ?` quando `open`/`resolved`, sem `WHERE` quando `all`) em `src/store/sqlite/sqlite-ops-store.ts` (depende de T010, T003)
- [X] T020 [US2] Adicionar `listIncidentsSchema` e a tool `list_incidents` em `src/agents/tools.ts`, seguindo o contrato de contracts/tools.md (descrição de quando usar, `.describe()` no campo `status`, default `"open"`)

**Checkpoint**: US1 + US2 funcionam juntas — histórico de incidentes consultável e filtrável.

---

## Phase 5: User Story 3 - Consultar runbook de um serviço (Priority: P2)

**Goal**: o plantonista consulta os passos de resposta de um serviço, com resposta clara quando não
há runbook cadastrado.

**Independent Test**: consultar runbook de um serviço com runbook (espera conteúdo), de um serviço
sem runbook (espera aviso de ausência, não erro) e de um serviço inexistente (espera erro de domínio).

### Tests for User Story 3 ⚠️

- [X] T021 [P] [US3] Teste: `getRunbook` devolve o conteúdo para um serviço com runbook, `undefined` para serviço sem runbook, e lança `ServiceNotFoundError` para serviço inexistente — sobre `SqliteOpsStore(":memory:")`, em `src/store/sqlite/sqlite-ops-store.test.ts`
- [X] T022 [P] [US3] Teste equivalente de `getRunbook` sobre `MemoryOpsStore` em `src/store/memory.test.ts`
- [X] T023 [P] [US3] Teste da tool `consultar_runbook` (encontrado, ausente, serviço inexistente) via `makeTools` em `src/agents/tools.test.ts`

### Implementation for User Story 3

- [X] T024 [US3] Implementar `getRunbook(serviceId)` com prepared statements (`SELECT` em `services` para validar existência, `SELECT` em `runbooks` para o conteúdo) em `src/store/sqlite/sqlite-ops-store.ts` (depende de T010, T003)
- [X] T025 [US3] Implementar `getRunbook` em `src/store/memory.ts` (mesma semântica: `undefined` sem runbook, `ServiceNotFoundError` sem serviço) (depende de T006)
- [X] T026 [US3] Adicionar `consultarRunbookSchema` e a tool `consultar_runbook` em `src/agents/tools.ts`, seguindo o contrato de contracts/tools.md

**Checkpoint**: US1 + US2 + US3 funcionam juntas — runbooks consultáveis pelo agente.

---

## Phase 6: User Story 4 - Seed idempotente do cenário Mercadinho (Priority: P2)

**Goal**: um armazenamento novo já nasce com o cenário Mercadinho completo; reiniciar sobre o mesmo
armazenamento nunca duplica os dados.

**Independent Test**: abrir `SqliteOpsStore(":memory:")` novo e conferir 5 serviços/6 alertas (3
firing/3 resolved)/3 runbooks; instanciar novamente sobre o mesmo arquivo/conexão populada e
conferir que a contagem não muda.

### Tests for User Story 4 ⚠️

- [X] T027 [P] [US4] Teste: `SqliteOpsStore(":memory:")` novo populado com 5 serviços, 6 alertas (3 `firing`/3 `resolved`) e 3 runbooks (checkout-api, payments-worker, auth-service) em `src/store/sqlite/seed.test.ts`
- [X] T028 [P] [US4] Teste: rodar o seed duas vezes sobre o mesmo arquivo (via duas instâncias de `SqliteOpsStore` no mesmo caminho temporário) não duplica linhas em nenhuma das 4 tabelas em `src/store/sqlite/seed.test.ts`

### Implementation for User Story 4

- [X] T029 [US4] Implementar `seedIfEmpty(db)` em `src/store/sqlite/seed.ts`: quando `services` está vazia, insere `SEED_SERVICES`/`SEED_ALERTS`/`SEED_RUNBOOKS` com `INSERT OR IGNORE` por chave primária (depende de T004, T005)
- [X] T030 [US4] Chamar `seedIfEmpty` no construtor de `SqliteOpsStore`, depois da DDL, em `src/store/sqlite/sqlite-ops-store.ts` (depende de T010, T029)

**Checkpoint**: todas as user stories completas — cenário de demonstração pronto out-of-the-box.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: dívida explícita do pedido original e validação final.

- [X] T031 [P] Revisar as descrições de `list_alerts`, `open_incident`, `resolve_incident` em `src/agents/tools.ts` pelas 6 regras do projeto: quando usar cada tool, `.describe()` em todo campo do schema Zod (`status`, `title`, `service`, `severity`, `id`), e citar os valores do enum na descrição
- [X] T032 Rodar `npm run typecheck` e `npm test` e confirmar suíte verde, incluindo `src/agents/tools.test.ts` agora também parametrizado sobre `SqliteOpsStore(":memory:")`
- [X] T033 Executar o roteiro manual de `quickstart.md` (persistência entre reinícios reais via `npm run arena -- --store sqlite`, seed idempotente, `consultar_runbook`) e confirmar os resultados esperados

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **US1 (Phase 3)**: depende só do Foundational
- **US2 (Phase 4)**: depende do Foundational e de T010 (construtor do store, feito em US1) — na prática, roda depois de US1 estar com o construtor pronto
- **US3 (Phase 5)**: mesma dependência de T010 que US2; independente de US2
- **US4 (Phase 6)**: depende de T004/T005 (Foundational) e T010 (US1); independente de US2/US3
- **Polish (Phase 7)**: depende de todas as user stories desejadas estarem completas

### Parallel Opportunities

- T004 e T005 (Foundational) são paralelos entre si
- Dentro de cada user story, as tarefas marcadas `[P]` (tipicamente os testes, que tocam arquivos
  diferentes ou blocos independentes do mesmo arquivo de teste) podem rodar em paralelo
- US2 e US3 podem ser implementadas em paralelo por pessoas diferentes depois que US1 (T010) estiver
  pronto — ambas só dependem do construtor do `SqliteOpsStore`, não uma da outra
- US4 pode começar em paralelo com US2/US3 assim que T004/T005/T010 estiverem prontos

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1)
2. **Parar e validar**: rodar T007–T009, confirmar incidentes sobrevivendo a reinício
3. Nesse ponto já existe o núcleo pedido: persistência real via `SqliteOpsStore`

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → incidentes duráveis (MVP)
3. US2 → listagem/filtro de incidentes
4. US3 → consulta de runbook
5. US4 → seed automático do cenário Mercadinho
6. Polish → revisão de descrições das tools + validação end-to-end

Cada etapa entrega valor sem quebrar a anterior; a ordem acima segue a prioridade P1 → P2 do spec.md.
