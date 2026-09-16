---

description: "Task list template for feature implementation"
---

# Tasks: Trace Persistido e Logs Estruturados

**Input**: Design documents from `/specs/015-trace-persistido-logs/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/http-api.md](./contracts/http-api.md), [quickstart.md](./quickstart.md)

**Tests**: Incluídos e obrigatórios — Constitution IV ("Teste é Parte da Tarefa (NON-NEGOTIABLE)": nenhuma lógica nova entra sem teste; `typecheck`/`test` verdes antes de seguir).

**Organization**: Tarefas agrupadas por história de usuário (spec.md) para permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: A qual história de usuário a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto único (`src/` na raiz do repositório), conforme `plan.md` → Project Structure.

---

## Phase 1: Setup

**Purpose**: Preparar os arquivos novos vazios para que as tarefas seguintes só precisem preencher conteúdo. Sem dependência nova (mesma stack já usada no repo — ver plan.md → Technical Context).

- [X] T001 [P] Criar arquivo vazio `src/obs/logger.ts`
- [X] T002 [P] Criar arquivo vazio `src/store/request-trace-port.ts`
- [X] T003 [P] Criar arquivo vazio `src/store/sqlite/request-trace-schema.ts`
- [X] T004 [P] Criar arquivo vazio `src/store/sqlite/sqlite-request-trace-store.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura de persistência e erro de domínio usada por todas as histórias (US1 e US2 dependem diretamente da store; US3 depende do mesmo evento de trace já disponível).

**⚠️ CRITICAL**: Nenhuma história de usuário pode começar antes desta fase estar completa.

- [X] T005 [P] Adicionar `RequestNotFoundError` (classe de erro de domínio, FR-007) em `src/domain/errors.ts`, seguindo o padrão de `UnknownStrategyError` já existente no arquivo
- [X] T006 [P] Implementar `ensureRequestTraceSchema(db: DatabaseSync)` em `src/store/sqlite/request-trace-schema.ts` com o DDL idempotente (`CREATE TABLE IF NOT EXISTS`) das tabelas `requests` e `trace_events` conforme `data-model.md` (incluindo `CHECK` de `status` e índice único `(request_id, seq)`), no padrão de `conversation-schema.ts`
- [X] T007 Definir a interface `RequestTraceStore` em `src/store/request-trace-port.ts` (métodos: `startRequest`, `finishRequest`, `appendTraceEvents`, `getRequestWithTrace`), no padrão de `src/store/conversation-port.ts`
- [X] T008 Implementar `SqliteRequestTraceStore` em `src/store/sqlite/sqlite-request-trace-store.ts`, implementando `RequestTraceStore` sobre `DatabaseSync` com prepared statements (usa `ensureRequestTraceSchema` de T006), no padrão de `SqliteConversationStore` (depende de T006, T007)
- [X] T009 [P] Adicionar `requestIdParamSchema` (Zod, string não vazia) em `src/http/schemas.ts` para validar `:id` de `GET /requests/:id`, no padrão de `forgetQuerySchema`
- [X] T010 [P] Escrever testes de `SqliteRequestTraceStore` em `src/store/sqlite/sqlite-request-trace-store.test.ts` (banco `:memory:`): grava uma requisição + eventos de trace fora de ordem de inserção e confirma leitura ordenada por `seq`; confirma que `getRequestWithTrace` retorna `undefined`/equivalente para id inexistente (depende de T008)

**Checkpoint**: Store, schema, port e erro de domínio prontos — implementação das histórias de usuário pode começar.

---

## Phase 3: User Story 1 - Correlacionar uma requisição do início ao fim (Priority: P1) 🎯 MVP

**Goal**: Toda resposta de `POST /chat` carrega um `requestId` (corpo + header `X-Request-Id`); `GET /requests/:id` recupera o registro da requisição e seu trace ordenado; ids desconhecidos retornam 404.

**Independent Test**: Enviar uma requisição a `POST /chat`, capturar o `requestId` do corpo/header, consultar `GET /requests/<id>` e confirmar que os dados retornados são consistentes; consultar um id inexistente e confirmar 404 (cenários 1 do `quickstart.md`).

### Tests for User Story 1

- [X] T011 [P] [US1] Escrever testes em `src/http/server.test.ts`: header `X-Request-Id` presente e igual ao `requestId` do corpo em resposta de sucesso de `POST /chat`; `GET /requests/:id` retorna 200 com o registro da requisição depois que o chat concluir; `GET /requests/:id` com id inexistente retorna 404

### Implementation for User Story 1

