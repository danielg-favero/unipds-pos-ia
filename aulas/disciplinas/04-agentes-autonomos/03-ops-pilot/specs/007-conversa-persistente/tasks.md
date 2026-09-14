---

description: "Task list for Conversa Persistente"
---

# Tasks: Conversa Persistente

**Input**: Design documents from `/specs/007-conversa-persistente/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/http-chat.md](./contracts/http-chat.md)

**Tests**: Incluídos e obrigatórios — Constitution Principle IV ("Teste é Parte da Tarefa,
NON-NEGOTIABLE") exige teste para toda lógica nova; `typecheck` e `test` devem ficar verdes a cada
fase.

**Organization**: Tarefas agrupadas por user story do spec.md para permitir implementação e teste
independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1/US2/US3, mapeado às user stories do spec.md
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto único — `src/` na raiz do repositório (ver Project Structure em [plan.md](./plan.md)).

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Tipos e contratos compartilhados por todas as user stories — sem projeto novo para
inicializar (feature estende `src/http/server.ts` já existente), então esta é a única fase antes das
stories.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase estar completa.

- [X] T001 [P] Definir `ConversationRole`, `ConversationMessage` e a porta `ConversationStore`
      (`create`/`append`/`lastMessages`) em `src/store/conversation-port.ts`, conforme
      [data-model.md](./data-model.md)
- [X] T002 [P] Adicionar `history?: readonly ConversationMessage[]` a `StrategyInput` e
      `historyMessages: number` a `RunMetrics` em `src/domain/strategy.ts`
- [X] T003 Estender `RunTracker` para receber a contagem de histórico no construtor e devolvê-la em
      `snapshot()` (`historyMessages`) em `src/agents/metrics.ts` (depende de T002)
- [X] T004 [P] Adicionar `conversation: z.string().min(1).optional()` a `chatRequestSchema` em
      `src/http/schemas.ts`
- [X] T005 Atualizar os literais de `RunMetrics` existentes para incluir `historyMessages` (valor `0`
      nos fakes que não testam histórico) em `src/bench/scenarios.test.ts` e
      `src/agents/reflection.test.ts` — necessário para o projeto continuar compilando após T002
      (depende de T002)

**Checkpoint**: `npm run typecheck` e `npm test` verdes; porta e tipos prontos para as user stories.

---

## Phase 2: User Story 1 - Plantonista continua uma conversa anterior (Priority: P1) 🎯 MVP

**Goal**: `POST /chat` aceita `conversation` opcional, cria uma conversa quando omitido, devolve o
identificador na resposta, e usa o histórico da conversa para compor o contexto enviado à estratégia
`react` (default).

**Independent Test**: Enviar `POST /chat` sem `conversation`, pegar o `conversation` da resposta,
enviar uma segunda requisição com esse `conversation` e confirmar que a estratégia recebeu o histórico
da primeira troca.

### Tests for User Story 1

- [X] T006 [P] [US1] Teste de `MemoryConversationStore`: `create()` gera ids distintos, `append` +
      `lastMessages` devolvem mensagens em ordem cronológica, conversa sem mensagens devolve `[]`, em
      `src/store/conversation-port.test.ts`
- [X] T007 [US1] Teste de integração em `src/http/server.test.ts`: `POST /chat` sem `conversation`
      devolve um `conversation` novo na resposta e `metrics.historyMessages === 0`; uma segunda
      requisição com esse `conversation` faz a estratégia fake receber `input.history` com a mensagem
      do usuário e a resposta da primeira troca (depende de uma fake strategy que capture `input`,
      adicionada nesta mesma tarefa)

### Implementation for User Story 1

- [X] T008 [P] [US1] Implementar `MemoryConversationStore` (fake) satisfazendo `ConversationStore` em
      `src/store/memory-conversation.ts` (depende de T001)
- [X] T009 [US1] Compor `history` (se houver) + `request` na lista inicial de mensagens do agente em
      `src/agents/react.ts`, e usar `input.history?.length ?? 0` ao construir o `RunTracker` (depende
      de T001, T003)
- [X] T010 [US1] Adicionar `conversationStore: ConversationStore` a `ServerDeps`; em `POST /chat`,
      resolver `conversationId` (`parsed.data.conversation ?? await
      deps.conversationStore.create()`), buscar `lastMessages(conversationId, 12)`, repassar como
      `history` para a estratégia, incluir `conversation: conversationId` na resposta 200, e — só em
      caso de sucesso — gravar (`append`) a mensagem do usuário e a resposta do assistente, nessa
      ordem, em `src/http/server.ts` (depende de T001, T004, T008, T009)
- [X] T011 [US1] Instanciar `MemoryConversationStore` em `main()` (wiring de produção provisório,
      substituído por `SqliteConversationStore` na User Story 3) em `src/http/server.ts` (depende de
      T010)

**Checkpoint**: User Story 1 completa e testável de forma independente — conversa mantém contexto
dentro do tempo de vida do processo.

---

## Phase 3: User Story 2 - Assistente mantém respostas relevantes em conversas longas (Priority: P2)

**Goal**: O contexto composto nunca ultrapassa as 12 mensagens mais recentes, e essa contagem fica
disponível como métrica (`historyMessages`) em toda execução que use histórico.

**Independent Test**: Popular uma conversa com mais de 12 mensagens, enviar uma nova requisição e
confirmar (via `metrics.historyMessages`) que só as 12 mais recentes entraram no contexto.

### Tests for User Story 2

- [X] T012 [P] [US2] Teste em `src/store/conversation-port.test.ts`: `MemoryConversationStore` com mais
      de 12 mensagens gravadas — `lastMessages(id, 12)` devolve exatamente as 12 mais recentes, em
      ordem cronológica (depende de T006)
- [X] T013 [US2] Teste de integração em `src/http/server.test.ts`: conversa com mais de 12 mensagens
      trocadas — a próxima resposta traz `metrics.historyMessages === 12` (depende de T007)

### Implementation for User Story 2

- [X] T014 [US2] Extrair a janela de histórico (`12`) para uma constante nomeada usada na chamada a
      `lastMessages` em `src/http/server.ts` (depende de T010) — comportamento já implementado em US1;
      esta tarefa apenas nomeia a constante e garante que T012/T013 passem

**Checkpoint**: User Stories 1 e 2 funcionam de forma independente; limite de 12 mensagens validado por
teste.

---

## Phase 4: User Story 3 - Histórico sobrevive a reinícios do processo (Priority: P2)

**Goal**: Conversas e mensagens persistem em SQLite, sobrevivendo a reinícios do processo, seguindo o
mesmo padrão de `SqliteOpsStore`.

**Independent Test**: Criar uma conversa, trocar mensagens, reiniciar o processo (nova instância do
store sobre o mesmo arquivo) e confirmar que o histórico anterior ainda é usado.

### Tests for User Story 3

- [X] T015 [P] [US3] Teste de `SqliteConversationStore` sobre `:memory:`: `create`/`append`/
      `lastMessages` com o mesmo contrato de comportamento de `MemoryConversationStore` (ordem,
      limite, conversa vazia) em `src/store/sqlite/sqlite-conversation-store.test.ts`
- [X] T016 [US3] Teste de persistência entre reinícios: gravar mensagens numa instância sobre um
      arquivo temporário, fechar, abrir uma segunda instância sobre o mesmo arquivo e confirmar que
      `lastMessages` ainda devolve o histórico gravado, em
      `src/store/sqlite/sqlite-conversation-store.test.ts` (depende de T015; segue o padrão de
      `src/store/sqlite/sqlite-ops-store.test.ts`)

### Implementation for User Story 3

- [X] T017 [P] [US3] Criar o DDL idempotente da tabela `messages` (com índice em `conversation_id`) em
      `src/store/sqlite/conversation-schema.ts`, conforme [data-model.md](./data-model.md) (depende de
      T001)
- [X] T018 [US3] Implementar `SqliteConversationStore` (prepared statements para `create`/`append`/
      `lastMessages`, usando o mesmo arquivo `OPSPILOT_DB`) em
      `src/store/sqlite/sqlite-conversation-store.ts` (depende de T001, T017)
- [X] T019 [US3] Trocar o wiring de produção em `main()` de `MemoryConversationStore` para
      `SqliteConversationStore` em `src/http/server.ts` (depende de T011, T018)

**Checkpoint**: Todas as user stories funcionam de forma independente; histórico sobrevive a reinícios
em produção.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Cobrir FR-010 (histórico compatível com `strategy`/`reflect` já existentes) e fechar a
validação end-to-end.

- [X] T020 [P] Compor `history` na lista inicial de mensagens do agente em
      `src/agents/plan-and-execute.ts`, mesmo padrão de T009 (depende de T001, T003)
- [X] T021 [P] Repassar `history`/`historyMessages` sem alteração ao envolver uma estratégia base em
      `src/agents/reflection.ts` (a autocrítica não deve descartar o histórico da tentativa base) —
      inclui teste cobrindo esse repasse em `src/agents/reflection.test.ts` (depende de T002, T005)
- [ ] T022 Rodar a validação manual de [quickstart.md](./quickstart.md) contra o servidor real
      (`npm run http`), confirmando os sinais de sucesso (SC-001 a SC-004)
- [X] T023 Rodar `npm run typecheck` e `npm test` completos após todas as tarefas acima

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: sem dependências — bloqueia todas as user stories
- **User Story 1 (Phase 2)**: depende de Phase 1 completa
- **User Story 2 (Phase 3)**: depende de Phase 1; na prática também depende de US1 (T010) já existir,
  pois valida um comportamento do mesmo caminho de código
- **User Story 3 (Phase 4)**: depende de Phase 1; troca o wiring de produção introduzido em US1 (T011)
- **Polish (Phase 5)**: depende de Phase 1 (tipos) — pode rodar em paralelo com US2/US3, mas T022/T023
  só fazem sentido depois de todas as stories desejadas estarem prontas

### User Story Dependencies

- **US1 (P1)**: nenhuma dependência de outra story — é o MVP
- **US2 (P2)**: reusa o caminho de código de US1 (T010); independentemente testável assim que US1 está
  pronta
- **US3 (P2)**: substitui apenas o adaptador de armazenamento usado por US1 (T011 → T019); não altera
  o contrato HTTP nem o comportamento de US1/US2

### Parallel Opportunities

- T001, T002, T004 em paralelo (arquivos diferentes); T003 e T005 dependem de T002
- Dentro de US1: T006 e T008 em paralelo; T009 pode rodar em paralelo com T006/T008 (arquivos
  diferentes), mas T010 depende de T008 e T009
- Dentro de US3: T015/T017 em paralelo antes de T018
- T020 e T021 (Polish) em paralelo entre si e com US2/US3, todos dependendo só de Phase 1

---

## Parallel Example: Foundational

```bash
Task: "Definir ConversationStore em src/store/conversation-port.ts"
Task: "Adicionar conversation opcional a chatRequestSchema em src/http/schemas.ts"
```

## Parallel Example: User Story 1

```bash
Task: "Teste de MemoryConversationStore em src/store/conversation-port.test.ts"
Task: "Implementar MemoryConversationStore em src/store/memory-conversation.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Foundational
2. Completar Phase 2: User Story 1
3. **PARAR e VALIDAR**: rodar `npm test` e o passo 2-3 de [quickstart.md](./quickstart.md)
4. Demonstrar: conversa mantém contexto dentro da vida do processo (sem sobreviver a reinício ainda)

### Incremental Delivery

1. Foundational → base pronta
2. US1 → conversa com contexto em memória (MVP)
3. US2 → limite de 12 mensagens validado por teste
4. US3 → histórico sobrevive a reinícios (troca `MemoryConversationStore` por
   `SqliteConversationStore` em produção, sem tocar o contrato HTTP)
5. Polish → `plan-and-execute`/`reflect` também compõem histórico (FR-010); validação manual final

---

## Notes

- [P] = arquivos diferentes, sem dependência entre si
- [Story] mapeia a tarefa à user story correspondente para rastreabilidade
- Cada user story é completável e testável de forma independente
- `typecheck`/`test` devem ficar verdes ao final de cada fase (Constitution IV)
- Commitar por tarefa ou por grupo lógico pequeno e reversível (Fluxo de Desenvolvimento da
  constitution)
