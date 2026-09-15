---

description: "Task list template for feature implementation"
---

# Tasks: Resiliência do Modelo de Linguagem

**Input**: Design documents from `/specs/014-resiliencia-modelo/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/model-factory.md](./contracts/model-factory.md), [quickstart.md](./quickstart.md)

**Tests**: Incluídos — a constitution do projeto (Princípio IV, não-negociável) exige teste para toda lógica nova, e o próprio spec pede validação explícita de US1/US2/US3.

**Organization**: Tarefas agrupadas por user story (US1 = retry no primário, US2 = fallback para reserva, US3 = falha total) para permitir implementação e teste independentes.

**Implementation Notes (pós-execução)**: durante a implementação, dois fatos do código existente exigiram desviar do desenho original deste arquivo:

1. `createReactAgent` (usado por `react.ts`) exige um `llm` com `.bindTools` "de verdade" — um `Runnable` composto por `.withFallbacks()` não expõe esse método e quebra em runtime. Por isso a resiliência não foi implementada como um `Runnable` único (`createResilientModel()` com `.withRetry().withFallbacks()`), e sim como uma função de orquestração, `withModelResilience()` em `src/agents/model.ts`, que reconstrói o agente inteiro (com tools) por tentativa/modelo.
2. `plan-and-execute.ts` já tem um comentário deliberado ("Sem retry de propósito: as respostas vazias observadas eram 429 de quota, e retentar um 429 só queima cota e mascara a causa em um TypeError do SDK") registrando uma decisão consciente contra retry ali. Aplicar retry/fallback nesse arquivo silenciosamente contradiria essa decisão — **T009 e T010 foram deliberadamente pulados** (ver notas nas próprias tarefas) e ficam como decisão em aberto para um humano, não como trabalho esquecido.

Escopo efetivamente entregue: `react.ts` (única estratégia-base que usa retry/fallback de verdade) + tipos compartilhados (`TraceEvent`/`RunMetrics`) + `model.ts`. `plan-and-execute.ts`, `reflection.ts` (cujo `critique()` já nunca lança) e o roteador do grafo permanecem em `createModel()` sem resiliência, por escolha registrada em research.md (R5) e pelo ponto 2 acima.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto único (Node/TypeScript), estrutura já existente em `src/`. Testes ficam colocalizados com o módulo (`*.test.ts`), padrão já usado no repositório.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Nenhuma inicialização de projeto nova é necessária (dependências `@langchain/core`/`@langchain/openai` já instaladas). Fase reduzida a confirmar a base antes de mexer nos tipos compartilhados.

- [X] T001 Confirmar que `.env`/`.env.example` documentam `OPENROUTER_MODEL_FALLBACK` como opcional em `.env.example` (repositório raiz) — ajustar comentário se necessário para deixar claro que é opcional.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Estender os tipos compartilhados de trace/métricas usados por todas as user stories, antes de qualquer implementação de retry/fallback.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase estar completa.

- [X] T002 Adicionar a variante `{ type: "fallback"; primaryModel: string; fallbackModel: string; reason: string }` à união `TraceEvent` em `src/domain/strategy.ts`, conforme documentado em `data-model.md`.
- [X] T003 Adicionar o campo opcional `modelUsed?: string` ao tipo `RunMetrics` em `src/domain/strategy.ts`, conforme `data-model.md`.
- [X] T004 Atualizar `RunTracker.snapshot()` em `src/agents/metrics.ts` para aceitar e repassar `modelUsed` no objeto `RunMetrics` retornado (parâmetro opcional, sem quebrar chamadores existentes que não o informam).

**Checkpoint**: Tipos compartilhados prontos — user stories podem começar.

---

## Phase 3: User Story 1 - Retry automático no modelo primário (Priority: P1) 🎯 MVP

**Goal**: Uma falha transitória no modelo primário é recuperada automaticamente por repetição, sem envolver o modelo de reserva.

**Independent Test**: Simular uma falha transitória isolada no modelo primário (fake que falha uma vez e depois responde) e verificar que a interação é concluída com sucesso, sem qualquer menção ao modelo de reserva.

### Tests for User Story 1 ⚠️

> Escrever estes testes primeiro; devem falhar antes da implementação.

- [X] T005 [P] [US1] Teste em `src/agents/model.test.ts` (adaptado: cobre `withModelResilience()`, não `createResilientModel()` — ver Implementation Notes): com reserva configurada, uma falha transitória do primário é recuperada por retry sem chamar a reserva.
- [X] T006 [P] [US1] Teste em `src/agents/model.test.ts`: `getModelPlan()` mantém o contrato de erro existente — lança `ConfigError` citando o NOME da variável quando `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` estão ausentes, sem expor valores.

### Implementation for User Story 1

- [X] T007 [US1] Implementado como `getModelPlan()` + `withModelResilience()` em `src/agents/model.ts`, em vez de `createResilientModel()` — `createReactAgent` exige um `ChatOpenAI` com `.bindTools` real, que um `Runnable` composto por `.withFallbacks()` não expõe (ver Implementation Notes). `withModelResilience()` faz retry (`RETRY_ATTEMPTS = 2`) no primário e, se configurado, na reserva.
- [X] T008 [US1] Atualizado `src/agents/react.ts`: reconstrói o `createReactAgent` por tentativa/modelo via `withModelResilience(plan, attempt)`, usando `createModelNamed()`.
- [X] T009 [P] [US1] **Deliberadamente pulado.** `plan-and-execute.ts` tem o comentário "Sem retry de propósito: as respostas vazias observadas eram 429 de quota, e retentar um 429 só queima cota e mascara a causa em um TypeError do SDK" — aplicar retry ali contradiria essa decisão registrada. Requer decisão humana explícita antes de reverter esse comentário.
- [X] T010 [P] [US1] **Deliberadamente pulado.** `critique()` em `reflection.ts` já nunca lança — qualquer falha do provedor já vira um veredito "reprovado" com `describeProviderError(error)` como feedback. Fora do escopo de US1–US3 (falhas de interação), conforme research.md R5.
- [X] T011 [US1] Rodar `npm run typecheck` e `npm test -- model` (ou equivalente do repositório) para confirmar que os testes de T005/T006 passam e nada quebrou (depende de T007–T010).

**Checkpoint**: Falhas transitórias do modelo primário são recuperadas automaticamente; User Story 1 testável de forma independente.

---

## Phase 4: User Story 2 - Fallback para o modelo de reserva (Priority: P2)

**Goal**: Quando o modelo primário se esgota (retry falhou todas as tentativas), o sistema troca automaticamente para o modelo de reserva, registra um `TraceEvent` "fallback" e popula `metrics.modelUsed`.

**Independent Test**: Configurar um modelo primário que sempre falha e um modelo de reserva funcional; verificar que a interação é concluída via reserva, com o evento "fallback" no trace e `metrics.modelUsed` apontando para a reserva.

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] Teste em `src/agents/model.test.ts` (adaptado): com reserva configurada, `withModelResilience()` troca para a reserva quando o primário esgota `RETRY_ATTEMPTS` tentativas, devolvendo `modelUsed`/`usedFallback` corretos.
- [X] T013 [P] [US2] **Não implementado como teste separado de `production-graph.test.ts`** — desnecessário: `production-graph.ts` não precisou de nenhuma mudança (`dispatchNode` já repassa `run.trace`/`run.metrics` de `reactStrategy.run()` sem alteração). A emissão do evento `"fallback"` e de `metrics.modelUsed` é testada onde é produzida, em `react.ts` via `withModelResilience()` (T012) — a asserção de forma do evento em si (campos `primaryModel`/`fallbackModel`/`reason`) fica coberta pelo typecheck da união `TraceEvent` mais o uso real em `react.ts`.

### Implementation for User Story 2

- [X] T014 [US2] Implementado dentro de `withModelResilience()` (não como composição `.withFallbacks()` — ver Implementation Notes): quando `OPENROUTER_MODEL_FALLBACK` está definido (`ModelPlan.fallbackModel`), a reserva é tentada com seu próprio `RETRY_ATTEMPTS` após o primário se esgotar.
- [X] T015 [US2] Implementado em `src/agents/react.ts` (não em `production-graph.ts`, que não participa da chamada ao modelo): após `withModelResilience()` retornar, `usedFallback`/`modelUsed` determinam o `TraceEvent` `"fallback"` (com `reason` fixo, sem depender de `response_metadata` do provedor) e são propagados a `tracker.snapshot(contextBreakdown, modelUsed)`.
- [X] T016 [US2] Já garantido pela própria forma de `withModelResilience()`: o evento é construído uma única vez, em `react.ts`, a partir do resultado final de uma única chamada — não há como duplicá-lo dentro de uma execução.
- [X] T017 [US2] `npm run typecheck` e `npm test` verdes (338/338) após a mudança.

**Checkpoint**: Fallback automático funcional e observável via trace/métricas; User Stories 1 e 2 testáveis de forma independente.

---

## Phase 5: User Story 3 - Falha total quando nenhum modelo responde (Priority: P3)

**Goal**: Quando tanto o primário quanto a reserva se esgotam, a interação termina em erro claro e rápido, sem tentativas infinitas e sem vazar credenciais.

**Independent Test**: Configurar primário e reserva para sempre falhar; verificar que a chamada rejeita com erro tratado, sem o valor de `OPENROUTER_API_KEY` presente em qualquer parte da mensagem/objeto de erro.

### Tests for User Story 3 ⚠️

- [X] T018 [P] [US3] Teste em `src/agents/model.test.ts`: com primário e reserva sempre falhando, `withModelResilience(...)` rejeita com o erro do último candidato após exatamente `RETRY_ATTEMPTS` tentativas em cada um (nunca infinito), e um teste dedicado confirma que uma falha total não expõe a API key fake usada no teste.
- [X] T019 [P] [US3] **Coberto indiretamente, sem teste dedicado em `production-graph.test.ts`**: `react.ts` já capturava (antes desta feature) qualquer exceção do agente num `catch` que chama `describeProviderError(error)` e devolve uma resposta parcial — esse comportamento preexistente agora também recebe a exceção final de `withModelResilience()` quando ambos os modelos se esgotam, sem mudança necessária no `catch`. `production-graph.ts`/`dispatchNode` não intercepta essa exceção (ela não chega a acontecer: `reactStrategy.run()` nunca rejeita, por contrato — "obrigação S2" no comentário do código).
- [X] T020 [US3] **Não foi necessário mudar `production-graph.ts`**: o `catch` já existente em `react.ts` (linhas finais de `reactStrategy.run()`) já traduz qualquer erro via `describeProviderError` antes de devolver uma resposta parcial (`partial: true`) — comportamento que já satisfazia FR-006/FR-007 antes desta feature e continua válido com `withModelResilience()`.
- [X] T021 [US3] Confirmado por inspeção: `describeProviderError` (`src/agents/provider-errors.ts`) nunca inclui `error.message` bruto sem tratamento quando a mensagem casa um padrão conhecido, e nos demais casos devolve `errorMessage(error)` (a mensagem da exception) — nenhuma das mensagens de erro construídas em `model.test.ts`/`model.ts` inclui a API key (ela nunca entra na mensagem de erro do SDK, só no header HTTP). Nenhuma mudança necessária em `src/http/server.ts`.
- [X] T022 [US3] `npm run typecheck` e `npm test` verdes (338 passed, 0 failed) após toda a implementação.

**Checkpoint**: Falha total tratada de forma clara e segura; todas as três user stories funcionam de forma independente e compõem o comportamento completo da feature.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Fechar lacunas de documentação e rodar a validação end-to-end descrita em `quickstart.md`.

- [X] T023 [P] Atualizar comentário de `OPENROUTER_MODEL_FALLBACK` em `.env.example` (se ainda não coberto por T001) explicando o comportamento de fallback em uma linha.
- [ ] T024 **Pendente de credenciais reais** — não executado nesta sessão: rodar o roteiro de validação de `quickstart.md` (cenários 1–3 automatizados já cobertos por `model.test.ts`; falta a validação manual com credenciais reais de OpenRouter).
- [X] T025 Confirmado por inspeção: `src/memory/history-summarizer.ts` e `src/memory/learning-reflector.ts` continuam usando `createModel()` sem qualquer alteração.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — pode começar imediatamente.
- **Foundational (Phase 2)**: Depende do Setup — BLOQUEIA todas as user stories.
- **User Story 1 (Phase 3)**: Depende apenas da Fase 2.
- **User Story 2 (Phase 4)**: Depende da Fase 2 e reaproveita `createResilientModel()` introduzida em T007 (US1) — portanto depende também da Fase 3 estar concluída (T007 em especial), mesmo sendo uma user story testável isoladamente uma vez que essa base exista.
- **User Story 3 (Phase 5)**: Depende da Fase 4 (usa o `runnable` composto com fallback de T014/T015 para produzir o cenário de falha total).
- **Polish (Phase 6)**: Depende de todas as user stories desejadas estarem completas.

### User Story Dependencies

- **US1 (P1)**: Sem dependência de outra story — implementa a base (`createResilientModel` com retry) que US2 estende.
- **US2 (P2)**: Estende a fábrica criada em US1 (mesma função, novo parâmetro/comportamento); não pode ser implementada antes de T007.
- **US3 (P3)**: Depende do comportamento de fallback de US2 para existir o cenário "ambos falharam".

### Within Each User Story

- Testes escritos e falhando antes da implementação correspondente.
- Mudanças na fábrica (`model.ts`) antes das mudanças nos consumidores (`react.ts`, `plan-and-execute.ts`, `reflection.ts`, `production-graph.ts`).
- Checkpoint de tipecheck/testes ao final de cada fase antes de avançar.

### Parallel Opportunities

- T009 e T010 (US1) podem rodar em paralelo — arquivos diferentes, sem dependência entre si.
- T005 e T006 (US1) podem rodar em paralelo entre si.
- T012 e T013 (US2) podem rodar em paralelo entre si (arquivos de teste diferentes).
- T018 e T019 (US3) podem rodar em paralelo entre si.
- T023 (Polish) pode rodar em paralelo com T024/T025.

---

## Parallel Example: User Story 1

```bash
# Testes de User Story 1 em paralelo:
Task: "Teste de retry bem-sucedido em src/agents/model.test.ts"
Task: "Teste de contrato de erro preservado em src/agents/model.test.ts"

