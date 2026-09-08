---

description: "Task list for feature implementation"
---

# Tasks: Núcleo de Raciocínio (Reasoning Strategies Core)

**Input**: Design documents from `/specs/001-reasoning-strategies-core/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: Incluídos — a spec pede testes explicitamente (FR-030, FR-031) e a constitution os torna não-negociáveis (princípio IV). Cada módulo com lógica nova nasce com seu teste na mesma fase.

**Organization**: Tarefas agrupadas por user story, para que cada uma seja implementável e testável de forma independente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos distintos, sem dependência pendente)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3)
- Caminhos exatos de arquivo em cada descrição

## Path Conventions

Projeto único, camadas em `src/` conforme a Structure Decision do [plan.md](plan.md): `src/domain/` (puro) → `src/store/` (I/O de dados) → `src/agents/` (serviço) → `src/arena.ts` e `src/scripts/` (CLI). Testes ficam ao lado do código em `src/<camada>/*.test.ts` (R-009 — o glob do script `test` não tem globstar).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Estrutura de diretórios e configuração; nenhuma dependência nova é necessária (tudo já instalado).

- [X] T001 Criar os diretórios de camada `src/domain/`, `src/store/`, `src/store/sequelize/`, `src/agents/` e `src/scripts/` conforme a Structure Decision em `specs/001-reasoning-strategies-core/plan.md`
- [X] T002 [P] Adicionar o script `"seed": "tsx src/scripts/seed.ts"` ao bloco `scripts` de `package.json` (única alteração fora de `src/`)
- [X] T003 [P] Ampliar `.env.example` com `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE` e `OPS_STORE`, mais um comentário avisando que `OPENROUTER_MODEL` precisa suportar tool calling — sem nenhum valor real

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domínio puro, porta de store, adaptador em memória, fábrica de modelo e ferramentas. É o que toda estratégia consome.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase terminar.

- [X] T004 [P] Definir `Service`, `Alert`, `Incident`, `Severity`, `AlertStatus` e `IncidentStatus` em `src/domain/types.ts` conforme a tabela de entidades de `specs/001-reasoning-strategies-core/data-model.md`
- [X] T005 [P] Implementar `DomainError` e as subclasses `ConfigError`, `ValidationError`, `ServiceNotFoundError`, `IncidentNotFoundError`, `IncidentAlreadyResolvedError`, `IterationLimitError` e `UnknownStrategyError` em `src/domain/errors.ts`
- [X] T006 Definir os tipos `TraceEvent`, `RunMetrics`, `StrategyInput`, `StrategyRun` e a interface `ReasoningStrategy` em `src/domain/strategy.ts`, exatamente como em `specs/001-reasoning-strategies-core/contracts/strategy.md`
- [X] T007 Definir a interface `OpsStore` (`listAlerts`, `listServices`, `openIncident`, `resolveIncident`, `getIncident`) em `src/store/port.ts` conforme `specs/001-reasoning-strategies-core/contracts/tools.md`
- [X] T008 [P] Declarar como constantes puras os 5 serviços e os 6 alertas (3 `firing`, 3 `resolved`) em `src/store/seed-data.ts`, com exatamente os ids, severidades e resumos da tabela de `specs/001-reasoning-strategies-core/data-model.md`
- [X] T009 Implementar `MemoryOpsStore` em `src/store/memory.ts`: coleções em memória semeadas a partir de `src/store/seed-data.ts`, `listAlerts` ordenando por `id`, geração de ids `inc-<n>`, e os erros de domínio de `src/domain/errors.ts` nos casos inválidos
- [X] T010 Escrever os testes de store em `src/store/memory.test.ts` cobrindo: estado inicial com 5 serviços e 6 alertas (3 `firing`, 3 `resolved`), `listAlerts` com e sem filtro, abertura de incidente com id retornado, resolução bem-sucedida, `ServiceNotFoundError`, `IncidentNotFoundError`, `IncidentAlreadyResolvedError` e a garantia de que os casos de erro não alteram o estado
- [X] T011 Implementar a função pura `formatTrace(trace)` em `src/domain/trace.ts` com os prefixos `[thought]`/`[plan]`/`[action]`/`[observation]`/`[critique]`/`[answer]`, chaves de `args` ordenadas alfabeticamente, passos de `plan` numerados a partir de 1 e sufixo ` (parcial)` em `answer` parcial
- [X] T012 Escrever os testes de formatação em `src/domain/trace.test.ts` cobrindo cada tipo de evento, a ordenação alfabética de `args`, a marcação de resposta parcial e a igualdade byte a byte entre duas formatações da mesma entrada (determinismo, FR-007)
- [X] T013 [P] Implementar a fábrica única de modelo em `src/agents/model.ts`: schema Zod lendo `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` de `process.env` **no momento da chamada** (nunca no import), `ChatOpenAI` com `temperature: 0` e `configuration.baseURL` do OpenRouter, e `ConfigError` sem ecoar a credencial quando faltar variável
- [X] T014 [P] Implementar `CallCounter` (handler com `handleChatModelStart`) e o cronômetro de latência em `src/agents/metrics.ts`, para serem passados via `config.callbacks` por execução — nunca no construtor do modelo (R-004)
- [X] T015 Implementar `makeTools(store: OpsStore)` em `src/agents/tools.ts` com as três ferramentas `list_alerts`, `open_incident` e `resolve_incident`, schemas Zod v4 exportados separadamente para reúso nos testes, validação antes de qualquer efeito e tradução de erro de domínio em resultado de erro legível

**Checkpoint**: `npm run typecheck` e `npm test` verdes; store e formatação de trace cobertos e determinísticos, sem rede.

---

## Phase 3: User Story 1 — Operar o plantão com uma estratégia (Priority: P1) 🎯 MVP

**Goal**: Um pedido de plantão em texto entra, e sai uma resposta final acompanhada de trace tipado completo e métricas, com o estado refletindo as ferramentas executadas.

**Independent Test**: Invocar diretamente o módulo da estratégia (`react.run({ request, maxIterations, store: new MemoryOpsStore() })`) e conferir que a resposta é coerente, que o trace contém `action`/`observation` com ferramenta e argumentos, e que o estado do store mudou conforme o pedido. Não depende do arena.

- [X] T016 [US1] Implementar a tradução pura `fromMessages(messages): TraceEvent[]` em `src/agents/from-messages.ts`, mapeando `AIMessage.tool_calls` → `action` (com `callId`), `ToolMessage` → `observation` correlacionada pelo `tool_call_id`, `AIMessage` intermediária sem tool calls → `thought` e a última → `answer` (R-003)
- [X] T017 [US1] Escrever os testes de tradução em `src/agents/from-messages.test.ts` com arrays de mensagens montados à mão (sem rede): tool call único, múltiplos tool calls, observação de erro, mensagem final e correlação `callId` ↔ `tool_call_id`
- [X] T018 [US1] Implementar a estratégia `react` em `src/agents/react.ts` usando `createReactAgent` de `@langchain/langgraph/prebuilt` com as tools de `makeTools`, `version: "v2"`, `recursionLimit = maxIterations * 2 + 1`, o `CallCounter` em `config.callbacks`, e conversão de estouro de limite ou erro em `answer` parcial + trace + métricas (obrigações S1–S9 de `contracts/strategy.md`)
- [X] T019 [US1] Criar o catálogo em `src/agents/registry.ts` exportando `strategies`, `strategyNames()` (ordenado) e `resolveStrategies(names)` lançando `UnknownStrategyError`, inicialmente com a estratégia `react` registrada
- [X] T020 [US1] Validar o Cenário 4 de `specs/001-reasoning-strategies-core/quickstart.md` executando a estratégia sobre `MemoryOpsStore` com o pedido "liste os alertas em disparo" e conferindo `action` com `list_alerts`, observação com os 3 alertas, `llmCalls` ≥ 1 e `latencyMs` > 0

**Checkpoint**: MVP entregue — uma estratégia resolve pedidos de plantão de ponta a ponta com prestação de contas completa.

---

## Phase 4: User Story 2 — Comparar estratégias sobre o mesmo pedido (Priority: P2)

**Goal**: Um comando roda uma ou mais estratégias sobre o mesmo pedido e imprime, por estratégia, o trace formatado e as métricas.

**Independent Test**: `npm run arena -- --strategies react "liste os alertas em disparo"` imprime um bloco completo; com duas estratégias registradas, imprime dois blocos; nome inválido é recusado listando os válidos.

- [X] T021 [US2] Implementar o parsing e a validação Zod das flags `--strategies`, `--max-iterations` (inteiro 1–20, padrão 8) e `--store` (`memory` | `mysql`, padrão `memory`) mais o pedido posicional em `src/arena.ts`, conforme `specs/001-reasoning-strategies-core/contracts/cli.md`
- [X] T022 [US2] Implementar em `src/arena.ts` a execução sequencial das estratégias resolvidas pelo `registry`, cada uma com o mesmo `maxIterations` e um store recém-construído, imprimindo o bloco `=== <nome> ===` com `formatTrace(trace)` e a linha de métricas `llmCalls` / `latencyMs`
- [X] T023 [US2] Implementar em `src/arena.ts` o isolamento de falhas — estratégia que falhar imprime `!!! erro: <mensagem>` no seu bloco sem impedir as demais — e os códigos de saída (`0` se ao menos uma concluiu, `1` se todas falharam); `UnknownStrategyError` falha antes de qualquer execução, listando os nomes válidos
- [X] T024 [US2] Validar o Cenário 5 de `specs/001-reasoning-strategies-core/quickstart.md`, incluindo as verificações negativas de `--strategies inexistente` e de execução sem `--strategies` (roda todas as registradas)

**Checkpoint**: comparação utilizável; adicionar estratégia passa a ser só registrá-la (SC-005).

---

## Phase 5: User Story 3 — Raciocínio com plano explícito e replanejamento (Priority: P3)

**Goal**: Uma segunda estratégia que planeja explicitamente, executa um passo por vez e revisa o restante após cada passo, encerrando quando nada resta — com teto rígido de 8 passos.

**Independent Test**: Executar `plan-and-execute` com um pedido de múltiplos passos e conferir no trace um `plan` inicial numerado, pares `action`/`observation` por passo, `critique`/`plan` de replanejamento após cada passo, e `answer` ao esvaziar o plano — sem nunca passar de 8 passos executados.

- [X] T025 [US3] Definir em `src/agents/plan-and-execute.ts` o `PlanSchema` (`z.object({ steps: z.array(z.string()).min(1).max(8) })`) e o schema do replanner como união entre plano restante e resposta final, conforme R-006
- [X] T026 [US3] Implementar o nó `planner` em `src/agents/plan-and-execute.ts` usando `model.withStructuredOutput(PlanSchema)`, revalidando a saída com `PlanSchema.parse` na borda e emitindo o evento `plan` no trace
- [X] T027 [US3] Implementar o nó `executor` em `src/agents/plan-and-execute.ts` que executa **um** passo por vez com acesso às tools de `makeTools`, emitindo `action` e `observation` e tratando erro de domínio como observação de erro sem abortar
- [X] T028 [US3] Implementar o nó `replanner` e a montagem do `StateGraph` em `src/agents/plan-and-execute.ts`: revisão dos passos restantes após cada execução (emitindo `critique` e o novo `plan`), encerramento quando não restarem passos, e a barreira própria de 8 passos executados que devolve `answer` parcial ao estourar (R-007, FR-023)
- [X] T029 [US3] Registrar a estratégia `plan-and-execute` em `src/agents/registry.ts` — nenhuma alteração em `src/arena.ts` deve ser necessária
- [X] T030 [US3] Validar que as duas estratégias aparecem lado a lado na comparação do Cenário 5 e que o teto de 8 passos é respeitado mesmo com `--max-iterations 20`

**Checkpoint**: três user stories entregues; o núcleo de raciocínio está completo.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Adaptador MySQL, script de seed, e as verificações finais de qualidade e segurança.

- [X] T031 [P] Implementar a construção da instância Sequelize em `src/store/sequelize/connection.ts` a partir de `DATABASE_URL` ou das variáveis `MYSQL_*`, com `ConfigError` claro quando a configuração faltar e sem jamais ecoar a senha
- [X] T032 [P] Definir os modelos `services`, `alerts` e `incidents` em `src/store/sequelize/models.ts` com `Model.init`, `InferAttributes`/`InferCreationAttributes`, `underscored: true`, chaves estrangeiras para `services.id` e índice em `status`, conforme a tabela de persistência de `specs/001-reasoning-strategies-core/data-model.md`
- [X] T033 Implementar `SequelizeOpsStore` em `src/store/sequelize/store.ts` satisfazendo a mesma porta `OpsStore` e lançando os mesmos erros de domínio do adaptador em memória, para que `--store mysql` funcione sem qualquer mudança no arena
- [X] T034 Implementar o script de seed em `src/scripts/seed.ts`: conecta, sincroniza o schema, faz `upsert` dos 5 serviços e 6 alertas de `src/store/seed-data.ts` sem tocar em incidentes, imprime `seed ok: 5 serviços, 6 alertas (3 firing, 3 resolved)` e sai com `1` e mensagem clara quando o banco estiver indisponível
- [X] T035 Executar `npm run seed` duas vezes seguidas e confirmar a idempotência sobre `data/ops-db.json` (5 serviços, 6 alertas, 3 firing / 3 resolved, incidentes preservados), conforme o Cenário 6 do quickstart. O caminho MySQL (`npm run seed -- --mysql`) permanece **não executado**: não há MySQL em 3306 nem daemon Docker nesta máquina (R-010)

---

## Phase 7: Base de dados em arquivo e Plan-and-Execute revisado

**Purpose**: Substituir o MySQL por um arquivo JSON como base de trabalho — o modelo lê o que já existe e o que ele cria persiste — e reescrever o Plan-and-Execute no formato de estado `input`/`plan`/`done`/`answer` com replanejador que decide seguir, ajustar ou encerrar.

- [X] T039 Implementar `JsonOpsStore` em `src/store/json.ts` sobre `data/ops-db.json`, satisfazendo a porta `OpsStore`, validando o conteúdo do arquivo com Zod na leitura e serializando escritas numa fila interna para que ferramentas concorrentes não se sobrescrevam (R-011)
- [X] T040 Escrever os testes do store em arquivo em `src/store/json.test.ts`, com arquivo temporário por teste: leitura do estado semeado, persistência entre instâncias, escritas concorrentes, os três erros de domínio e a validação de fronteira (arquivo ausente, JSON malformado, formato inesperado)
- [X] T041 Reescrever `src/scripts/seed.ts` para gerar `data/ops-db.json` por padrão, preservando incidentes já existentes, com `--path` para outro arquivo e `--mysql` como caminho opt-in
- [X] T042 Tornar `json` o store padrão do arena em `src/arena.ts` e `src/cli/args.ts`, mantendo `memory` (testes) e `mysql` (opt-in) como opções de `--store`
- [X] T043 Reescrever `src/agents/plan-and-execute.ts` com o estado `input` / `plan` / `done: [passo, resultado][]` / `answer`, planner com `planSchema`, executor que resolve o passo do topo com as tools e empurra para `done`, e replanner que decide entre `seguir`, `ajustar` e `encerrar`
- [X] T044 Implementar as barreiras do grafo em `src/agents/plan-and-execute.ts`: `stepBudget` (menor entre `maxIterations` e o teto de 8), `graphRecursionLimit` com folga para a barreira própria disparar antes do LangGraph, e `nextPlan` impedindo que um passo já executado volte ao plano
- [X] T045 Trocar `graph.invoke` por `graph.stream` acumulando o último estado, para que o estouro de limite devolva resposta parcial **com** o trace acumulado em vez de descartá-lo
- [X] T046 Implementar `describeProviderError` em `src/agents/provider-errors.ts` com testes, traduzindo os sintomas obscuros de erro do provedor (`Cannot read properties of undefined (reading 'map')` do parser da OpenAI e `Failed to parse. Text: ""`) na causa real — limite de uso 429, credencial recusada ou modelo indisponível. Um retry chegou a ser adicionado e foi **removido**: a premissa de "ruído intermitente" estava errada, as respostas vazias eram 429 de cota, e retentar só queima cota e mascara a causa
- [X] T047 Cobrir os novos guardrails em `src/agents/guardrails.test.ts`: `stepBudget`, `nextPlan` nas três decisões, barreira anti-loop e a folga do `recursionLimit`
- [X] T048 Validar ao vivo o ciclo de persistência (uma execução abre o incidente, a seguinte o lê e resolve) e o caminho de erro de domínio sem loop nem estouro
- [X] T036 [P] Auditar que `OPENROUTER_API_KEY` não aparece em nenhum `console.log`, mensagem de erro ou evento de trace (`grep` no `src/`) e validar o Cenário 7 do quickstart com a variável ausente
- [X] T037 Rodar `npm run typecheck` e `npm test`, e repetir a suíte 10 vezes confirmando resultado idêntico (Cenário 2, SC-007)
- [X] T038 Percorrer o checklist de saída de `specs/001-reasoning-strategies-core/quickstart.md` e marcar cada item

---

## Dependencies

### Ordem entre fases

```
Phase 1 (Setup)
   ↓
Phase 2 (Foundational)  ← bloqueia tudo
   ↓
Phase 3 (US1 · P1) ──→ Phase 4 (US2 · P2) ──→ Phase 5 (US3 · P3)
   ↓                        ↓                       ↓
                      Phase 6 (Polish)
```

### Dependências entre user stories

- **US1** depende apenas da Fase 2. É o MVP e pode ser entregue sozinha.
- **US2** depende de US1 por causa do `registry` (T019) — mas o arena em si só precisa de *uma* estratégia registrada para ter valor.
- **US3** depende da Fase 2; é independente de US2 na implementação, e T029/T030 só ganham sentido depois que o arena existe.

### Dependências notáveis dentro das fases

- T006 e T007 dependem de T004; T009 depende de T005, T007 e T008; T010 depende de T009.
- T012 depende de T011; T011 depende de T006.
- T015 depende de T005, T007 e T014.
- T018 depende de T013, T014, T015 e T016; T019 depende de T018.
- T022 e T023 dependem de T021 e T019.
- T026–T028 dependem de T025 e compartilham o mesmo arquivo: **sequenciais, não paralelizáveis**.
- T033 depende de T031 e T032; T034 depende de T032 e T008; T035 depende de T034.

---

## Parallel Execution Examples

**Fase 1** — T002 e T003 tocam arquivos diferentes:

```
T002 (package.json)  ‖  T003 (.env.example)
```

**Fase 2** — a primeira onda são quatro arquivos independentes:

```
T004 (domain/types.ts)  ‖  T005 (domain/errors.ts)  ‖  T013 (agents/model.ts)  ‖  T014 (agents/metrics.ts)
```

depois, com T004 pronto, T006/T007/T008 seguem em paralelo entre si.

**Fase 3** — T016 e T017 são o mesmo par lógico e devem ser feitos juntos; o restante é sequencial (mesmo arquivo ou dependência direta).

**Fase 6** — T031, T032 e T036 são independentes:

```
T031 (sequelize/connection.ts)  ‖  T032 (sequelize/models.ts)  ‖  T036 (auditoria de segredos)
```

---

## Implementation Strategy

### MVP (entrega mínima com valor)

**Fases 1 + 2 + 3 (T001–T020)**. Ao fim, uma estratégia ReAct resolve pedidos de plantão de ponta a ponta, com trace tipado, métricas e testes determinísticos verdes. Já demonstrável e já útil.

### Incrementos seguintes

1. **+ Fase 4 (T021–T024)**: a comparação vira comando de linha; a partir daqui qualquer estratégia nova aparece sozinha no arena.
2. **+ Fase 5 (T025–T030)**: segunda estratégia, e a comparação passa a comparar de verdade — que é o objetivo pedagógico da feature.
3. **+ Fase 6 (T031–T038)**: persistência MySQL, seed idempotente e as verificações finais.

### Nota de sequenciamento

A Fase 6 fica por último de propósito. O caminho MySQL é opt-in e hoje inexecutável nesta máquina (porta 3306 fechada); colocá-lo antes bloquearia o valor central da feature em infraestrutura ausente. Cada fase fecha com `typecheck` e `test` verdes, conforme o princípio IV da constitution, e cabe em commits pequenos e reversíveis.
