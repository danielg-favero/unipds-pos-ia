---

description: "Task list for Modo Equipe (Supervisor Multi-Agente)"
---

# Tasks: Modo Equipe (Supervisor Multi-Agente)

**Input**: Design documents from `/specs/017-modo-equipe/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/team-strategy.md, quickstart.md

**Tests**: Incluídos — a constitution do projeto (Princípio IV, NON-NEGOTIABLE) exige teste para toda lógica nova, e `typecheck`/`test` como gate antes de seguir.

**Organization**: Tarefas agrupadas por user story do spec.md, na ordem de prioridade (US1 e US2 são P1; US3 e US4 são P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1, US2, US3, US4 — mapeadas para as user stories do spec.md
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto único: `src/` no root do repo, com o frontend companheiro em `web/src/`. Novo diretório
`src/team/` conforme `plan.md` § Project Structure.

---

## Phase 1: Setup

**Purpose**: Criar o esqueleto do novo diretório de orquestração antes de qualquer lógica

- [X] T001 Criar diretório `src/team/` com `src/team/roles/` (arquivos vazios/stub `state.ts`, `supervisor.ts`, `team-graph.ts`, `roles/analista.ts`, `roles/planejador.ts`, `roles/executor.ts`) conforme a árvore em `plan.md` § Project Structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos e infraestrutura compartilhados que TODAS as user stories dependem — nenhuma
história pode ser implementada antes desta fase estar completa

**⚠️ CRITICAL**: Nenhum trabalho de user story pode começar até esta fase estar completa

- [X] T002 Adicionar a variante `"handoff"` à união discriminada `TraceEvent` em `src/domain/strategy.ts`, conforme o contrato em `contracts/team-strategy.md` § 3 (`{ type: "handoff"; from: "supervisor" | "analista" | "planejador" | "executor"; to: "analista" | "planejador" | "executor" | "respond"; reason: string }`)
- [X] T003 Adicionar o `case "handoff":` correspondente em `formatEvent` (`src/domain/trace.ts`), depende de T002
- [X] T004 [P] Definir os tipos `TeamRole`, `BlackboardEntry`, `SupervisorDecision` e `TeamGraphState` em `src/team/state.ts`, incluindo o `Annotation.Root` do `StateGraph` (campos `input`, `blackboard`, `trace`, `handoffCount`, `answer`, `partial`, `metrics`) conforme `data-model.md`
- [X] T005 [P] Teste unitário de `formatEvent` para o novo tipo `"handoff"` em `src/domain/trace.test.ts` (depende de T002/T003)

**Checkpoint**: Tipos e estado compartilhados prontos — implementação das user stories pode começar

---

## Phase 3: User Story 1 - Operador delega uma investigação a uma equipe de especialistas (Priority: P1) 🎯 MVP

**Goal**: Um operador envia uma solicitação de investigação pela rota de equipe (`strategy: "team"`
em `POST /chat`) e recebe uma resposta final única, produzida pela colaboração entre supervisor e
especialistas, com decisões baseadas no blackboard acumulado.

**Independent Test**: Enviar uma pergunta de diagnóstico à estratégia `"team"` com um supervisor
fake determinístico e verificar que a resposta final reflete contribuições de pelo menos dois papéis
diferentes, e que o supervisor decide com base no blackboard acumulado até o momento.

### Tests for User Story 1 ⚠️

> Escrever estes testes PRIMEIRO, garantir que falham antes da implementação

- [X] T006 [P] [US1] Teste de `decideNext` em `src/team/supervisor.test.ts`: dado um modelo fake que retorna `{ next, brief }` válidos, `decideNext` devolve a decisão parseada; dado um modelo fake que lança/retorna algo inválido, aplica o fallback determinístico de `research.md` (Decisão 4: `"respond"` se blackboard não-vazio, senão `"analista"`)
- [X] T007 [P] [US1] Teste de orquestração em `src/team/team-graph.test.ts` ("US1"): com um `decideNext` fake que alterna `analista → planejador → respond`, a estratégia `team` produz uma única resposta final e o `trace` retornado contém contribuições atribuíveis aos dois papéis acionados

### Implementation for User Story 1

- [X] T008 [US1] Implementar `decideNext(state, deps?)` em `src/team/supervisor.ts`: `createModel().withStructuredOutput(z.object({ next: z.enum(["analista","planejador","executor","respond"]), brief: z.string().min(1) }))`, injetável com default (mesmo padrão de `RouteFn` em `production-graph.ts`), com o fallback determinístico de `research.md` Decisão 4 (depende de T004)
- [X] T009 [P] [US1] Implementar o nó `analista` em `src/team/roles/analista.ts`: chama o modelo com o subconjunto de ferramentas de leitura (`list_alerts`, `list_incidents`, `consultar_runbook` de `makeTools(input.store)`), produz um `BlackboardEntry` com `role: "analista"` resumindo os achados (depende de T004)
- [X] T010 [P] [US1] Implementar o nó `planejador` em `src/team/roles/planejador.ts`: chama o modelo sem nenhuma ferramenta, lê o blackboard acumulado e produz um `BlackboardEntry` com `role: "planejador"` contendo o plano (depende de T004)
- [X] T011 [P] [US1] Implementar o nó `executor` em `src/team/roles/executor.ts`: chama o modelo com o subconjunto `open_incident`/`resolve_incident` de `makeTools(input.store)` (usando o `input.store` já protegido por `withApprovalGuardrail`, nunca um store alternativo), produz um `BlackboardEntry` com `role: "executor"` (depende de T004)
- [X] T012 [US1] Implementar `buildTeamStrategy(...)` em `src/team/team-graph.ts`: `StateGraph` sobre `TeamGraphState` com nós `supervisor → {analista|planejador|executor} → supervisor → ... → respond → END`, roteando por `SupervisorDecision.next`, acumulando `blackboard`/`trace` via os reducers de T004, e produzindo `StrategyRun { answer, trace, metrics }` (depende de T008, T009, T010, T011)
- [X] T013 [US1] Registrar `strategies.team = buildTeamStrategy(...)` em `src/agents/registry.ts`, tornando `"team"` selecionável via o campo `strategy` já existente em `POST /chat` (depende de T012)

**Checkpoint**: A rota "team" já é utilizável ponta a ponta via `POST /chat`, com orquestração
funcional entre papéis baseada no blackboard.

---

## Phase 4: User Story 2 - Papéis respeitam seus limites de atuação (Priority: P1)

**Goal**: Garantir, com testes explícitos, que analista é somente-leitura e não propõe/executa
ações, planejador nunca invoca ferramentas, e executor só age sujeito às mesmas
confirmações/guardrails já existentes (sem bypass).

**Independent Test**: Verificar isoladamente que (a) o analista nunca aciona ferramentas de
escrita/execução, (b) o planejador nunca aciona nenhuma ferramenta, e (c) o executor não consegue
concluir uma ação sensível sem passar pela mesma confirmação/guardrail que já existe hoje
(`ApprovalRequiredError`).

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] Teste em `src/team/roles/analista.test.ts`: o nó `analista` nunca invoca `open_incident`/`resolve_incident` mesmo quando o modelo fake tenta chamá-las (a ferramenta simplesmente não está disponível na lista passada ao modelo) e sua saída é sempre tratada como achado (`BlackboardEntry`), nunca como decisão executável
- [X] T015 [P] [US2] Teste em `src/team/roles/planejador.test.ts`: o nó `planejador` é construído sem nenhuma ferramenta disponível ao modelo, independentemente do conteúdo do blackboard
- [X] T016 [P] [US2] Teste em `src/team/roles/executor.test.ts`: uma chamada a `open_incident`/`resolve_incident` pelo nó `executor` sobre um `store` decorado com `withApprovalGuardrail` resulta em `ApprovalRequiredError` (reaproveitando o mesmo comportamento coberto em `src/agents/approval-guardrail.test.ts`), nunca em execução direta

### Implementation for User Story 2

- [X] T017 [US2] Extrair constantes de escopo de ferramentas por papel (`ANALISTA_TOOLS`, `EXECUTOR_TOOLS`) em `src/team/roles/analista.ts`/`src/team/roles/executor.ts` e confirmar (via os testes de T014-T016) que `planejador.ts` nunca recebe um array de ferramentas não-vazio (depende de T009, T010, T011)
- [X] T018 [US2] Confirmar em `src/team/roles/executor.ts` que o node usa exclusivamente `input.store` (já decorado por `withApprovalGuardrail` em `src/http/server.ts`) — nenhum `OpsStore` alternativo é instanciado dentro de `src/team/` (depende de T011)

**Checkpoint**: Papéis e guardrails validados por teste — US1 + US2 entregam o modo equipe seguro
para uso com incidentes reais.

---

## Phase 5: User Story 3 - Operador acompanha as transições entre especialistas no raciocínio (Priority: P2)

**Goal**: Cada handoff entre papéis aparece como um evento distinto e legível em "ver raciocínio",
na ordem em que ocorreu, indicando o papel de destino e o motivo.

**Independent Test**: Inspecionar o `trace` de uma conversa no modo equipe com múltiplas transições
e confirmar que cada transição aparece como evento `"handoff"` identificável, na ordem correta; e
que uma conversa sem troca de especialista não exibe handoffs indevidos.

### Tests for User Story 3 ⚠️

- [X] T019 [P] [US3] Teste em `src/team/team-graph.test.ts` ("US3"): com um `decideNext` fake que alterna `analista → executor → respond`, o `trace` retornado contém eventos `"handoff"` na ordem correta (`supervisor→analista`, `analista→executor`, `executor→respond`), cada um com `to` e `reason` presentes
- [X] T020 [P] [US3] Teste em `src/team/team-graph.test.ts` ("US3"): quando um único papel resolve tudo (`decideNext` retorna `"respond"` logo após o primeiro papel), apenas os dois handoffs esperados aparecem (`supervisor→papel`, `papel→respond`), sem handoffs adicionais indevidos

### Implementation for User Story 3

- [X] T021 [US3] Emitir um `TraceEvent` `"handoff"` em `src/team/team-graph.ts` a cada transição real de responsabilidade (`from`/`to`/`reason` preenchidos a partir de `SupervisorDecision`), incluindo a transição inicial supervisor→primeiro papel (depende de T012, T002)
- [X] T022 [P] [US3] Adicionar a variante `"handoff"` à união `TraceEvent` espelhada em `web/src/api/types.ts`, igual ao contrato de `contracts/team-strategy.md` § 3
- [X] T023 [P] [US3] Adicionar o `case "handoff":` de renderização em `web/src/trace/trace-event.tsx`, mostrando o papel de destino e o motivo (`reason`), satisfazendo a checagem exaustiva `never` já existente no arquivo (depende de T022)

**Checkpoint**: Handoffs são visíveis e legíveis no War Room Console, além de rastreáveis via
`GET /requests/:id`.

---

## Phase 6: User Story 4 - Sistema evita loops indefinidos entre especialistas (Priority: P2)

**Goal**: Se o supervisor continuar alternando entre especialistas sem concluir, a orquestração é
interrompida após 8 transições, devolvendo o melhor resultado disponível em vez de travar.

**Independent Test**: Forçar um `decideNext` fake que nunca retorna `"respond"` e verificar que a
orquestração para exatamente na 8ª transição, retornando uma resposta final ao operador.

### Tests for User Story 4 ⚠️

- [X] T024 [US4] Teste em `src/team/team-graph.test.ts` ("US4"): com um `decideNext` fake que sempre retorna o mesmo papel (nunca `"respond"`), a execução emite no máximo 8 eventos `"handoff"` com `to != "respond"`, seguido de um handoff final forçado para `"respond"` cujo `reason` menciona o teto atingido, e `StrategyRun` correspondente marca a resposta como parcial
- [X] T025 [US4] Teste em `src/team/team-graph.test.ts` ("US4"): uma investigação que se resolve em poucas transições (`decideNext` retorna `"respond"` antes do teto) termina normalmente, sem qualquer indicação de truncamento

### Implementation for User Story 4

- [X] T026 [US4] Implementar o contador `handoffCount` no `TeamGraphState` (incrementado a cada handoff real) e a checagem em `src/team/team-graph.ts`: ao atingir 8, a próxima decisão é sobrescrita para `"respond"` e um `TraceEvent` `"handoff"` final é emitido com `reason` explicando o motivo do encerramento (depende de T012, T021, T004)
- [X] T027 [US4] Propagar `partial: true` no `StrategyRun.answer`/estado quando o encerramento for forçado pelo teto, e compor a mensagem final da resposta com a ressalva correspondente em `src/team/team-graph.ts` (nó `respond`), conforme FR-013 (depende de T026)

**Checkpoint**: Todas as quatro user stories do spec estão implementadas e testadas
independentemente.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validação de regressão e da suíte completa antes de considerar a feature pronta

- [X] T028 Rodar `npm run typecheck` e `npm test` na raiz do projeto, confirmando que nenhuma suíte existente quebrou (`src/domain/trace.test.ts`, `src/agents/approval-guardrail.test.ts`, `src/agents/production-graph.test.ts`, novos testes de `src/team/`) — `typecheck` limpo; `test`: 391/392, única falha é `src/mcp/server.stdout.test.ts` (flaky pré-existente, reproduz também em `main` sem as mudanças desta feature, sob carga da suíte completa)
- [ ] T029 Executar o roteiro de validação manual de `quickstart.md` (chamada `POST /chat` com `strategy: "team"`, inspeção de `GET /requests/:id`, e verificação visual do painel "ver raciocínio" em `web/`) — **pendente**: requer servidor rodando com credenciais reais do OpenRouter (`OPENROUTER_API_KEY`/`OPENROUTER_MODEL`) e o console `web/` no ar; não executável neste ambiente sem essas credenciais

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende de Setup; BLOQUEIA todas as user stories
- **User Story 1 (Phase 3)**: depende só de Foundational — é o MVP, deve ser implementada primeiro
- **User Story 2 (Phase 4)**: depende de Foundational **e** dos nós de papel criados em US1 (T009-T011) — reforça/testa restrições sobre código já existente, não pode anteceder US1
- **User Story 3 (Phase 5)**: depende de Foundational **e** de `team-graph.ts` existir (T012 de US1) — adiciona a emissão/renderização de handoff sobre a orquestração já funcional
- **User Story 4 (Phase 6)**: depende de Foundational **e** de `team-graph.ts` e da emissão de handoff (T012, T021) — adiciona o teto sobre o mecanismo de handoff de US3
- **Polish (Phase 7)**: depende de todas as user stories desejadas estarem completas

> Diferente do template genérico, aqui as user stories **não são totalmente independentes entre
> si** na ordem de implementação: US2, US3 e US4 testam/estendem o mesmo `team-graph.ts` criado em
> US1 (a orquestração central é uma peça só). Cada uma continua sendo **independentemente
> testável** (critérios de teste isolados por história), mas a ordem de implementação recomendada é
> sequencial: US1 → US2 → US3 → US4.

### Within Each User Story

- Testes são escritos e devem falhar antes da implementação correspondente
- Tipos/estado (Foundational) antes de qualquer nó de papel
- Nós de papel (T009-T011) antes da montagem do grafo (T012)
- Grafo montado (T012) antes do registro da estratégia (T013)

### Parallel Opportunities

- T004 e T005 (Foundational) podem rodar em paralelo com T002/T003 concluídos
- T006 e T007 (testes de US1) podem rodar em paralelo entre si
- T009, T010, T011 (os três nós de papel de US1) podem ser implementados em paralelo — arquivos
  diferentes, todos dependendo apenas de T004
- T014, T015, T016 (testes de US2) podem rodar em paralelo entre si
- T019 e T020 (testes de US3) podem rodar em paralelo entre si
- T022 e T023 (extensão do frontend em US3) podem rodar em paralelo entre si

---

## Parallel Example: User Story 1

```bash
# Depois de T004 (tipos) concluído, implementar os três nós de papel em paralelo:
Task: "Implementar o nó analista em src/team/roles/analista.ts"
Task: "Implementar o nó planejador em src/team/roles/planejador.ts"
Task: "Implementar o nó executor em src/team/roles/executor.ts"