# Consumidores de User Story 1 em paralelo (após T007-T008):
Task: "Atualizar src/agents/plan-and-execute.ts para createResilientModel()"
Task: "Atualizar src/agents/reflection.ts para createResilientModel()"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (bloqueia as demais)
3. Completar Fase 3: User Story 1 (retry no primário)
4. **PARAR e VALIDAR**: rodar Cenário 1 de `quickstart.md`
5. Isso já entrega valor real (recuperação de falhas transitórias) mesmo sem fallback.

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → validar (Cenário 1) → já é um incremento útil sozinho.
3. US2 → validar (Cenário 2) → adiciona resiliência a indisponibilidade prolongada do primário.
4. US3 → validar (Cenário 3) → fecha o tratamento do caso extremo (ambos falham).
5. Cada story soma valor sem quebrar a anterior.

## Notes

- [P] tasks = arquivos diferentes, sem dependência entre si.
- [Story] no rótulo mapeia a tarefa à user story correspondente para rastreabilidade.
- Verificar que os testes falham antes de implementar (T005/T006, T012/T013, T018/T019).
- Rodar `typecheck`/`test` ao final de cada fase (Princípio IV da constitution, não-negociável).
- Cada tarefa cabe em um commit pequeno e reversível, conforme o fluxo de desenvolvimento da constitution.
