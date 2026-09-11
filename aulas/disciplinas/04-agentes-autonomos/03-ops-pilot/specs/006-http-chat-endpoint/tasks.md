---
description: "Task list template for feature implementation"
---

# Tasks: Endpoint HTTP de Chat

**Input**: Design documents from `/specs/006-http-chat-endpoint/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/post-chat.md](contracts/post-chat.md), [quickstart.md](quickstart.md)

**Tests**: Incluídos — o spec (FR-010, SC-005) e a constitution ("Teste é Parte da Tarefa", NON-NEGOTIABLE) exigem teste de integração com estratégia fake determinística, sem rede.

**Organization**: Tarefas agrupadas por user story do [spec.md](spec.md) para permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto single-project (`src/` na raiz), conforme [plan.md](plan.md). Novo módulo: `src/http/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar o diretório do novo módulo HTTP

- [X] T001 Criar o diretório `src/http/` com os arquivos vazios `server.ts`, `schemas.ts` e `server.test.ts`, seguindo a estrutura definida em [plan.md](plan.md#project-structure)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura compartilhada que TODAS as user stories precisam antes de começar

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase estar completa

- [X] T002 [P] Definir `chatRequestSchema` (Zod, `.strict()`) em `src/http/schemas.ts`: `message` (`string().min(1)`), `strategy` (`string().optional()`), `reflect` (`boolean().optional().default(false)`, sem coerção) — ver [data-model.md](data-model.md#chatrequest-entrada)
- [X] T003 [P] Criar uma estratégia fake determinística de teste (implementando `ReasoningStrategy` de `src/domain/strategy.ts`, sem chamar `createModel()`/rede) em `src/http/server.test.ts` (ou em um helper importado só pelo teste), configurável para simular sucesso rápido e execução lenta (para o cenário de timeout) — ver [research.md §5](research.md#5-estratégia-fake-determinística-para-o-teste-de-integração)
- [X] T004 Implementar a fábrica `createServer(deps)` em `src/http/server.ts`: recebe `{ strategies: Record<string, ReasoningStrategy>, store: OpsStore, timeoutMs?: number }`, monta o app Express com `express.json()`, registra a rota `POST /chat` (corpo a preencher nas fases seguintes) e um middleware central de tratamento de erro que traduz exceções não capturadas em uma resposta JSON `{ error: string }` sem vazar stack trace, sem chamar `strategy.run` ainda
- [X] T005 Implementar o bootstrap de produção (bloco `if (import.meta.url === ...)` ou função `main()`) no final de `src/http/server.ts`: instancia `SqliteOpsStore`, usa `strategies` de `src/agents/registry.ts`, lê a porta de uma variável de ambiente (default a documentar) e chama `createServer(...).listen(...)`

**Checkpoint**: Fundação pronta — as user stories podem começar

---

## Phase 3: User Story 1 - Consultar o OpsPilot via HTTP com a estratégia padrão (Priority: P1) 🎯 MVP

**Goal**: `POST /chat` com apenas `message` responde 200 com `answer`, `trace` e `metrics`, usando a estratégia `react` por padrão

**Independent Test**: Enviar `POST /chat` com `{ "message": "..." }` contra um servidor criado via `createServer({ strategies: { react: fakeStrategy }, store })` e verificar 200 com o corpo esperado

### Tests for User Story 1 ⚠️

> Escrever estes testes primeiro; devem falhar até a implementação da fase seguir

- [X] T006 [P] [US1] Teste de integração: `POST /chat` com `{ message }` retorna 200 com `answer`, `trace` e `metrics` batendo com o que a estratégia fake devolveu, em `src/http/server.test.ts`
- [X] T007 [P] [US1] Teste de integração: `POST /chat` sem `strategy` no corpo invoca a estratégia registrada como `"react"` (não qualquer outra), em `src/http/server.test.ts`

### Implementation for User Story 1

- [X] T008 [US1] No handler de `POST /chat` (`src/http/server.ts`), validar o corpo com `chatRequestSchema.safeParse`, aplicar o default `strategy = "react"` quando ausente, e resolver a estratégia em `deps.strategies` (sem tratar erro de estratégia desconhecida ainda — isso é da US2)
- [X] T009 [US1] Completar o handler para chamar `strategy.run({ request: message, maxIterations: 8, store: deps.store })` e responder 200 com `{ answer, trace, metrics }` extraídos do `StrategyRun` (passthrough, ver [contracts/post-chat.md](contracts/post-chat.md#200-ok--execução-concluída))

**Checkpoint**: User Story 1 funcional e testável isoladamente (MVP)

---

## Phase 4: User Story 2 - Escolher estratégia e ativar autocrítica (Priority: P2)

**Goal**: `strategy` e `reflect` no corpo selecionam a estratégia certa (inclusive a variante `reflect:<strategy>`); estratégia desconhecida responde 422

**Independent Test**: Enviar `POST /chat` com `strategy` e `reflect` variados contra estratégias fake registradas (incluindo uma chave `reflect:react` fake) e verificar qual foi invocada; enviar uma `strategy` inexistente e verificar 422

### Tests for User Story 2 ⚠️

- [X] T010 [P] [US2] Teste de integração: `POST /chat` com `strategy: "plan-and-execute"` e `reflect` omitido/`false` invoca a estratégia `"plan-and-execute"` (não a variante reflect), em `src/http/server.test.ts`
- [X] T011 [P] [US2] Teste de integração: `POST /chat` com `strategy: "react"` e `reflect: true` invoca a estratégia registrada como `"reflect:react"`, em `src/http/server.test.ts`
- [X] T012 [P] [US2] Teste de integração: `POST /chat` com `strategy` que não existe no catálogo responde 422 com `{ error, requested, available }`, em `src/http/server.test.ts`

### Implementation for User Story 2

- [X] T013 [US2] No handler de `POST /chat` (`src/http/server.ts`), quando `reflect === true`, resolver a chave `` `reflect:${strategy}` `` em vez de `strategy` diretamente, antes de buscar em `deps.strategies` (depende de T008)
- [X] T014 [US2] Tratar a ausência da chave resolvida em `deps.strategies` lançando/capturando `UnknownStrategyError` (`src/domain/errors.ts`, com `requested` e `available = Object.keys(deps.strategies)`) e mapeando para 422 com o corpo `{ error, requested, available }` no middleware de erro de `src/http/server.ts` (ver [contracts/post-chat.md](contracts/post-chat.md#422-unprocessable-entity--estratégia-desconhecida))

**Checkpoint**: User Stories 1 e 2 funcionam, cada uma testável isoladamente

---

## Phase 5: User Story 3 - Receber erros claros e previsíveis (Priority: P2)

**Goal**: Corpo inválido responde 400 com `issues` do zod; execução acima de 180s responde 504

**Independent Test**: Enviar corpos inválidos e verificar 400 com `issues`; usar a estratégia fake "lenta" (T003) com um `timeoutMs` de teste reduzido e verificar 504

### Tests for User Story 3 ⚠️

- [X] T015 [P] [US3] Teste de integração: `POST /chat` sem `message` (ou com tipo errado) responde 400 com `issues` não vazio, em `src/http/server.test.ts`
- [X] T016 [P] [US3] Teste de integração: `POST /chat` com `reflect: "true"` (string, não booleano) responde 400, em `src/http/server.test.ts`
- [X] T017 [P] [US3] Teste de integração: usando a estratégia fake lenta (T003) e um servidor criado com `timeoutMs` pequeno (ex.: 50ms), `POST /chat` responde 504 dentro de um prazo curto de teste, em `src/http/server.test.ts`

### Implementation for User Story 3

- [X] T018 [US3] No handler de `POST /chat` (`src/http/server.ts`), quando `chatRequestSchema.safeParse` falhar, responder 400 com `{ error: "corpo inválido", issues: result.error.issues }` antes de qualquer resolução de estratégia (depende de T008)
- [X] T019 [US3] Envolver a chamada `strategy.run(...)` (de T009) em um `Promise.race` contra um timer de `deps.timeoutMs ?? 180_000`; ao vencer o timer, responder 504 com `{ error: "tempo limite excedido (180s)" }` sem aguardar a promise da estratégia terminar, em `src/http/server.ts` (ver [research.md §4](research.md#4-timeout-de-180s-e-resposta-504))

**Checkpoint**: Todas as user stories funcionam de forma independente; contrato completo de `POST /chat` implementado

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validação final e conformidade com a constitution

- [X] T020 Rodar `npm run typecheck` e `npm test` (todos verdes, incluindo `src/http/server.test.ts` sem qualquer variável de ambiente de provedor de modelo configurada) — atende ao gate NON-NEGOTIABLE da constitution e SC-005
- [X] T021 [P] Executar manualmente os cenários de [quickstart.md](quickstart.md) (`curl` de sucesso, 400, 422) contra o servidor real (`npx tsx src/http/server.ts`), confirmando os contratos de [contracts/post-chat.md](contracts/post-chat.md)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **User Stories (Phase 3-5)**: todas dependem da Fase 2 completa
  - US1 (P1) é o MVP e não depende de US2/US3
  - US2 (P2) reaproveita o handler de US1 (T008/T009) para acrescentar resolução de `reflect` e 422 — implementar depois de US1
  - US3 (P2) reaproveita o handler de US1 (T008/T009) para acrescentar 400 e 504 — implementar depois de US1; independente de US2 (arquivos/trechos diferentes do mesmo handler, sem conflito lógico)
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas

### Within Each User Story

- Testes (T006/T007, T010-T012, T015-T017) escritos e falhando antes da implementação correspondente
- T008/T009 (US1) são pré-requisito direto de T013/T014 (US2) e de T018/T019 (US3), pois todas editam o mesmo handler em `src/http/server.ts`

### Parallel Opportunities

- T002 e T003 (Foundational) podem rodar em paralelo — arquivos diferentes
- Dentro de cada user story, as tarefas de teste marcadas [P] podem rodar em paralelo entre si (mesmo arquivo de teste, mas casos independentes — aplicar com cautela se o mesmo arquivo for editado por múltiplas mãos ao mesmo tempo)
- T020 e T021 (Polish) podem rodar em paralelo

---

## Parallel Example: User Story 1

```bash
# Testes de US1 podem ser escritos em paralelo (mesmo arquivo, casos independentes):
Task: "Teste de integração: 200 com answer/trace/metrics em src/http/server.test.ts"
Task: "Teste de integração: default strategy é react em src/http/server.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (bloqueia tudo)
3. Completar Fase 3: User Story 1
4. **Parar e validar**: rodar T006/T007 e confirmar 200 com o contrato correto
5. Este é o MVP: `POST /chat` funcional com a estratégia padrão

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. User Story 1 → validar → MVP entregável
3. User Story 2 → validar → seleção de estratégia + reflexão + 422 disponíveis
4. User Story 3 → validar → contrato de erros (400/504) completo
5. Polish → typecheck/test verdes, quickstart validado manualmente

---

## Notes

- [P] = arquivos diferentes ou trechos independentes sem dependência entre si
- [Story] mapeia a tarefa à user story correspondente do [spec.md](spec.md)
- T008/T009/T013/T014/T018/T019 editam o mesmo arquivo (`src/http/server.ts`) em trechos diferentes do mesmo handler — não marcadas [P] entre si para evitar conflito de edição, mesmo pertencendo a stories "independentes"
- Verificar que os testes falham antes de implementar cada trecho
- Commitar após cada tarefa ou grupo lógico
- Parar em cada checkpoint para validar a story isoladamente