- [X] T012 [US1] Gerar `requestId` (`randomUUID()`) no início do handler `POST /chat` em `src/http/server.ts` e incluir o header `X-Request-Id` e o campo `requestId` no corpo em **todas** as respostas do handler (200, 400, 422, 500, 504), conforme `contracts/http-api.md`
- [X] T013 [US1] Persistir o início da requisição (`RequestTraceStore.startRequest`) e, ao concluir (sucesso, erro ou timeout), finalizar o registro com as métricas de `StrategyRun.metrics` (`RequestTraceStore.finishRequest`) dentro do bloco fire-and-forget já existente em `src/http/server.ts` (mesmo padrão de `reflectLearning`/`updateHistorySummary`; falha nunca deve propagar para a resposta já enviada — research.md §5) (depende de T008, T012)
- [X] T014 [US1] Persistir os eventos de `StrategyRun.trace` via `RequestTraceStore.appendTraceEvents`, preservando a posição (`seq`) de cada evento no array, no mesmo bloco fire-and-forget de T013 (depende de T013)
- [X] T015 [US1] Implementar a rota `GET /requests/:id` em `src/http/server.ts`: validar `:id` com `requestIdParamSchema` (T009), consultar `RequestTraceStore.getRequestWithTrace`, responder 404 com `{ error: "requisição não encontrada" }` quando ausente (`RequestNotFoundError`, T005) e 200 com `{ request, trace }` (trace ordenado por `seq`) conforme `contracts/http-api.md` (depende de T008, T009, T005)

**Checkpoint**: US1 completa e testável de forma independente — correlação ponta a ponta funcionando.

---

## Phase 4: User Story 2 - Inspecionar as etapas internas de processamento (Priority: P2)

**Goal**: Cada evento do trace de uma requisição é recuperável individualmente, identificado pela etapa (nó) e com os dados de entrada/saída associados, na ordem correta.

**Independent Test**: Processar uma requisição que gere múltiplos tipos de evento (ex.: `action` + `observation`) e, ao consultar `GET /requests/:id`, confirmar que cada evento aparece separado, com `node` correto e o payload original (`args`/`result`) preservado, na ordem certa (cenário 2 do `quickstart.md`).

### Tests for User Story 2

- [X] T016 [P] [US2] Escrever teste em `src/store/sqlite/sqlite-request-trace-store.test.ts` (ou `server.test.ts`, cobrindo via HTTP) que persiste uma sequência de `TraceEvent` de tipos variados (`thought`, `action`, `observation`) e confirma que a leitura devolve `node` derivado corretamente de cada `type` e o evento original completo (`args`, `result`, etc.) sem perda de dados

### Implementation for User Story 2

- [X] T017 [US2] Em `src/store/sqlite/sqlite-request-trace-store.ts`, derivar a coluna `node` a partir de `TraceEvent.type` e serializar o `TraceEvent` completo em `payload` (`JSON.stringify`), garantindo reconstrução fiel do evento original na leitura (depende de T008; refina T014)
- [X] T018 [US2] Ajustar a resposta de `GET /requests/:id` em `src/http/server.ts` para incluir, por item do trace, `seq`, `node`, `event` (TraceEvent reconstruído) e `createdAt`, conforme o formato de `contracts/http-api.md` (depende de T015, T017)

**Checkpoint**: US1 e US2 funcionam de forma independente — inspeção detalhada de cada etapa disponível.

---

## Phase 5: User Story 3 - Monitorar a saúde do sistema via logs operacionais (Priority: P3)

**Goal**: Cada evento relevante de processamento gera uma linha de log JSON enxuta (apenas metadados), emitida em tempo real via stdout.

**Independent Test**: Processar uma requisição e confirmar, na saída padrão do processo, uma linha JSON por evento do trace, contendo apenas `requestId`, `node`, `seq`, `status`, `ts` — sem os payloads completos (cenário 3 do `quickstart.md`).

### Tests for User Story 3

- [X] T019 [P] [US3] Escrever testes em `src/obs/logger.test.ts`: `formatLogLine` produz uma linha JSON válida contendo exatamente `requestId`, `node`, `seq`, `status`, `ts`; para eventos de tipos diferentes (`action`, `observation` com `ok:false`, etc.) `status` reflete corretamente sucesso/erro; nenhum campo de payload (`text`, `args`, `result`, `steps`) aparece na saída

### Implementation for User Story 3

- [X] T020 [P] [US3] Implementar `formatLogLine(event): string` (função pura) em `src/obs/logger.ts`, montando o `LogLine` (`requestId`, `node`, `seq`, `status`, `ts`) a partir de um `TraceEvent` e seus metadados de contexto, conforme `data-model.md` (Constitution VI: pura, sem I/O)
- [X] T021 [US3] Implementar `logEvent(event)` em `src/obs/logger.ts`, um wrapper fino de efeito colateral que escreve o resultado de `formatLogLine` em `stdout` (`console.log`) (depende de T020)
- [X] T022 [US3] Chamar `logEvent` para cada evento de `StrategyRun.trace` dentro do mesmo bloco fire-and-forget de T014, em paralelo à persistência em `trace_events`, em `src/http/server.ts` (depende de T014, T021)

