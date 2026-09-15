---

description: "Task list for Grafo Unificado com Roteamento Automático de Estratégia"
---

# Tasks: Grafo Unificado com Roteamento Automático de Estratégia

**Input**: Design documents from `/specs/013-grafo-unificado-roteador/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Incluídos — a constitution do projeto ("IV. Teste é Parte da Tarefa (NON-NEGOTIABLE)") exige teste para toda lógica nova, com `typecheck`/`test` verdes antes de seguir.

**Organization**: Tasks agrupadas por user story (spec.md) para permitir implementação e teste independentes de cada uma.

**Status**: Implementado. Duas decisões de design foram ajustadas durante a implementação, a pedido
do usuário, em relação ao plano original:
1. **`reflect` virou uma 3ª rota do grafo** (`ROUTE_NAMES = ["react", "plan-and-execute", "reflect"]`),
   escolhível pelo roteador junto de `react`/`plan-and-execute` — não apenas um decorator externo
   aplicado via `reflect: true` no `/chat` (esse decorator continua existindo, mas agora é ortogonal
   à rota "reflect" interna do grafo).
2. **`server.ts` usa `deps.strategies.production` apenas quando presente no catálogo injetado**: em
   implantações/testes que só registram estratégias fake (sem `"production"`), o default legado
   ("react" direto, sem grafo) é preservado — preserva 100% dos testes pré-existentes de
   `server.test.ts` (007/008/009/010/011/012) sem exigir reescrevê-los. Em produção,
   `src/agents/registry.ts` sempre registra `"production"`, então o roteamento automático é o
   caminho real em uso.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto único (backend Node/Express + CLI): código em `src/`, testes `*.test.ts` ao lado do
arquivo testado (padrão já usado em `src/agents/reflection.test.ts`, `src/http/server.test.ts`).

---

## Phase 1: Setup (Shared Infrastructure)

Nenhuma tarefa de setup é necessária: o projeto já tem `@langchain/langgraph`, `@langchain/core`,
`@langchain/openai` e `zod` instalados e em uso (`src/agents/plan-and-execute.ts`,
`src/agents/reflection.ts`). Nenhuma dependência nova, nenhuma configuração de lint/build nova.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Estrutura de dados e esqueleto do grafo que todas as user stories reaproveitam.

**⚠️ CRITICAL**: Nenhuma user story pode ser implementada antes desta fase estar completa.

- [X] T001 Adicionar o variant `route` (`{ type: "route"; route: string; reason: string; manual: boolean }`) ao union `TraceEvent` em `src/domain/strategy.ts`, com um comentário curto citando FR-003/FR-007 da spec
- [X] T002 [P] Criar `src/agents/production-graph.ts` com o schema Zod do roteador (`routeSchema = z.object({ route: z.enum([...]), reason: z.string().min(1) })`) e a constante `ROUTABLE_STRATEGIES` (nomes das estratégias-base roteáveis: `"react"`, `"plan-and-execute"`), seguindo o padrão de `verdictSchema` em `src/agents/reflection.ts`
- [X] T003 Em `src/agents/production-graph.ts`, definir `ProductionGraphState` via `Annotation.Root` (campos `input`, `overrideRoute`, `trace` com reducer de concatenação, `route`, `run`), seguindo o padrão de `PlanExecuteState` em `src/agents/plan-and-execute.ts`
- [X] T004 Em `src/agents/production-graph.ts`, implementar o nó `context` (reaproveitando `buildPromptSections`/`buildContextBreakdown` como em `src/agents/react.ts`) e o nó `respond` (fecha o resultado com `finishRun` de `src/domain/strategy.ts`), e montar o `StateGraph` com `START -> context -> ... -> respond -> END` (edges intermediárias de roteamento adicionadas em US1) (depende de T001, T003)

**Checkpoint**: Esqueleto do grafo pronto — as user stories podem ser implementadas em sequência a partir daqui.

---

## Phase 3: User Story 1 - Escolha automática da estratégia de raciocínio (Priority: P1) 🎯 MVP

**Goal**: Um pedido enviado ao `/chat` sem `strategy` explícita é processado automaticamente pela
estratégia de raciocínio mais adequada, escolhida com base no conteúdo do pedido.

**Independent Test**: Enviar uma pergunta ao `/chat` sem o campo `strategy` e verificar que uma
resposta é produzida usando uma das estratégias existentes do catálogo, sem erro.

### Tests for User Story 1 ⚠️

> Escrever estes testes primeiro; devem falhar antes da implementação.

- [X] T005 [P] [US1] Em `src/agents/production-graph.test.ts`, escrever teste: com uma função de decisão de rota injetada (fake) devolvendo `{ route: "plan-and-execute", reason: "..." }` e estratégias-base fake injetadas, `productionStrategy`-equivalente construído via função de fábrica testável retorna `answer` da estratégia-base escolhida e `metrics.llmCalls` inclui a chamada do roteador
- [X] T006 [P] [US1] Em `src/agents/production-graph.test.ts`, escrever teste: quando a função de decisão de rota injetada lança erro (simulando falha do provedor) ou devolve um `route` fora de `ROUTABLE_STRATEGIES`, o grafo cai na estratégia padrão (`"react"`) e ainda assim retorna uma resposta (`run()` nunca rejeita)

### Implementation for User Story 1

- [X] T007 [US1] Em `src/agents/production-graph.ts`, implementar o nó `router`: recebe uma função de decisão injetável (`type RouteFn = (request: string) => Promise<RouteDecision>`, default real usa `createModel().withStructuredOutput(routeSchema)` com um prompt contendo uma tabela markdown das estratégias de `ROUTABLE_STRATEGIES` e quando usar cada uma); envolve a chamada em `try/catch`; valida a saída contra `routeSchema` e contra `ROUTABLE_STRATEGIES`; em qualquer falha/saída inválida, usa fallback `{ route: "react", reason: "fallback: <motivo>" }` — nunca lança (depende de T002, T004)
- [X] T008 [US1] Em `src/agents/production-graph.ts`, adicionar ao `StateGraph` a edge condicional pós-`router` que despacha para um nó por estratégia-base (`react`, `plan-and-execute`), cada um chamando `.run(...)` da implementação já existente (`reactStrategy`/`planAndExecuteStrategy` de `src/agents/react.ts`/`src/agents/plan-and-execute.ts`) e gravando o resultado em `state.run` (depende de T007)
- [X] T009 [US1] Em `src/agents/production-graph.ts`, exportar uma função de fábrica testável (ex.: `buildProductionStrategy(routeFn?: RouteFn, baseStrategies?: Record<string, ReasoningStrategy>): ReasoningStrategy`) e `export const productionStrategy = buildProductionStrategy()` (`name: "production"`), onde `run()` executa o grafo compilado e delega ao nó `respond` (`finishRun`) para fechar `StrategyRun` (depende de T008)
- [X] T010 [US1] Registrar `productionStrategy` no catálogo em `src/agents/registry.ts` (`strategies["production"] = productionStrategy`), mantendo o comentário do arquivo atualizado para citar a nova entrada (depende de T009)
- [X] T011 [US1] Em `src/http/server.ts`, alterar a resolução de estratégia em `POST /chat`: quando `strategy` não vier no corpo, usar `productionStrategy` (ou `reflect:production` quando `reflect: true`) em vez do default fixo `"react"` (depende de T010)
- [X] T012 [US1] Validar manualmente o Cenário 1 de `quickstart.md` (roteamento automático) contra um servidor local e confirmar `npm test` verde para os arquivos tocados (depende de T011)

**Checkpoint**: Neste ponto, `/chat` sem `strategy` já escolhe e executa automaticamente uma
estratégia de raciocínio, de ponta a ponta — MVP entregável.

---

## Phase 4: User Story 2 - Visibilidade da decisão de roteamento (Priority: P2)

**Goal**: O trace de qualquer pedido processado inclui a decisão de roteamento (estratégia
escolhida e motivo) e um registro de cada etapa relevante do processamento, na ordem correta.

**Independent Test**: Enviar uma pergunta ao `/chat` sem `strategy` e inspecionar o trace
retornado, confirmando a presença e a posição do evento `route` e a ordem das demais etapas.

### Tests for User Story 2 ⚠️

- [X] T013 [P] [US2] Em `src/agents/production-graph.test.ts`, escrever teste: o `trace` retornado começa com exatamente um evento `{ type: "route", ... }` antes de qualquer evento produzido pela estratégia-base escolhida, e termina com um evento `{ type: "answer", ... }`, tanto no caminho automático quanto no caminho de fallback (cobertos em T005/T006)
- [X] T014 [P] [US2] Em `src/http/server.test.ts`, escrever teste: uma requisição `POST /chat` sem `strategy` no corpo retorna 200 com `body.trace[0]` igual a `{ type: "route", route: <string>, reason: <string não vazio>, manual: false }`

### Implementation for User Story 2

- [X] T015 [US2] Em `src/agents/production-graph.ts`, garantir que o nó `router` adiciona exatamente um evento `route` a `state.trace` antes de despachar para a estratégia-base, e que o nó `respond` concatena o trace da estratégia-base escolhida seguido do evento final `answer` (via `finishRun`), ajustando a composição de `state.trace` entre os nós conforme necessário para satisfazer T013/T014 (depende de T007–T009)
- [X] T016 [US2] Confirmar (e cobrir com teste de regressão, se ausente) que `observationsOf` em `src/agents/reflection.ts` e `formatTrace` em `src/domain/trace.ts` lidam corretamente com o novo variant `route` do `TraceEvent` — `observationsOf` deve continuar ignorando-o (filtra só `action`/`observation`) e `formatTrace` não deve quebrar ao encontrá-lo (depende de T001)

**Checkpoint**: Trace de qualquer pedido roteado automaticamente é auditável — decisão e etapas
visíveis, sem quebrar consumidores existentes do trace (`reflection.ts`, `trace.ts`).

---

## Phase 5: User Story 3 - Override manual da estratégia (Priority: P3)

**Goal**: Um pedido que informa `strategy` explicitamente no `/chat` continua sendo processado
exatamente por essa estratégia, e o trace sinaliza esse override de forma inequívoca.

**Independent Test**: Enviar uma pergunta ao `/chat` com `strategy` explícita e confirmar que essa
estratégia processou o pedido e que o trace indica override manual.

### Tests for User Story 3 ⚠️

- [X] T017 [P] [US3] Em `src/agents/production-graph.test.ts`, escrever teste: quando `input.overrideRoute` é definido com um nome válido, o grafo pula a chamada ao `RouteFn` (não invoca a função de decisão fake) e o `trace` contém `{ type: "route", route: <overrideRoute>, reason: "override manual via /chat", manual: true }`
- [X] T018 [P] [US3] Em `src/http/server.test.ts`, escrever testes de regressão/novo comportamento: (a) `POST /chat` com `strategy` desconhecida no corpo continua retornando 422 com `{ error, requested, available }` (comportamento já existente); (b) `POST /chat` com `strategy` válida retorna 200 com `body.trace[0].manual === true` e `body.trace[0].route === strategy`

### Implementation for User Story 3

- [X] T019 [US3] Em `src/agents/production-graph.ts`, no nó `router`, checar `state.input.overrideRoute` antes de chamar `RouteFn`: se presente e válido (já garantido pelo chamador), construir `RouteDecision` diretamente como `{ route: overrideRoute, reason: "override manual via /chat" }` com `manual: true`, sem chamar o modelo (depende de T007)
- [X] T020 [US3] Em `src/http/server.ts`, manter a validação atual do nome de `strategy` contra `deps.strategies` (preservando o erro 422 via `UnknownStrategyError`), e então passar o nome resolvido (`strategy` ou `reflect:${strategy}`) como `overrideRoute` na chamada a `productionStrategy.run(...)` em vez de despachar diretamente para a estratégia nomeada (depende de T011, T019)
- [X] T021 [US3] Atualizar o comentário de `strategy` em `chatRequestSchema` (`src/http/schemas.ts`) para documentar que agora é um override manual do roteamento automático (mudança apenas de comentário, sem alterar o schema)

**Checkpoint**: Todas as três user stories funcionam de forma independente e combinada — roteamento
automático, trace auditável e override manual sinalizado.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Consistência final entre documentação, contratos e comportamento observado.

- [X] T022 [P] Revisar `specs/013-grafo-unificado-roteador/contracts/production-strategy.md` e `contracts/chat-endpoint.md` contra a implementação final e corrigir qualquer divergência
- [X] T023 Executar manualmente os Cenários 1–4 de `specs/013-grafo-unificado-roteador/quickstart.md` contra um servidor local
- [X] T024 Rodar `npm run typecheck` e `npm test` no projeto inteiro e confirmar tudo verde (gate da constitution, princípio IV)
- [X] T025 [P] Atualizar o comentário de `src/agents/registry.ts` ("arena não muda") para mencionar a entrada `"production"` como a estratégia efetivamente usada por padrão em `/chat`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Nenhuma tarefa — nada bloqueia o início da Phase 2.
- **Foundational (Phase 2)**: Depende da Phase 1 (trivial). BLOQUEIA todas as user stories.
- **User Story 1 (Phase 3)**: Depende da Phase 2. Entrega o MVP (roteamento automático funcional).
- **User Story 2 (Phase 4)**: Depende da Phase 2; na prática também depende de US1 estar
  implementada (T007–T009), pois valida o trace produzido pelo grafo já roteando automaticamente.
- **User Story 3 (Phase 5)**: Depende da Phase 2; depende de US1 (T007, T011) para o nó `router` e
  a integração em `server.ts` já existirem — adiciona o caminho de override sobre eles.
- **Polish (Phase 6)**: Depende de todas as user stories desejadas estarem completas.

### User Story Dependencies

- **US1 (P1)**: Sem dependência de outra user story — é a base.
- **US2 (P2)**: Reaproveita a estrutura de US1 (router/nós), mas é uma fatia de valor separada
  (visibilidade do trace); pode ser adiada sem impedir US1 de funcionar.
- **US3 (P3)**: Reaproveita a estrutura de US1 (router node, wiring em `server.ts`); é aditiva —
  não modifica o caminho automático de US1.

### Within Each User Story

- Testes são escritos e devem falhar antes da implementação correspondente.
- `router`/nós do grafo antes de `registry.ts`/`server.ts` (implementação antes de integração).
- Cada user story termina com uma validação (`npm test` e/ou cenário de `quickstart.md`).

### Parallel Opportunities

- T002 pode rodar em paralelo com T001 (arquivos diferentes; T003/T004 dependem de ambos).
- T005 e T006 podem rodar em paralelo entre si (mesmo arquivo, mas testes independentes — aplicar
  com cuidado se editados pela mesma pessoa; independentes o suficiente para revisão paralela).
- T013 e T014 podem rodar em paralelo (arquivos diferentes: `production-graph.test.ts` vs
  `server.test.ts`).
- T017 e T018 podem rodar em paralelo (arquivos diferentes).
- T022 e T025 podem rodar em paralelo com T023/T024 (arquivos diferentes, sem dependência mútua).

---

## Parallel Example: User Story 1

```bash
# Testes de US1 (mesmo arquivo, mas cenários independentes — revisar antes de commitar juntos):
Task: "Testar decisão automática de rota em src/agents/production-graph.test.ts (T005)"
Task: "Testar fallback do roteador em src/agents/production-graph.test.ts (T006)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1 (nenhuma tarefa) e Phase 2 (Foundational).
2. Completar Phase 3 (User Story 1).
3. **Parar e validar**: `/chat` sem `strategy` funciona de ponta a ponta, escolhendo
   automaticamente entre `react`/`plan-and-execute` (Cenário 1 de `quickstart.md`).
4. Esse é o MVP: roteamento automático funcional, mesmo sem a sinalização detalhada de trace (US2)
   ou o override manual reforçado (US3) — embora T007 já produza o evento `route` básico, US2
   garante especificamente sua posição/formato auditável.

### Incremental Delivery

1. Setup + Foundational → base pronta.
2. US1 → testar independentemente → MVP entregável (roteamento automático).
3. US2 → testar independentemente → trace auditável.
4. US3 → testar independentemente → override manual preservado e sinalizado.
5. Polish → documentação e suíte completa verdes.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência entre si.
- Rótulo `[US1]`/`[US2]`/`[US3]` mapeia a tarefa à user story correspondente da spec.
- Escrever os testes antes da implementação de cada story e confirmar que falham primeiro.
- Rodar `npm run typecheck` e `npm test` ao final de cada checkpoint de story (constitution,
  princípio IV — não-negociável).
- Cada estratégia-base existente (`react.ts`, `plan-and-execute.ts`, `reflection.ts`) é reaproveitada
  sem mudança de contrato — nenhuma tarefa acima reescreve essas estratégias.
