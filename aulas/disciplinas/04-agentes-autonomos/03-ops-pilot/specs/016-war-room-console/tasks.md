---

description: "Task list for War Room Console (016)"
---

# Tasks: War Room Console

**Input**: Design documents from `/specs/016-war-room-console/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/http-api.md](./contracts/http-api.md), [quickstart.md](./quickstart.md)

**Tests**: Incluídos — a constitution do projeto exige teste para toda lógica nova (Princípio IV, non-negotiable).

**Organization**: Tasks agrupadas por user story (spec.md) para permitir implementação e teste independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1 (chat), US2 (raciocínio), US3 (aprovar/negar), US4 (config. de API)

## Path Conventions

Web application (ver `plan.md` → Project Structure): backend existente em `src/`, frontend novo em `web/`.

---

## Phase 1: Setup

**Purpose**: Inicialização do novo projeto frontend e dependências de backend necessárias a todas as histórias

- [X] T001 Criar o scaffold do projeto Vite + React + TS em `web/` (`web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx` mínimo)
- [X] T002 [P] Configurar Vitest + Testing Library em `web/` (`web/vitest.config.ts`, `web/tests/setup.ts`, script `test`/`typecheck` em `web/package.json`)
- [X] T003 [P] Adicionar dependência `cors` ao `package.json` da raiz e documentar `OPSPILOT_WEB_ORIGIN` em `.env.example`

**Checkpoint**: `npm run dev` (web) e `npm run http` (backend) sobem sem erro; nenhuma feature ainda implementada.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestrutura que TODAS as user stories consomem — nenhuma história começa antes disso estar pronto

**⚠️ CRITICAL**: Nenhuma tarefa de user story pode começar até esta fase terminar

- [X] T004 Montar as rotas existentes sob o prefixo `/opspilot` via `express.Router()` em `src/http/server.ts` (contracts/http-api.md → Base path), mantendo os testes de rota atuais passando com o novo prefixo
- [X] T005 [P] Adicionar middleware de CORS com allow-list de origem única via `OPSPILOT_WEB_ORIGIN` em `src/http/server.ts` (research.md §3)
- [X] T006 [P] Backend test: requisições de uma origem fora da allow-list são bloqueadas e de dentro são aceitas, em `src/http/server.test.ts`
- [X] T007 [P] Criar `web/src/config/api-settings.ts`: `getApiUrl`, `setApiUrl`, `isValidApiUrl` (localStorage, chave `opspilot:apiUrl`, default `window.location.origin`) — data-model.md → ApiSettings
- [X] T008 [P] Frontend test para `api-settings.ts` (validação de URL, persistência, default) em `web/tests/config/api-settings.test.ts`
- [X] T009 [P] Criar `web/src/api/ops-pilot-client.ts`: cliente `fetch` tipado com `postChat(body)` e `postDecision(requestId, decision)`, usando `getApiUrl()` como base e tipos de `contracts/http-api.md` (200/202/400/404/409/422/504)
- [X] T010 [P] Frontend test para `ops-pilot-client.ts` cobrindo os status 200 e 202 (mock de `fetch`) em `web/tests/api/ops-pilot-client.test.ts`
- [X] T011 [P] Criar shell da aplicação e tokens de design (cores/espaçamento em variáveis CSS, suporte a `prefers-color-scheme`) em `web/src/app.tsx` e `web/src/styles/tokens.css`, seguindo `.claude/instructions/design.instructions.md`

**Checkpoint**: infraestrutura de API, config e design pronta — user stories podem começar.

---

## Phase 3: User Story 1 - Conversar com o agente durante um incidente (Priority: P1) 🎯 MVP

**Goal**: Operador envia mensagens e recebe respostas do agente na War Room.

**Independent Test**: Enviar uma mensagem no composer e ver a resposta do agente aparecer na conversa (quickstart.md → Cenário 1).

### Tests for User Story 1

- [X] T012 [P] [US1] Frontend test: `message-composer` dispara envio e limpa o campo, em `web/tests/chat/message-composer.test.tsx`
- [X] T013 [P] [US1] Frontend test: `message-list` renderiza estados `sending`/`done`/`error` de uma mensagem, em `web/tests/chat/message-list.test.tsx`
- [X] T014 [P] [US1] Frontend test: `chat-view` integra composer + lista, mostra indicador de processamento e trata erro de rede sem travar a conversa, em `web/tests/chat/chat-view.test.tsx`

### Implementation for User Story 1

- [X] T015 [P] [US1] Implementar `web/src/chat/message-composer.tsx` (input + envio, acessível por teclado)
- [X] T016 [P] [US1] Implementar `web/src/chat/message-list.tsx` (histórico cronológico; estados vazio/enviando/erro conforme design instructions)
- [X] T017 [US1] Implementar `web/src/chat/chat-view.tsx`: estado da conversa (`Message[]`), chama `postChat` via `ops-pilot-client.ts`, atualiza status por mensagem (depende de T015, T016, T009)
- [X] T018 [US1] Integrar `chat-view.tsx` como tela principal em `web/src/app.tsx`

**Checkpoint**: User Story 1 funcional e testável de forma independente (MVP).

---

## Phase 4: User Story 3 - Aprovar ou negar uma ação pendente (Priority: P1)

**Goal**: Ações sensíveis (`open_incident`, `resolve_incident`) exigem decisão humana antes de executar, exibidas como cartão na conversa.

**Independent Test**: Levar o agente a propor `resolve_incident`, ver o cartão aprovar/negar, decidir e conferir o desfecho (quickstart.md → Cenário 3).

### Tests for User Story 3

- [X] T019 [P] [US3] Backend test: execução de `resolve_incident`/`open_incident` sem aprovação prévia interrompe e retorna guardrail pendente, em `src/agents/guardrails.test.ts` (estender/reaproveitar arquivo existente)
- [X] T020 [P] [US3] Backend test: `POST /opspilot/chat` responde `202` com `pendingApproval` quando a execução para num guardrail, em `src/http/server.test.ts`
- [X] T021 [P] [US3] Backend test: `POST /opspilot/chat/:requestId/decision` — `approve` executa a tool e retorna 200 com trace completo; `deny` retorna 200 sem executar a tool; decisão repetida retorna `409` com o estado já decidido; `requestId` desconhecido retorna `404`, em `src/http/server.test.ts`
- [X] T022 [P] [US3] Frontend test: `approval-card` renderiza estados `pending`/`approved`/`denied` e desabilita os botões após decisão, em `web/tests/approval/approval-card.test.tsx`

### Implementation for User Story 3

- [X] T023 [P] [US3] Criar tipos e erros de domínio de aprovação (`PendingApproval`, `ApprovalNotPendingError`, `ApprovalNotFoundError`) em `src/domain/approval.ts` (data-model.md → PendingApproval)
- [X] T024 [US3] Adicionar métodos de aprovação (`createPendingApproval`, `getPendingApproval`, `decidePendingApproval`) à interface `OpsStore` em `src/store/port.ts` e implementá-los em `src/store/sqlite/sqlite-ops-store.ts` (depende de T023)
- [X] T025 [US3] Implementar o guardrail de execução: antes de `open_incident`/`resolve_incident` rodarem de fato, registrar `PendingApproval` e interromper a execução da estratégia, em `src/agents/tools.ts` (ou módulo de guardrail dedicado referenciado por `production-graph.ts`) (depende de T024; research.md §2)
- [X] T026 [US3] Em `src/http/server.ts`, quando a execução para num guardrail, responder `202` com `pendingApproval` em vez de `200` (depende de T025)
- [X] T027 [US3] Adicionar rota `POST /chat/:requestId/decision` em `src/http/server.ts` com `decisionRequestSchema` (Zod) em `src/http/schemas.ts`: valida `requestId` pendente, executa a tool em caso de `approve`, marca `denied` sem executar em caso de `deny`, retorna `409` para decisão duplicada (depende de T024, T026)
- [X] T028 [P] [US3] Implementar `web/src/approval/approval-card.tsx` (descrição da ação, botões Aprovar/Negar, estado pós-decisão)
- [X] T029 [US3] Estender `web/src/api/ops-pilot-client.ts` e `chat-view.tsx` para tratar a resposta `202` como `pendingApproval` na mensagem do agente e renderizar `approval-card` no lugar de texto (depende de T028, T017, T009)
- [X] T030 [US3] Enviar a decisão do operador via `postDecision` e atualizar o cartão com o resultado, prevenindo reenvio duplicado (debounce/disable no clique), em `web/src/approval/approval-card.tsx` e `web/src/chat/chat-view.tsx` (depende de T029; SC-005)

**Checkpoint**: User Stories 1 e 3 funcionam juntas e de forma independente — ações sensíveis nunca executam sem aprovação.

---

## Phase 5: User Story 2 - Inspecionar o raciocínio por trás de uma resposta (Priority: P2)

**Goal**: Operador abre o `trace` tipado de uma resposta já recebida.

**Independent Test**: Clicar em "ver raciocínio" numa resposta existente e ver os passos estruturados por tipo (quickstart.md → Cenário 2).

### Tests for User Story 2

- [X] T031 [P] [US2] Frontend test: `trace-event` renderiza corretamente cada tipo de `TraceEvent` (thought/plan/action/observation/critique/answer/route/fallback), em `web/tests/trace/trace-event.test.tsx`
- [X] T032 [P] [US2] Frontend test: `trace-panel` abre/fecha sem perder o estado da conversa e mostra mensagem clara quando o trace está vazio, em `web/tests/trace/trace-panel.test.tsx`

### Implementation for User Story 2

- [X] T033 [P] [US2] Implementar `web/src/trace/trace-event.tsx`: um render por `TraceEvent["type"]` via `switch` exaustivo (`never` no `default`, research.md §6)
- [X] T034 [US2] Implementar `web/src/trace/trace-panel.tsx`: lista de `trace-event`, estado vazio, fechar/reabrir (depende de T033)
- [X] T035 [US2] Adicionar botão "ver raciocínio" em cada resposta do agente em `web/src/chat/message-list.tsx`, abrindo `trace-panel` com o `trace` daquela mensagem (depende de T034, T016)

**Checkpoint**: User Stories 1, 3 e 2 funcionam juntas e de forma independente.

---

## Phase 6: User Story 4 - Configurar a URL da API do agente (Priority: P3)

**Goal**: Operador altera a URL da API via engrenagem, com validação e persistência.

**Independent Test**: Abrir a engrenagem, salvar uma URL válida e nova, confirmar que a próxima chamada de chat usa essa URL (quickstart.md → Cenário 4).

### Tests for User Story 4

- [X] T036 [P] [US4] Frontend test: `settings-panel` rejeita URL inválida com erro inline e não persiste, em `web/tests/settings/settings-panel.test.tsx`
- [X] T037 [P] [US4] Frontend test: `settings-panel` salva URL válida, e uma nova instância do app carrega essa URL (persistência entre sessões), em `web/tests/settings/settings-panel.test.tsx`

### Implementation for User Story 4

- [X] T038 [P] [US4] Implementar `web/src/settings/settings-panel.tsx` (ícone de engrenagem, campo de URL, validação via `isValidApiUrl`, salvar via `setApiUrl`) — depende de T007
- [X] T039 [US4] Integrar o ícone de engrenagem e o `settings-panel` em `web/src/app.tsx` (depende de T038, T018)

**Checkpoint**: Todas as user stories funcionam de forma independente e integrada.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validação final e acabamento que atravessa todas as histórias

- [X] T040 [P] Revisar contraste, navegação por teclado e foco visível em todos os componentes novos de `web/src/` contra `.claude/instructions/design.instructions.md`
- [X] T041 [P] Revisar estados vazio/erro de `message-list.tsx`, `trace-panel.tsx` e `approval-card.tsx` para mensagens claras e acionáveis (design instructions)
- [X] T042 Rodar `npm run typecheck && npm test` na raiz (backend) e em `web/` (frontend), corrigindo qualquer falha
- [X] T043 Executar manualmente os 4 cenários de `quickstart.md` e registrar qualquer desvio encontrado

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **User Story 1 (Phase 3)**: depende só do Foundational
- **User Story 3 (Phase 4)**: depende do Foundational; integra-se ao `chat-view.tsx` de US1 (T029, T030), então na prática segue US1
- **User Story 2 (Phase 5)**: depende do Foundational; integra-se ao `message-list.tsx` de US1 (T035), então na prática segue US1
- **User Story 4 (Phase 6)**: depende só do Foundational (T007); pode rodar em paralelo a US2/US3 se outro desenvolvedor tocar `app.tsx` depois
- **Polish (Phase 7)**: depende de todas as histórias desejadas estarem completas

### Dentro de cada User Story

- Testes antes da implementação equivalente (escritos para falhar primeiro)
- Domínio/tipos antes de store; store antes de rota HTTP; rota HTTP antes de UI que a consome
- História completa e validada antes de prosseguir para a próxima prioridade

### Parallel Opportunities

- T002, T003 (Setup) em paralelo
- T005–T011 (Foundational) em paralelo entre si, exceto onde uma tarefa lê o resultado de outra (nenhuma dependência cruzada nessa fase)
- Testes de uma mesma história marcados [P] em paralelo entre si
- US1 e, após integrar T017/T016, as histórias US2/US3/US4 podem ser trabalhadas por desenvolvedores diferentes em paralelo, respeitando as dependências de integração acima

---

## Parallel Example: User Story 1

```bash
# Testes de US1 em paralelo:
Task: "Frontend test: message-composer dispara envio em web/tests/chat/message-composer.test.tsx"
Task: "Frontend test: message-list renderiza estados em web/tests/chat/message-list.test.tsx"

# Implementação de US1 em paralelo (componentes independentes):
Task: "Implementar web/src/chat/message-composer.tsx"
Task: "Implementar web/src/chat/message-list.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (crítico — bloqueia todas as histórias)
3. Completar Phase 3: User Story 1
4. **Parar e validar**: testar User Story 1 de forma independente (quickstart.md → Cenário 1)
5. Demonstrar se pronto

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 (chat) → validar independentemente → demo (MVP)
3. US3 (aprovar/negar) → validar independentemente → demo (guardrail de segurança ativo)
4. US2 (ver raciocínio) → validar independentemente → demo
5. US4 (configurar URL) → validar independentemente → demo
6. Polish → validação final

Ordem sugerida acima prioriza P1 (US1 e US3) antes de P2 (US2) e P3 (US4), mantendo cada incremento
entregável e testável isoladamente.