**Checkpoint**: Todas as três histórias funcionam de forma independente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validação final cruzando as três histórias.

- [X] T023 Rodar `npm run typecheck` e `npm test` na raiz do projeto e corrigir quaisquer falhas remanescentes
- [X] T024 Executar manualmente os três cenários de `quickstart.md` contra o servidor local (`npm run http`) e confirmar os resultados esperados

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende da conclusão do Setup — bloqueia todas as histórias
- **User Stories (Phase 3-5)**: todas dependem da conclusão da Foundational
  - US1 (P1) é a base funcional mínima (MVP)
  - US2 (P2) refina o mesmo caminho de dados que US1 já persiste (T017/T018 dependem de T014/T015 de US1)
  - US3 (P3) é aditiva ao mesmo bloco fire-and-forget de US1 (T022 depende de T014), mas seu código (`obs/logger.ts`) é isolado e pode ser desenvolvido em paralelo a US2
- **Polish (Phase 6)**: depende de todas as histórias desejadas estarem completas

### User Story Dependencies

- **US1 (P1)**: depende apenas da Foundational — nenhuma dependência de outra história
- **US2 (P2)**: depende da Foundational e reaproveita o ponto de integração criado em US1 (T014/T015) — não pode ser validada isoladamente sem US1 já persistindo trace, mas é uma história de teste/entrega separada (refina o que já existe)
- **US3 (P3)**: depende da Foundational e do ponto de integração de US1 (T014) para saber quando emitir logs; `src/obs/logger.ts` em si (T020/T021) é independente e pode ser implementado em paralelo a US2

### Within Each User Story

- Testes escritos antes da implementação correspondente, e devem falhar antes dela existir
- Store/schema antes de rotas HTTP
- História completa e com testes verdes antes de avançar para a próxima prioridade

### Parallel Opportunities

- T001-T004 (Setup) em paralelo
- T005, T006, T009 (Foundational, arquivos diferentes) em paralelo; T007→T008 é sequencial (port antes do adaptador); T010 depois de T008
- T011 (testes US1) pode ser escrito em paralelo a T012-T015 (mas deve falhar antes deles passarem)
- T020/T021 (US3, `src/obs/logger.ts`) podem ser feitos em paralelo a T017/T018 (US2, store/rota) — arquivos diferentes

---

## Parallel Example: Foundational

```bash
# Em paralelo (arquivos diferentes):
Task: "Adicionar RequestNotFoundError em src/domain/errors.ts"                 # T005
Task: "Implementar ensureRequestTraceSchema em src/store/sqlite/request-trace-schema.ts"  # T006
Task: "Adicionar requestIdParamSchema em src/http/schemas.ts"                  # T009

# Sequencial (mesma cadeia de dependência):
Task: "Definir RequestTraceStore em src/store/request-trace-port.ts"           # T007
Task: "Implementar SqliteRequestTraceStore em src/store/sqlite/sqlite-request-trace-store.ts"  # T008 (depende de T006, T007)
```

## Parallel Example: US2 e US3 simultâneos (após US1 completa)

```bash
# Squad A — US2 (refino de node/payload no store e na rota):
Task: "Derivar node/payload em sqlite-request-trace-store.ts"                  # T017
Task: "Ajustar resposta de GET /requests/:id"                                  # T018

# Squad B — US3 (logger, arquivo isolado):
Task: "Implementar formatLogLine em src/obs/logger.ts"                         # T020
Task: "Implementar logEvent (efeito colateral) em src/obs/logger.ts"           # T021
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloqueia todas as histórias)
3. Completar Phase 3: US1
4. **PARAR e VALIDAR**: rodar cenário 1 de `quickstart.md` e os testes de `server.test.ts`
5. Nesse ponto já há correlação ponta a ponta funcional (`requestId` + `GET /requests/:id`)

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → testar independentemente → MVP entregável (correlação básica)
3. US2 → testar independentemente → inspeção detalhada de etapas disponível
4. US3 → testar independentemente → logs operacionais em tempo real disponíveis
5. Cada história soma valor sem quebrar as anteriores

---

## Notes

- [P] = arquivos diferentes, sem dependência entre si
- Rótulo [Story] mapeia a tarefa à história de usuário correspondente (rastreabilidade)
- Testes devem falhar antes da implementação correspondente existir (Constitution IV)
- Commit após cada tarefa ou grupo lógico de tarefas
- Parar em qualquer checkpoint para validar a história isoladamente
