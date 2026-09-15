---

description: "Task list template for feature implementation"
---

# Tasks: Medição de Consumo de Contexto

**Input**: Design documents from `/specs/010-medicao-contexto/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/context-metrics.md](./contracts/context-metrics.md), [quickstart.md](./quickstart.md)

**Tests**: Incluídos e obrigatórios — a Constitution do projeto (Princípio IV) proíbe lógica nova sem teste; `typecheck` e `test` devem ficar verdes antes de seguir.

**Organization**: Tasks agrupadas por user story (spec.md) para permitir implementação e teste independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto único (sem frontend): `src/`, testes `*.test.ts` ao lado do arquivo testado.

**Nota de design** (refinamento sobre o plan.md, para manter `contextBreakdown` testável sem depender
de rede real): a composição por fonte é montada por uma função pura compartilhada,
`buildContextBreakdown`, em `src/context/tokens.ts` — cada estratégia só passa suas quatro fontes
(história, memórias, texto de instrução fixa, pedido atual); toda a lógica de estimativa fica
unitariamente testável em `tokens.test.ts`, sem precisar de um teste de `react.ts`/`plan-and-execute.ts`
que chamaria o modelo de verdade.

---

## Phase 1: Setup

**Purpose**: nenhuma dependência nova é necessária.

- [X] T001 Confirmar que nenhuma dependência nova é necessária (`@langchain/core` já é transitivo via `@langchain/openai`); nenhuma alteração em `package.json`

**Checkpoint**: nada a instalar; segue direto para o Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o contrato compartilhado (`RunMetrics` estendido, `ContextBreakdown`) que as duas user
stories P1 (US1 e US2) precisam para compilar suas partes.

**⚠️ CRITICAL**: nenhuma user story pode ser implementada antes desta fase estar completa.

- [X] T002 Criar `src/context/tokens.ts` com o tipo `ContextBreakdown` (`{ history, memories, systemPrompt, request }`, todos `number`), conforme [data-model.md](./data-model.md) — corpo das funções ainda vazio, só o tipo
- [X] T003 Estender `RunMetrics` em `src/domain/strategy.ts`: adicionar `promptTokensReal?: number` e `contextBreakdown: ContextBreakdown` (obrigatório), conforme [contracts/context-metrics.md](./contracts/context-metrics.md)

**Checkpoint**: `npm run typecheck` falha nos usos existentes de `RunMetrics`/`snapshot()` até as
stories abaixo os atualizarem — esperado nesta fase intermediária.

---

## Phase 3: User Story 1 - Operador vê o consumo real de tokens de cada resposta (Priority: P1) 🎯 MVP

**Goal**: cada resposta do `/chat` inclui a soma real de tokens de prompt reportada pelo provedor de
linguagem em todas as chamadas da interação — ou ausência explícita quando o provedor não reporta
(spec FR-001, FR-002).

**Independent Test**: com um `LLMResult` de exemplo (sem chamar um provedor real), verificar que o
extrator de uso real soma corretamente `usage_metadata.input_tokens`, e que `RunTracker` acumula esse
valor entre múltiplas chamadas simuladas de uma mesma execução.

### Tests for User Story 1 ⚠️

- [X] T004 [P] [US1] Teste `src/context/tokens.test.ts`: `extractPromptTokens` soma `usage_metadata.input_tokens` de um `LLMResult` com uma ou mais `ChatGeneration`; devolve `undefined` quando nenhuma generation tem `usage_metadata`
- [X] T005 [P] [US1] Teste `src/agents/metrics.test.ts`: `RunTracker`, após duas chamadas simuladas via `handleLLMEnd` com uso real diferente cada, soma os dois no `promptTokensReal` do snapshot
- [X] T006 [P] [US1] Teste em `src/agents/metrics.test.ts`: `RunTracker` sem nenhuma chamada reportando uso real devolve `promptTokensReal: undefined` (nunca `0`) — FR-005
- [X] T007 [P] [US1] Teste em `src/agents/reflection.test.ts`: `runReflection` soma `promptTokensReal` de todas as tentativas (base + crítico) quando todas reportam uso
- [X] T008 [P] [US1] Teste em `src/agents/reflection.test.ts`: `runReflection` com nenhuma tentativa reportando uso real devolve `promptTokensReal: undefined` no resultado final (FR-002/FR-005)

### Implementation for User Story 1

- [X] T009 [US1] Implementar `extractPromptTokens(output: LLMResult): number | undefined` em `src/context/tokens.ts`, conforme [contracts/context-metrics.md](./contracts/context-metrics.md)
- [X] T010 [US1] Em `src/agents/metrics.ts`: `CallCounter`/`RunTracker` implementam `handleLLMEnd`, acumulando `extractPromptTokens(output)` numa soma interna e uma flag "algum uso visto"; `snapshot()` passa a devolver `promptTokensReal` (soma, ou `undefined` se a flag nunca foi setada)
- [X] T011 [US1] Em `src/agents/reflection.ts` (`runReflection`): somar `runBase.metrics.promptTokensReal` de cada tentativa (tratando `undefined` como ausente, não como 0) nos três pontos onde `RunMetrics` é montado manualmente (retorno normal, retorno por esgotamento, fallback inatingível) — resultado final é `undefined` apenas se nenhuma tentativa reportou

**Checkpoint**: User Story 1 funcional e testável de forma independente — o total real de tokens é
somado corretamente e nunca aparece como `0` quando ausente.

---

## Phase 4: User Story 2 - Operador entende de onde vem o consumo de contexto (Priority: P1)

**Goal**: cada resposta do `/chat` inclui uma composição estimada do contexto por, no mínimo, quatro
fontes (histórico, memórias, instruções fixas, mensagem atual) — sempre presente, mesmo com fontes
vazias (spec FR-003, FR-004).

**Independent Test**: chamar a função de composição com histórico e memórias vazios e com histórico e
memórias populados, e verificar que as quatro fontes são estimadas corretamente em cada caso, sem
depender de nenhuma chamada real ao modelo.

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] Teste `src/context/tokens.test.ts`: `estimateTokens("")` é `0`; `estimateTokens` de um texto de N caracteres é `Math.ceil(N/4)`
- [X] T013 [P] [US2] Teste em `src/context/tokens.test.ts`: `buildContextBreakdown` com histórico e memórias vazios devolve `history: 0` e `memories: 0`, sem erro (FR-004)
- [X] T014 [P] [US2] Teste em `src/context/tokens.test.ts`: `buildContextBreakdown` com histórico, memórias, texto de instrução e pedido populados devolve as quatro fontes com a estimativa esperada (`estimateTokens` de cada uma, história/memórias somadas por item)
- [X] T015 [P] [US2] Teste em `src/agents/reflection.test.ts`: `contextBreakdown` do resultado final de `runReflection` é igual ao `contextBreakdown` da última tentativa executada, mesmo após múltiplas tentativas reprovadas

### Implementation for User Story 2

- [X] T016 [US2] Implementar `estimateTokens(text: string): number` e `buildContextBreakdown(input: { history, memories, systemPrompt, request }): ContextBreakdown` em `src/context/tokens.ts`, conforme [contracts/context-metrics.md](./contracts/context-metrics.md) e [data-model.md](./data-model.md)
- [X] T017 [US2] Em `src/agents/react.ts`: montar `contextBreakdown` via `buildContextBreakdown({ history, memories, systemPrompt: SYSTEM_PROMPT, request: input.request })` e passar para `tracker.snapshot(contextBreakdown)`
- [X] T018 [US2] Em `src/agents/plan-and-execute.ts`: montar `contextBreakdown` via `buildContextBreakdown({ history, memories, systemPrompt: PLANNER_PROMPT + EXECUTOR_PROMPT + REPLANNER_PROMPT, request: input.request })` e passar para `tracker.snapshot(contextBreakdown)`
- [X] T019 [US2] Em `src/agents/reflection.ts` (`runReflection`): usar o `contextBreakdown` de `runBase.metrics` da **última** tentativa executada como `contextBreakdown` do `RunMetrics` final, nos três pontos onde ele é montado manualmente

**Checkpoint**: User Stories 1 e 2 funcionam juntas — toda resposta do `/chat` traz o total real (ou
ausência) e a composição estimada por fonte.

---

## Phase 5: User Story 3 - Medição de contexto nunca impede as demais métricas (Priority: P2)

**Goal**: quando o provedor não reporta uso real, o `/chat` continua respondendo normalmente, com
todas as demais métricas presentes (spec FR-005, FR-006).

**Independent Test**: simular uma execução em que nenhuma chamada ao modelo reporta uso real e
verificar que a resposta do `/chat` chega normalmente, com `contextBreakdown` presente e
`promptTokensReal` ausente — sem erro, sem 500.

### Tests for User Story 3 ⚠️

- [X] T020 [P] [US3] Teste em `src/agents/metrics.test.ts`: um `RunTracker` cujo `handleLLMEnd` nunca recebe um `LLMResult` com `usage_metadata` produz um `snapshot()` completo (`llmCalls`, `latencyMs`, `historyMessages`, `contextBreakdown`) sem lançar, com `promptTokensReal` ausente
- [X] T021 [P] [US3] Teste em `src/http/server.test.ts`: `POST /chat` com uma estratégia fake cujo `RunMetrics` não inclui `promptTokensReal` responde `200`, e o corpo JSON não contém a chave `promptTokensReal` em `metrics` (omitida, não `null`) — FR-005/FR-006
- [X] T022 [P] [US3] Teste em `src/http/server.test.ts`: `POST /chat` com uma estratégia fake cujo `RunMetrics` inclui `contextBreakdown` responde `200` com esse `contextBreakdown` propagado integralmente no corpo da resposta

### Implementation for User Story 3

- [X] T023 [US3] Revisão: confirmar que nenhum ponto de `RunTracker.snapshot()` ou das estratégias lança quando `usage_metadata` está ausente (comportamento já garantido por T009/T010 — esta tarefa é a validação explícita dos testes T020-T022, sem código novo esperado)

**Checkpoint**: as três user stories funcionam de forma independente e integrada; ausência de dado
real nunca quebra o `/chat`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: validação final e consistência com o restante do projeto.

- [X] T024 [P] Rodar `npm run typecheck` e `npm test` com todas as fases concluídas; corrigir qualquer regressão
- [X] T025 Executar o roteiro manual de [quickstart.md](./quickstart.md) (`npm run http` + `curl` + `jq '.metrics'`) para validar `promptTokensReal` e `contextBreakdown` num `/chat` real

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories (o tipo `RunMetrics`
  estendido é usado por ambas)
- **User Story 1 (Phase 3)**: depende do Foundational; independente de US2 (usa `extractPromptTokens`,
  não `estimateTokens`/`buildContextBreakdown`)
- **User Story 2 (Phase 4)**: depende do Foundational; independente de US1 (usa
  `estimateTokens`/`buildContextBreakdown`, não `extractPromptTokens`) — mas T011 (US1) e T019 (US2)
  editam o mesmo arquivo (`src/agents/reflection.ts`) em pontos diferentes da mesma função, então
  essas duas tarefas específicas devem rodar em sequência, não em paralelo, mesmo que as stories
  sejam conceitualmente independentes
- **User Story 3 (Phase 5)**: depende do Foundational e é testável majoritariamente a nível de
  `RunTracker` isolado (T020), mas seus testes de `/chat` (T021-T022) fazem mais sentido depois de
  US1/US2 existirem, para exercitar o formato final de `RunMetrics`
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas

### Within Each User Story

- Testes antes da implementação (escritos para falhar primeiro)
- `src/context/tokens.ts` (funções puras) antes de qualquer wiring em `src/agents/*`
- `react.ts`/`plan-and-execute.ts` (US2) e `reflection.ts` (US1 e US2) depois das funções de
  `tokens.ts` que consomem

### Parallel Opportunities

- T004-T008 (testes US1) podem rodar em paralelo entre si
- T012-T015 (testes US2) podem rodar em paralelo entre si
- T020-T022 (testes US3) podem rodar em paralelo entre si
- Depois do Foundational, US1 e US2 podem ser desenvolvidas em paralelo por pessoas diferentes,
  exceto pela sobreposição pontual em `reflection.ts` (T011 vs. T019 — ver nota acima)

---

## Parallel Example: User Story 1 (testes)

```bash
Task: "Teste: extractPromptTokens soma usage_metadata de múltiplas generations"
Task: "Teste: RunTracker soma uso real de duas chamadas simuladas"
Task: "Teste: RunTracker sem nenhuma chamada reportando uso devolve undefined"
Task: "Teste: runReflection soma promptTokensReal de todas as tentativas"
Task: "Teste: runReflection sem nenhum uso real devolve undefined"
```

## Parallel Example: User Story 2 (testes)

```bash
Task: "Teste: estimateTokens('') é 0 e Math.ceil(N/4) para texto de N chars"
Task: "Teste: buildContextBreakdown com fontes vazias devolve 0"
Task: "Teste: buildContextBreakdown com fontes populadas estima corretamente"
Task: "Teste: contextBreakdown final de runReflection é o da última tentativa"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloqueia todas as stories)
3. Completar Phase 3: User Story 1 (total real de tokens)
4. **PARAR e VALIDAR**: confirmar que o total real soma corretamente entre chamadas e nunca aparece
   como `0` quando ausente
5. Neste ponto, `RunMetrics.contextBreakdown` ainda precisa de um valor (o tipo é obrigatório) — as
   estratégias precisam de pelo menos um `contextBreakdown` trivial (ex.: zeros) até a US2 estar
   pronta, ou as duas stories devem ser entregues juntas antes de expor a resposta a usuários reais

### Incremental Delivery

1. Setup + Foundational → contrato de `RunMetrics` pronto
2. US1 (total real) → visibilidade de custo/consumo real por interação
3. US2 (composição por fonte) → visibilidade de onde o contexto é gasto — **US1+US2 juntas fecham a
   promessa central da spec**
4. US3 (robustez) → garante que a ausência de dado real nunca quebra o `/chat`
5. Cada story soma valor sem quebrar as anteriores

---

## Notes

- [P] tasks = arquivos/trechos diferentes, sem dependência entre si
- [Story] mapeia a tarefa à user story correspondente da spec
- Testes devem ser escritos e falhar antes da implementação (Constitution, Princípio IV)
- Cada tarefa cabe em um commit pequeno e reversível (Constitution, Fluxo de Desenvolvimento)
- Rodar `npm run typecheck` e `npm test` ao final de cada fase