# Testes de US1 em paralelo, antes da implementação:
Task: "Teste de decideNext em src/team/supervisor.test.ts"
Task: "Teste de orquestração em src/team/team-graph.test.ts (US1)"
```

---

## Implementation Strategy

### MVP First (User Story 1 apenas)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloqueia todas as histórias)
3. Completar Phase 3: User Story 1
4. **PARAR e VALIDAR**: rodar os testes de T006/T007 e o passo 1-3 de `quickstart.md`
5. Nesse ponto, `strategy: "team"` já é utilizável ponta a ponta em `POST /chat`

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → orquestração funcional ponta a ponta (MVP)
3. US2 → segurança/limites de papel confirmados por teste (necessário antes de expor a operadores
   reais, dado o Princípio V da constitution)
4. US3 → visibilidade dos handoffs no raciocínio
5. US4 → proteção contra loop indefinido
6. Polish → regressão completa + validação manual de `quickstart.md`

## Notes

- [P] tasks = arquivos diferentes, sem dependência entre si
- [Story] mapeia a tarefa à user story correspondente para rastreabilidade
- Verificar que os testes falham antes de implementar (T006/T007, T014-T016, T019/T020, T024/T025)
- Fazer commit por tarefa ou por grupo lógico coeso
- Parar em cada checkpoint para validar a história isoladamente antes de seguir para a próxima
