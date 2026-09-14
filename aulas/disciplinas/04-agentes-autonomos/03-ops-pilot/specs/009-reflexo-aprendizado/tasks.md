---

description: "Task list template for feature implementation"
---

# Tasks: Reflexo de Aprendizado Automático

**Input**: Design documents from `/specs/009-reflexo-aprendizado/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/learning-reflector.md](./contracts/learning-reflector.md), [quickstart.md](./quickstart.md)

**Tests**: Incluídos e obrigatórios — a Constitution do projeto (Princípio IV) proíbe lógica nova sem teste; `typecheck` e `test` devem ficar verdes antes de seguir.

**Organization**: Tasks agrupadas por user story (spec.md) para permitir implementação e teste independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: A qual user story a tarefa pertence (US1, US2, US3)
- Caminhos de arquivo exatos em cada descrição

## Path Conventions

Projeto único (sem frontend), continuação de 008-memoria-semantica: `src/`, testes `*.test.ts` ao
lado do arquivo testado.

---

## Phase 1: Setup

**Purpose**: confirmar que nenhuma dependência nova é necessária antes de começar.

- [X] T001 Confirmar que nenhuma dependência nova é necessária (reaproveita `@langchain/core`, `zod` e o `MemoryStore` de 008 já instalados); nenhuma alteração em `package.json`

**Checkpoint**: nada a instalar; segue direto para o Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tipos e schemas compartilhados pelas três user stories (aprendizado automático,
exclusão de pedidos/segredos, e a tool de esquecer).

**⚠️ CRITICAL**: nenhuma user story pode ser implementada antes desta fase estar completa.

- [X] T002 [P] Criar `src/memory/learning-reflector.ts`: tipos `LearningVerdict`, `ReflectLearningInput`, `LearningReflectorFn` e o schema Zod `learningVerdictSchema` (`{ hasLearned: boolean, fact?: string }`), conforme [data-model.md](./data-model.md)
- [X] T003 [P] Adicionar `userId?: string` e `memoryStore?: MemoryStore` (opcionais) em `StrategyInput` (`src/domain/strategy.ts`)
- [X] T004 [P] Criar `forgetPreferenceSchema` (`{ description: string }`) em `src/agents/tools.ts`, conforme [contracts/learning-reflector.md](./contracts/learning-reflector.md)

**Checkpoint**: `npm run typecheck` passa; tipos prontos para as user stories usarem.

---

## Phase 3: User Story 1 - Sistema aprende fatos duráveis sem pedido explícito (Priority: P1) 🎯 MVP

**Goal**: depois de cada resposta do `/chat`, um passo de reflexão analisa a última mensagem do
usuário e, quando há um fato durável, memoriza-o automaticamente, sem atrasar a resposta já enviada
(spec FR-001, FR-002, FR-006).

**Independent Test**: enviar uma mensagem com um fato durável, aguardar a resposta, e verificar (via
`memoryStore.recall`) que o fato foi memorizado — sem que a resposta HTTP tenha esperado por isso.

### Tests for User Story 1 ⚠️

- [X] T005 [P] [US1] Teste `src/memory/learning-reflector.test.ts`: com um `LearningReflectorFn` mockado devolvendo `{ hasLearned: true, fact: "..." }`, `reflectLearning` chama `memoryStore.remember(userId, fact)`
- [X] T006 [P] [US1] Teste em `src/memory/learning-reflector.test.ts`: `reflectLearning` nunca lança, mesmo se o `LearningReflectorFn` mockado rejeitar (simula falha de provedor) — resolve normalmente, sem chamar `remember`
- [X] T007 [P] [US1] Teste em `src/memory/learning-reflector.test.ts`: `reflectLearning` com saída do reflector que falha a validação Zod (`fact` ausente mas `hasLearned: true`, por exemplo) é tratada como "nada aprendido", sem lançar e sem chamar `remember`
- [X] T008 [P] [US1] Teste em `src/http/server.test.ts`: `POST /chat` responde 200 sem aguardar a reflexão — usar um `memoryStore`/reflector fake com uma promise controlada manualmente e assertar que a resposta HTTP já chegou antes dela resolver (FR-006, SC-004)

### Implementation for User Story 1

- [X] T009 [US1] Implementar em `src/memory/learning-reflector.ts`: `defaultLearningReflector: LearningReflectorFn` usando `createModel().withStructuredOutput(learningVerdictSchema)` sobre um prompt com a última mensagem do usuário e a resposta do assistente como contexto (mesmo padrão de `critique`/`CriticFn` em `src/agents/reflection.ts`)
- [X] T010 [US1] Implementar em `src/memory/learning-reflector.ts`: `reflectLearning(input: ReflectLearningInput, reflectorFn: LearningReflectorFn = defaultLearningReflector): Promise<void>` — chama `reflectorFn`, valida com `learningVerdictSchema`, e se `hasLearned && fact` chama `memoryStore.remember(userId, fact)`; qualquer erro em qualquer etapa é capturado e a função resolve sem lançar
- [X] T011 [US1] Em `src/http/server.ts`: após `res.status(200).json(...)`, disparar `reflectLearning({ request: message, answer: result.answer, userId, memoryStore: deps.memoryStore })` sem `await` (fire-and-forget), substituindo a chamada direta `deps.memoryStore.remember(userId, message)` de 008

**Checkpoint**: User Story 1 funcional e testável de forma independente — fatos duráveis mencionados
naturalmente passam a ser memorizados, sem atraso perceptível na resposta.

---

## Phase 4: User Story 2 - Sistema não aprende pedidos pontuais nem informações sensíveis (Priority: P1)

**Goal**: a reflexão distingue fato durável de pedido pontual e de informação sensível, memorizando
somente a parte durável mesmo quando misturada a um pedido (spec FR-003, FR-004, FR-005, FR-009).

**Independent Test**: enviar uma mensagem só com um pedido pontual e verificar que nada é
memorizado; repetir com uma mensagem contendo dado sensível; repetir com uma mensagem que mistura
pedido pontual e fato durável e verificar que só o fato durável é memorizado.

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] Teste em `src/memory/learning-reflector.test.ts`: com um `LearningReflectorFn` mockado devolvendo `{ hasLearned: false }` (simulando um pedido pontual, ex.: "abra um incidente"), `reflectLearning` não chama `remember` (FR-003, FR-009)
- [X] T013 [P] [US2] Teste em `src/memory/learning-reflector.test.ts`: com um `LearningReflectorFn` mockado que, para uma mensagem misturando pedido pontual e fato durável, devolve `{ hasLearned: true, fact: "<só a parte durável>" }`, `reflectLearning` chama `remember` apenas com o fato extraído, nunca com a mensagem completa/o pedido (FR-005)
- [X] T014 [P] [US2] Teste (revisão de prompt) em `src/memory/learning-reflector.test.ts`: o prompt do sistema usado por `defaultLearningReflector` contém instruções explícitas para nunca extrair pedidos pontuais nem informação sensível/confidencial (verificação textual do prompt exportado, sem chamar o modelo real) — FR-004

### Implementation for User Story 2

- [X] T015 [US2] Escrever o prompt do sistema de `defaultLearningReflector` (`src/memory/learning-reflector.ts`) com as instruções de exclusão (nunca pedido pontual, nunca informação sensível/confidencial, extrair apenas a parte durável quando houver mistura), exportado como constante testável (T014)

**Checkpoint**: User Stories 1 e 2 funcionam juntas — aprendizado automático correto e restrito a
fatos duráveis não sensíveis.

---

## Phase 5: User Story 3 - Usuário pode pedir para o assistente esquecer uma preferência (Priority: P2)

**Goal**: uma tool `forget_preference`, disponível durante a conversa, permite ao usuário pedir em
linguagem natural para esquecer uma preferência memorizada (spec FR-007, FR-008).

**Independent Test**: memorizar uma preferência, enviar ao `/chat` uma mensagem pedindo para
esquecê-la, e confirmar (via `recall`) que ela não é mais retornada.

### Tests for User Story 3 ⚠️

- [X] T016 [P] [US3] Teste em `src/agents/tools.test.ts`: `forget_preference` sem nenhum candidato (`recall` vazio) devolve `{ ok: false, ... }` e não chama `forget`
- [X] T017 [P] [US3] Teste em `src/agents/tools.test.ts`: `forget_preference` com exatamente um candidato acima do corte de relevância chama `memoryStore.forget(userId, id)` e devolve `{ ok: true, data: { forgotten: fact } }`
- [X] T018 [P] [US3] Teste em `src/agents/tools.test.ts`: `forget_preference` com múltiplos candidatos plausíveis não chama `forget`, devolve `{ ok: true, data: { candidates: [...] } }` (edge case de pedido ambíguo, FR-008/spec Edge Cases)
- [X] T019 [P] [US3] Teste em `src/http/server.test.ts`: `/chat` com uma estratégia fake que invoca a tool `forget_preference` disponível em `StrategyInput` remove a preferência correspondente do `memoryStore` (teste de integração ponta a ponta da US3)

### Implementation for User Story 3

- [X] T020 [US3] Implementar `makeMemoryTools(memoryStore: MemoryStore, userId: string)` em `src/agents/tools.ts`, retornando `[forget_preference]` conforme [contracts/learning-reflector.md](./contracts/learning-reflector.md): `recall` com `limit: 3`, decide entre "sem candidato" / "um candidato" (chama `forget`) / "múltiplos candidatos" (não remove, devolve lista), usando `asToolResult`
- [X] T021 [US3] Em `src/agents/react.ts`: quando `input.memoryStore` e `input.userId` estiverem presentes, incluir `...makeMemoryTools(input.memoryStore, input.userId)` na lista de tools do agente (`tools: [...makeTools(input.store), ...]`)
- [X] T022 [US3] Em `src/agents/plan-and-execute.ts`: mesma inclusão de `makeMemoryTools(...)` nas tools do `executorAgent`, quando `input.memoryStore`/`input.userId` estiverem presentes
- [X] T023 [US3] Em `src/http/server.ts`: passar `userId` e `memoryStore: deps.memoryStore` para `strategy.run({...})`, ao lado dos campos já existentes (`store`, `history`, `memories`)

**Checkpoint**: as três user stories funcionam de forma independente e integrada.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: validação final e consistência com o restante do projeto.

- [X] T024 [P] Rodar `npm run typecheck` e `npm test` com todas as fases concluídas; corrigir qualquer regressão
- [X] T025 Executar o roteiro manual de [quickstart.md](./quickstart.md) (`npm run http` + chamadas `curl`) para validar o fluxo end-to-end: aprendizado automático, exclusão de pedido pontual, e esquecer por linguagem natural

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências — pode começar imediatamente
- **Foundational (Phase 2)**: depende do Setup — BLOQUEIA todas as user stories
- **User Story 1 (Phase 3)**: depende apenas do Foundational
- **User Story 2 (Phase 4)**: depende do Foundational e reaproveita a mesma função `reflectLearning`
  de US1 (T010) — por isso vem depois na ordem sugerida, mas seus testes (T012-T014) exercitam
  `reflectLearning` com mocks independentes, sem exigir que T009/T011 estejam prontos
- **User Story 3 (Phase 5)**: depende apenas do Foundational (T003/T004); independente de US1/US2 —
  pode ser implementada em paralelo por outra pessoa
- **Polish (Phase 6)**: depende de todas as user stories desejadas estarem completas

### Within Each User Story

- Testes antes da implementação (escritos para falhar primeiro)
- Tipos/schemas (Foundational) antes de qualquer implementação
- `reflectLearning` (US1) antes da integração em `server.ts` (T011)
- `makeMemoryTools` (US3) antes de conectá-la às estratégias (T021, T022)

### Parallel Opportunities

- T002–T004 (Foundational, arquivos/trechos diferentes) podem rodar em paralelo
- T005–T008 (testes US1) podem rodar em paralelo entre si
- T012–T014 (testes US2) podem rodar em paralelo entre si
- T016–T019 (testes US3) podem rodar em paralelo entre si
- Depois do Foundational, US1+US2 (mesma área de código) e US3 (tool independente) podem ser
  desenvolvidas em paralelo por pessoas diferentes

---

## Parallel Example: Foundational

```bash
Task: "Criar tipos e schema em src/memory/learning-reflector.ts"
Task: "Adicionar userId?/memoryStore? em StrategyInput (src/domain/strategy.ts)"
Task: "Criar forgetPreferenceSchema em src/agents/tools.ts"
```

## Parallel Example: User Story 1 (testes)

```bash
Task: "Teste: reflectLearning chama remember quando hasLearned é true"
Task: "Teste: reflectLearning nunca lança quando o reflector mockado rejeita"
Task: "Teste: reflectLearning trata saída inválida como nada aprendido"
Task: "Teste: POST /chat responde antes da reflexão terminar"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloqueia todas as stories)
3. Completar Phase 3: User Story 1 (aprendizado automático básico)
4. **PARAR e VALIDAR**: testar que um fato durável mencionado naturalmente é memorizado, sem atraso
   na resposta
5. Nesse ponto o sistema já aprende automaticamente, mas ainda depende do prompt de US2 para garantir
   a exclusão de pedidos pontuais/segredos com rigor — validar isso antes de expor a usuários reais

### Incremental Delivery

1. Setup + Foundational → tipos prontos
2. US1 (`reflectLearning` básico + integração fire-and-forget) → aprendizado automático funcionando
3. US2 (prompt de exclusão + testes de pedido pontual/sensível/misto) → aprendizado seguro e restrito
   — **este incremento fecha a promessa central da spec (US1+US2 juntas)**
4. US3 (`forget_preference`) → usuário ganha controle para corrigir o que foi aprendido
5. Cada story soma valor sem quebrar as anteriores

---

## Notes

- [P] tasks = arquivos/trechos diferentes, sem dependência entre si
- [Story] mapeia a tarefa à user story correspondente da spec
- Testes devem ser escritos e falhar antes da implementação (Constitution, Princípio IV)
- Cada tarefa cabe em um commit pequeno e reversível (Constitution, Fluxo de Desenvolvimento)
- Rodar `npm run typecheck` e `npm test` ao final de cada fase
