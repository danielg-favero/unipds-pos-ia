---

description: "Task list template for feature implementation"
---

# Tasks: Memória Semântica por Usuário

**Input**: Design documents from `/specs/008-memoria-semantica/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/memory-store.md](./contracts/memory-store.md), [quickstart.md](./quickstart.md)

**Tests**: Incluídos e obrigatórios — a Constitution do projeto (Princípio IV) proíbe lógica nova sem teste; `typecheck` e `test` devem ficar verdes antes de seguir.

**Organization**: Tasks agrupadas por user story (spec.md) para permitir implementação e teste independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto único (sem frontend): `src/`, testes `*.test.ts` ao lado do arquivo testado (padrão já usado
pelo repositório, ex. `src/store/conversation-port.test.ts`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: preparar a dependência nova antes de qualquer código de memória.

- [X] T001 Adicionar `@huggingface/transformers` como dependência em `package.json` (`npm install @huggingface/transformers`)

**Checkpoint**: dependência instalada, `npm install` roda sem erro.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestrutura de embeddings, schema de banco e tipos/skeleton do store —
tudo que as três user stories (remember, recall, forget) vão compartilhar.

**⚠️ CRITICAL**: nenhuma user story pode ser implementada antes desta fase estar completa.

- [X] T002 [P] Criar `src/memory/embeddings.ts`: singleton lazy do pipeline `feature-extraction` (`Xenova/all-MiniLM-L6-v2`, `pooling: "mean"`, `normalize: true`) via `@huggingface/transformers`, expondo `embed(text: string): Promise<Float32Array>`
- [X] T003 [P] Teste `src/memory/embeddings.test.ts`: `embed()` retorna vetor de 384 posições com norma ≈ 1 (vetor normalizado); duas chamadas concorrentes reutilizam a mesma instância do pipeline (singleton)
- [X] T004 [P] Criar `src/memory/similarity.ts`: função pura `dotProduct(a: Float32Array, b: Float32Array): number`
- [X] T005 [P] Teste `src/memory/similarity.test.ts`: `dotProduct` de vetores idênticos normalizados ≈ 1; de vetores ortogonais = 0
- [X] T006 [P] Definir tipos e a interface `MemoryStore` (`remember`/`recall`/`forget`, `Memory`, `RecalledMemory`) em `src/memory/memory-store.ts`, conforme [contracts/memory-store.md](./contracts/memory-store.md) e [data-model.md](./data-model.md)
- [X] T007 Criar `src/store/sqlite/memory-schema.ts`: `ensureMemorySchema(db)` idempotente, criando a tabela `memories (id TEXT PRIMARY KEY, user_id TEXT, fact TEXT, embedding BLOB, created_at TEXT DEFAULT CURRENT_TIMESTAMP)` e o índice `idx_memories_user_id` — mesmo padrão de `src/store/sqlite/conversation-schema.ts`
- [X] T008 Criar `src/store/sqlite/sqlite-memory-store.ts`: classe `SqliteMemoryStore` com construtor (`path` default `OPSPILOT_DB`, `mkdirSync` + `DatabaseSync` + `ensureMemorySchema`, mesmo padrão de `SqliteConversationStore`), prepared statements para insert/select/delete por `user_id`, e (de)serialização do `embedding` (`Float32Array` ↔ `BLOB`) — métodos `remember`/`recall`/`forget` ainda não implementados (lançam `not implemented` ou ficam com corpo vazio até as fases seguintes)

**Checkpoint**: `npm run typecheck` passa; embeddings e schema prontos para as user stories usarem.

---

## Phase 3: User Story 1 - Lembrar fatos sem duplicar (Priority: P1) 🎯 MVP

**Goal**: `remember(userId, fact)` grava um novo fato e nunca duplica um fato (quase-)idêntico já
memorizado para o mesmo usuário (spec FR-001, FR-002, FR-003, FR-012).

**Independent Test**: chamar `remember` duas vezes com o mesmo fato (ou uma reformulação muito
próxima) para o mesmo `userId` e verificar que apenas uma linha existe na tabela `memories`.

### Tests for User Story 1 ⚠️

- [X] T009 [P] [US1] Teste `src/store/sqlite/sqlite-memory-store.test.ts`: `remember` grava um novo fato com `userId`, `fact`, embedding e `createdAt` (FR-001, FR-012)
- [X] T010 [P] [US1] Teste em `src/store/sqlite/sqlite-memory-store.test.ts`: `remember` chamado duas vezes com o mesmo fato para o mesmo `userId` resulta em uma única linha (dedup > 0.92, FR-003)
- [X] T011 [P] [US1] Teste em `src/store/sqlite/sqlite-memory-store.test.ts`: `remember` do mesmo fato para `userId` diferentes cria uma linha por usuário (sem dedup entre usuários, spec Edge Cases)

### Implementation for User Story 1

- [X] T012 [US1] Implementar `remember` em `src/store/sqlite/sqlite-memory-store.ts`: gerar embedding via `embed()` (T002), carregar embeddings existentes do `userId` (prepared statement de T008), comparar com `dotProduct` (T004); se algum score `> 0.92`, não gravar; senão, inserir nova linha

**Checkpoint**: User Story 1 funcional e testável de forma independente (`npm test -- --test-name-pattern=remember` ou equivalente).

---

## Phase 4: User Story 2 - Assistente usa memórias relevantes na conversa (Priority: P1)

**Goal**: `recall(userId, query)` recupera os até 3 fatos mais relevantes (produto escalar ≥ 0.3),
mesmo sem palavra em comum com a consulta; `POST /chat` passa a exigir `userId`, chama `recall`
antes da estratégia e injeta os fatos no contexto do agente (FR-004 a FR-011).

**Independent Test**: memorizar um fato com um vocabulário e enviar ao `/chat` uma mensagem sobre o
mesmo assunto usando palavras diferentes; verificar que a resposta reflete o fato memorizado.

### Tests for User Story 2 ⚠️

- [X] T013 [P] [US2] Teste em `src/store/sqlite/sqlite-memory-store.test.ts`: `recall` encontra um fato relevante para uma consulta que não compartilha nenhuma palavra com o fato memorizado (teste explícito pedido na feature)
- [X] T014 [P] [US2] Teste em `src/store/sqlite/sqlite-memory-store.test.ts`: `recall` nunca retorna mais que 3 resultados e descarta scores `< 0.3` (FR-004, FR-005)
- [X] T015 [P] [US2] Teste em `src/store/sqlite/sqlite-memory-store.test.ts`: `recall` de um `userId` nunca retorna fatos de outro `userId` (FR-001, SC-005)
- [X] T016 [P] [US2] Teste em `src/store/sqlite/sqlite-memory-store.test.ts`: `recall` para um `userId` sem memórias retorna array vazio (sem erro)
- [X] T017 [P] [US2] Teste em `src/http/schemas.test.ts` (novo arquivo, ou seção em `src/http/server.test.ts`): `chatRequestSchema` rejeita corpo sem `userId`
- [X] T018 [US2] Teste em `src/http/server.test.ts`: `/chat` com `userId` e uma memória previamente gravada injeta o fato no contexto do agente e a resposta reflete o fato memorizado, mesmo sem palavras em comum com a mensagem atual (usa um dublê/stub de estratégia para inspecionar o `StrategyInput` recebido)
- [X] T019 [P] [US2] Teste em `src/http/server.test.ts`: `/chat` para `userId` sem memórias responde normalmente, sem `memories` no `StrategyInput` (ou lista vazia) — FR-011

### Implementation for User Story 2

- [X] T020 [US2] Implementar `recall` em `src/store/sqlite/sqlite-memory-store.ts`: gerar embedding da `query`, carregar embeddings do `userId`, calcular `dotProduct`, filtrar `score >= 0.3`, ordenar desc, retornar os `limit` (default 3) primeiros como `RecalledMemory[]`
- [X] T021 [US2] Adicionar `userId: z.string().min(1)` obrigatório em `chatRequestSchema` (`src/http/schemas.ts`)
- [X] T022 [US2] Adicionar campo opcional `memories?: readonly string[]` em `StrategyInput` (`src/domain/strategy.ts`)
- [X] T023 [US2] Em `src/http/server.ts`: instanciar/injetar `MemoryStore` via `ServerDeps` (novo campo `memoryStore: MemoryStore`), chamar `memoryStore.recall(userId, message)` antes de `strategy.run(...)` e passar o resultado (`.map(m => m.fact)`) como `memories` no `StrategyInput`; após resposta bem-sucedida, chamar `memoryStore.remember(userId, message)` de forma best-effort (não bloquear a resposta em caso de falha)
- [X] T024 [US2] Em `src/agents/react.ts` (e demais estratégias que compõem o prompt a partir de `history`, ex. `src/agents/plan-and-execute.ts`, `src/agents/reflection.ts`): quando `input.memories` não for vazio, prefixar as mensagens com um contexto adicional listando os fatos memorizados, antes do histórico da conversa
- [X] T025 [US2] Atualizar `main()` em `src/http/server.ts` para construir e injetar `SqliteMemoryStore` (mesmo padrão de `SqliteConversationStore`/`SqliteOpsStore`)

**Checkpoint**: User Stories 1 e 2 funcionam de forma independente e integrada; `/chat` usa memória.

---

## Phase 5: User Story 3 - Usuário pode remover um fato memorizado (Priority: P2)

**Goal**: `forget(userId, memoryId)` remove um fato específico, de forma idempotente (FR-007, FR-008).

**Independent Test**: memorizar um fato, chamar `forget` com o `id` retornado e confirmar que
`recall` não o retorna mais; chamar `forget` novamente com o mesmo `id` não lança erro.

### Tests for User Story 3 ⚠️

- [X] T026 [P] [US3] Teste em `src/store/sqlite/sqlite-memory-store.test.ts`: `forget` remove um fato existente; `recall` subsequente não o retorna mais (FR-007, SC-004)
- [X] T027 [P] [US3] Teste em `src/store/sqlite/sqlite-memory-store.test.ts`: `forget` com `memoryId` inexistente (ou de outro `userId`) não lança erro e não afeta outras linhas (FR-008)

### Implementation for User Story 3

- [X] T028 [US3] Implementar `forget` em `src/store/sqlite/sqlite-memory-store.ts`: `DELETE FROM memories WHERE id = ? AND user_id = ?` via prepared statement, sem lançar erro se nenhuma linha for afetada

**Checkpoint**: as três user stories funcionam de forma independente e integrada.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: validação final e consistência com o restante do projeto.

- [X] T029 [P] Rodar `npm run typecheck` e `npm test` com todas as fases concluídas; corrigir qualquer regressão
- [X] T030 Executar o roteiro manual de [quickstart.md](./quickstart.md) (`npm run http` + chamadas `curl`) para validar o fluxo end-to-end de `/chat` com memória
- [X] T031 [P] Revisar `README.md` (se documentar endpoints/variáveis de ambiente do projeto) para mencionar o campo `userId` obrigatório em `/chat`, se aplicável

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **User Story 1 (Phase 3)**: depende apenas do Foundational
- **User Story 2 (Phase 4)**: depende do Foundational; reaproveita a tabela/embedding já usados por US1, mas `recall` é independente de `remember` internamente — pode ser implementada e testada mesmo sem US1 (basta inserir fixtures diretamente na tabela nos testes)
- **User Story 3 (Phase 5)**: depende do Foundational; `forget` é independente de `remember`/`recall` na implementação, mas seu teste de independência (T026) usa `remember`/`recall` já implementados por US1/US2 para validar o efeito ponta a ponta — por isso vem depois na ordem sugerida
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas

### Within Each User Story

- Testes antes da implementação (escritos para falhar primeiro)
- Schema/embeddings (Foundational) antes de qualquer método do store
- Store (`SqliteMemoryStore`) antes da integração HTTP (US2)

### Parallel Opportunities

- T002–T006 (Foundational, arquivos diferentes) podem rodar em paralelo
- T009–T011 (testes US1) podem rodar em paralelo entre si
- T013–T017 e T019 (testes US2 em arquivos/casos distintos) podem rodar em paralelo
- T026–T027 (testes US3) podem rodar em paralelo
- Depois do Foundational, US1 e US3 podem ser desenvolvidas em paralelo por pessoas diferentes; US2 depende apenas do Foundational para sua própria implementação, mas seu teste de integração ponta a ponta (T018) fica mais simples de verificar visualmente depois que US1 (remember) existe

---

## Parallel Example: Foundational

```bash
# Após T001 (setup), em paralelo:
Task: "Criar src/memory/embeddings.ts (singleton lazy do pipeline)"
Task: "Criar src/memory/similarity.ts (dotProduct)"
Task: "Definir tipos/interface MemoryStore em src/memory/memory-store.ts"
```

## Parallel Example: User Story 1 (testes)

```bash
Task: "Teste: remember grava um novo fato"
Task: "Teste: remember não duplica fato repetido para o mesmo userId"
Task: "Teste: remember não deduplica entre userIds diferentes"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloqueia todas as stories)
3. Completar Phase 3: User Story 1 (`remember` com dedup)
4. **PARAR e VALIDAR**: testar `remember` de forma independente
5. Nesse ponto o MVP ainda não altera o comportamento observável do `/chat` (recall só chega na
   Phase 4) — é a base de dados de memória funcionando isoladamente

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 (`remember`) → memórias podem ser gravadas e deduplicadas
3. US2 (`recall` + integração `/chat`) → valor visível ao usuário final (memória influencia respostas) — **este é o incremento que entrega a promessa central da spec**
4. US3 (`forget`) → completa o ciclo de vida da memória (correção/privacidade)
5. Cada story soma valor sem quebrar as anteriores

---

## Notes

- [P] tasks = arquivos diferentes, sem dependência entre si
- [Story] mapeia a tarefa à user story correspondente da spec
- Testes devem ser escritos e falhar antes da implementação (Constitution, Princípio IV)
- Cada tarefa cabe em um commit pequeno e reversível (Constitution, Fluxo de Desenvolvimento)
- Rodar `npm run typecheck` e `npm test` ao final de cada fase
