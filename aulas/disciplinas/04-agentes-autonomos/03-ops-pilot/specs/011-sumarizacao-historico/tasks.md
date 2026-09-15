---

description: "Task list template for feature implementation"
---

# Tasks: Sumarização de Histórico (Pruning de Contexto)

**Input**: Design documents from `/specs/011-sumarizacao-historico/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Solicitados explicitamente ("Com teste fake") e exigidos pela Constitution (Princípio IV,
non-negotiable). Todo teste usa um resumidor fake determinístico — nenhuma chamada real a LLM.

**Organization**: Tarefas agrupadas por user story (spec.md) para permitir implementação e teste
independentes de cada uma.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: US1, US2 ou US3 (spec.md)
- Caminhos de arquivo seguem a convenção já usada no repo: teste `*.test.ts` ao lado do arquivo
  de implementação (ex.: `src/memory/learning-reflector.ts` / `.test.ts`)

## Path Conventions

Projeto único (sem `frontend`/`backend` separados): código em `src/`, testes co-localizados como
`*.test.ts` ao lado do arquivo correspondente — mesmo padrão de `src/memory/learning-reflector.ts`,
`src/store/sqlite/sqlite-conversation-store.ts`, etc.

---

## Phase 1: Setup

Não há inicialização de projeto/dependências novas — a feature reaproveita 100% do stack já
configurado (Node 24, TypeScript, Zod, `node:sqlite`, `node:test`/`tsx`, Express, LangChain). Fase
sem tarefas.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Persistência e primitivas puras compartilhadas por todas as user stories — nenhuma
story pode ser implementada sem isto.

**⚠️ CRITICAL**: Nenhuma user story pode começar antes desta fase estar completa.

- [X] T001 [P] Estender `ConversationStore` (`src/store/conversation-port.ts`) com
  `countMessages(conversationId): Promise<number>` e
  `messagesRange(conversationId, start, end): Promise<readonly ConversationMessage[]>`
  (contracts/history-summarizer.md, extensão aditiva — não altera os métodos existentes)
- [X] T002 [P] Implementar `countMessages`/`messagesRange` em
  `src/store/sqlite/sqlite-conversation-store.ts` (prepared statements sobre a tabela `messages`
  existente; `messagesRange` usa `LIMIT`/`OFFSET` ou `ROWID` em ordem cronológica)
- [X] T003 [P] Implementar `countMessages`/`messagesRange` em
  `src/store/memory-conversation.ts` (fake em memória usado nos testes de `server.test.ts`)
- [X] T004 [P] Teste de `countMessages`/`messagesRange` em
  `src/store/sqlite/sqlite-conversation-store.test.ts` (casos: conversa vazia, range parcial,
  range além do total)
- [X] T005 Criar DDL idempotente da tabela `conversation_summaries` em
  `src/store/sqlite/conversation-summary-schema.ts` (data-model.md: `conversation_id` PK,
  `summary`, `summarized_through`, `updated_at`), seguindo o padrão de
  `src/store/sqlite/conversation-schema.ts`
- [X] T006 [P] Criar porta `ConversationSummaryStore` em
  `src/store/conversation-summary-port.ts` (contracts/conversation-summary-store.md: `get`/`save`,
  tipo `ConversationSummary`)
- [X] T007 Implementar `SqliteConversationSummaryStore` em
  `src/store/sqlite/sqlite-conversation-summary-store.ts` (usa T005, prepared statements, `save`
  como UPSERT — depende de T005 e T006)
- [X] T008 [P] Criar fake em memória `MemoryConversationSummaryStore` em
  `src/store/memory-conversation-summary.ts` (`Map<string, ConversationSummary>`, mesmo espírito de
  `src/store/memory-conversation.ts`) — depende de T006
- [X] T009 [P] Teste de `SqliteConversationSummaryStore` em
  `src/store/sqlite/sqlite-conversation-summary-store.test.ts` (get de conversa sem resumo devolve
  `undefined`; save + get devolve o valor salvo; save duplicado substitui em vez de acumular linha)
  — depende de T007
- [X] T010 Implementar `nextBatchToSummarize(totalMessages, summarizedThrough)` (função pura) em
  `src/memory/history-summarizer.ts` (contracts/history-summarizer.md: `undefined` até completar
  um lote de 8 fora da janela de 8 recentes; caso contrário `{ start, end }` em múltiplos de 8)
- [X] T011 [P] Teste de `nextBatchToSummarize` em `src/memory/history-summarizer.test.ts`
  (`undefined` para totais de 0 a 15; `{start:0,end:8}` em 16; `undefined` de 17 a 23 com
  `summarizedThrough=8`; `{start:8,end:16}` em 24) — depende de T010

**Checkpoint**: Persistência e gatilho puro prontos — user stories podem começar.

---

## Phase 3: User Story 1 - Contexto permanece coerente em conversas longas (Priority: P1) 🎯 MVP

**Goal**: Ao ultrapassar 8 mensagens, o conteúdo que sai da janela recente vira resumo persistido,
mesclado ao anterior, e esse resumo entra no contexto usado por `/chat` para responder.

**Independent Test**: Enviar mais de 8 mensagens numa conversa e verificar que fatos das
mensagens mais antigas (fora da janela) continuam refletidos nas respostas, via resumo incluído
no contexto (quickstart.md, cenário de 16+ mensagens).

### Tests for User Story 1 ⚠️

- [X] T012 [P] [US1] Teste do orquestrador `updateHistorySummary` com resumidor fake em
  `src/memory/history-summarizer.test.ts`: sem resumo anterior, sumariza o lote de 8 mais antigo e
  persiste com `summarizedThrough=8`; com resumo anterior, o resumidor fake recebe
  `previousSummary` não vazio e o resultado mesclado é persistido (usa `MemoryConversationStore` +
  `MemoryConversationSummaryStore` de T003/T008)
- [X] T013 [P] [US1] Cenário em `src/http/server.test.ts`: conversa sem resumo (≤8 mensagens)
  responde normalmente e não cria linha em `ConversationSummaryStore` (FR-009)
- [X] T014 [P] [US1] Cenário em `src/http/server.test.ts`: após 16 mensagens na mesma
  `conversation`, o `ConversationSummaryStore` fake passa a ter uma linha com
  `summarizedThrough=8`, e uma nova mensagem na mesma conversa passa o resumo persistido para a
  estratégia de raciocínio (quickstart.md, passos 2-3 e 6)

### Implementation for User Story 1

- [X] T015 [US1] Definir `HistorySummarizerFn`, `SummarizeBatchInput` e `defaultHistorySummarizer`
  (LLM estruturado via `createModel().withStructuredOutput`, schema Zod `{ summary: string().min(1) }`,
  prompt de sistema instruindo extração de decisões/fatos/pendências e mesclagem com
  `previousSummary`) em `src/memory/history-summarizer.ts` — mesmo padrão de
  `defaultLearningReflector` em `src/memory/learning-reflector.ts`
- [X] T016 [US1] Implementar `updateHistorySummary(input, summarizerFn?)` em
  `src/memory/history-summarizer.ts`: usa `countMessages`+`get` para chamar `nextBatchToSummarize`
  (T010), busca o lote via `messagesRange`, chama `summarizerFn`, valida com Zod e persiste via
  `summaryStore.save` com `summarizedThrough` atualizado (depende de T001, T006, T010, T015)
- [X] T017 [US1] Em `src/http/server.ts`, adicionar `summaryStore: ConversationSummaryStore` a
  `ServerDeps` e, no handler de `/chat`, buscar `deps.summaryStore.get(conversationId)` e repassar
  o `summary` (quando existir) para `strategy.run(...)` junto de `history`/`memories` (depende de
  T006)
- [X] T018 [US1] Em `src/http/server.ts`, depois de persistir as mensagens da troca, disparar
  `void updateHistorySummary({ conversationId, conversationStore: deps.conversationStore,
  summaryStore: deps.summaryStore })` (fire-and-forget, ao lado do `void reflectLearning(...)`
  já existente) — depende de T016, T017
- [X] T019 [US1] Atualizar `main()` em `src/http/server.ts` para instanciar
  `SqliteConversationSummaryStore` e passá-la em `ServerDeps` (mesmo padrão de `SqliteMemoryStore`)
  — depende de T007, T017

**Checkpoint**: User Story 1 completa e testável de forma independente — resumo é gerado,
persistido, mesclado e entra no contexto de `/chat`.

---

## Phase 4: User Story 2 - Resumo não é refeito a cada request (Priority: P2)

**Goal**: A sumarização só é (re)calculada quando um lote completo de 8 novas mensagens sai da
janela recente, nunca a cada request, e cada execução emite um evento "summarize" rastreável.

**Independent Test**: Enviar várias mensagens consecutivas sem completar um novo lote de 8 e
verificar (via evento "summarize"/log) que nenhuma sumarização adicional foi disparada nesse
intervalo (quickstart.md, passo 4).

### Tests for User Story 2 ⚠️

- [X] T020 [P] [US2] Teste em `src/memory/history-summarizer.test.ts`: chamando
  `updateHistorySummary` repetidamente entre 17 e 23 mensagens totais (com
  `summarizedThrough=8`), o resumidor fake **não** é invocado nenhuma vez (espiar chamadas) e o
  resumo/`summarizedThrough` permanecem inalterados
- [X] T021 [P] [US2] Teste em `src/memory/history-summarizer.test.ts`: o evento `"summarize"` é
  registrado (via injeção de um logger/spy) exatamente uma vez por lote de 8 processado, com
  `conversationId` e `summarizedThrough` corretos, e não é registrado quando
  `nextBatchToSummarize` devolve `undefined`
- [X] T022 [P] [US2] Teste em `src/memory/history-summarizer.test.ts`: quando `summarizerFn` lança
  erro, `updateHistorySummary` não lança, o `summarizedThrough` não avança, e uma chamada
  subsequente (com o mesmo lote pendente) tenta sumarizar de novo (FR-010)

### Implementation for User Story 2

- [X] T023 [US2] Adicionar emissão do evento `"summarize"` (log estruturado com `conversationId`,
  `summarizedThrough`, `outcome`) dentro de `updateHistorySummary` em
  `src/memory/history-summarizer.ts`, cobrindo sucesso e falha (data-model.md, Summarize Event) —
  depende de T016
- [X] T024 [US2] Garantir em `updateHistorySummary` (`src/memory/history-summarizer.ts`) que uma
  falha do `summarizerFn` ou do `summaryStore.save` é capturada em `try/catch` sem propagar e sem
  persistir estado parcial (research.md §3) — depende de T016

**Checkpoint**: User Stories 1 e 2 funcionam juntas e de forma independente — sumarização é
mesclada, persistida, rastreável via evento, e nunca refeita fora do gatilho de 8 em 8.

---

## Phase 5: User Story 3 - Resumo preserva informação essencial de forma compacta (Priority: P3)

**Goal**: O resumo gerado é compacto (~150 tokens) mas preserva decisões, fatos e pendências,
mesmo após múltiplas mesclagens sucessivas.

**Independent Test**: Gerar um resumo a partir de mensagens conhecidas (com decisão, fato e
pendência explícitos) e verificar que o resultado menciona os três elementos e fica dentro da
faixa esperada de tamanho (spec.md SC-003: ~150 tokens, variação de até 30%).

### Tests for User Story 3 ⚠️

- [X] T025 [P] [US3] Teste em `src/memory/history-summarizer.test.ts`: usando um resumidor fake
  que retorna um texto fixo simulando decisão/fato/pendência, `estimateTokens` (de
  `src/context/tokens.ts`) do resumo persistido fica entre ~105 e ~195 tokens (150 ± 30%)
- [X] T026 [P] [US3] Teste em `src/memory/history-summarizer.test.ts`: mesclando um resumo
  anterior extenso com um novo lote via resumidor fake (que simula compressão, ex.: trunca/combina
  em vez de concatenar), o resumo final não cresce proporcionalmente ao número de mesclagens
  (verifica que o fake usado pelo `defaultHistorySummarizer` real recebe instrução de compressão —
  teste de contrato do prompt, não de qualidade de LLM real)

### Implementation for User Story 3

- [X] T027 [US3] Ajustar o prompt de sistema de `defaultHistorySummarizer`
  (`src/memory/history-summarizer.ts`, de T015) para explicitar: alvo de ~150 tokens, priorizar
  decisões/fatos/pendências, e comprimir (não concatenar) ao mesclar com `previousSummary` —
  depende de T015

**Checkpoint**: Todas as user stories funcionam de forma independente e conjunta.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validação final e conformidade com a Constitution.

- [X] T028 Rodar `npm run typecheck` e `npm test` (ou os scripts equivalentes do
  `package.json`) e corrigir eventuais falhas antes de considerar a feature pronta
- [X] T029 [P] Executar os cenários de `quickstart.md` manualmente (ou via os testes automatizados
  já cobertos por T004, T009, T011-T014, T020-T022, T025-T026) e confirmar os resultados esperados
- [X] T030 [P] Revisar comentários/documentação inline novos em
  `src/memory/history-summarizer.ts`, `src/store/conversation-summary-port.ts` e
  `src/store/sqlite/sqlite-conversation-summary-store.ts` quanto ao estilo do repo (comentário
  curto só quando o "porquê" não é óbvio, mesmo padrão dos arquivos existentes)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: Sem dependências externas — pode começar imediatamente. Bloqueia
  todas as user stories.
- **User Story 1 (Phase 3)**: Depende de Phase 2 completa (T001, T003/T002, T005-T008, T010).
- **User Story 2 (Phase 4)**: Depende de Phase 2 (T010) e de `updateHistorySummary` existir
  (T016, de US1) — não é totalmente independente de US1 no código (ambas tocam o mesmo
  orquestrador), mas é testável e entregável como incremento separado sobre o que US1 já deixou
  funcionando.
- **User Story 3 (Phase 5)**: Depende de `defaultHistorySummarizer` existir (T015, de US1); ajusta
  o prompt sem alterar a estrutura de dados ou o gatilho.
- **Polish (Phase 6)**: Depende de todas as stories desejadas estarem completas.

### Within Each User Story

- Testes antes da implementação correspondente (escrever e ver falhar antes de implementar).
- Store/porta antes de orquestrador; orquestrador antes de integração em `/chat`.

### Parallel Opportunities

- T001, T002, T003, T004 podem rodar em paralelo (arquivos diferentes: porta, adaptador SQLite,
  fake em memória, teste).
- T006, T008 podem rodar em paralelo entre si; T007 depende de T005+T006.
- Todos os testes de uma mesma user story marcados [P] podem rodar em paralelo entre si (arquivos
  de teste distintos ou blocos independentes no mesmo arquivo).
- T029 e T030 podem rodar em paralelo.

---

## Parallel Example: Foundational (Phase 2)

```bash
# Extensão de ConversationStore e seus adaptadores, em paralelo:
Task: "Estender ConversationStore com countMessages/messagesRange em src/store/conversation-port.ts"
Task: "Implementar countMessages/messagesRange em src/store/sqlite/sqlite-conversation-store.ts"
Task: "Implementar countMessages/messagesRange em src/store/memory-conversation.ts"
Task: "Testar countMessages/messagesRange em src/store/sqlite/sqlite-conversation-store.test.ts"
```

## Parallel Example: User Story 1 (testes)

```bash
Task: "Testar updateHistorySummary (sem/com resumo anterior) em src/memory/history-summarizer.test.ts"
Task: "Testar conversa sem resumo em src/http/server.test.ts"
Task: "Testar resumo entrando no contexto após 16 mensagens em src/http/server.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Phase 2: Foundational (bloqueia tudo).
2. Completar Phase 3: User Story 1 — resumo gerado, mesclado, persistido e incluído no contexto.
3. **Parar e validar**: rodar os testes de US1 e confirmar independentemente (quickstart.md).
4. Esse é o MVP: contexto já não perde informação em conversas longas.

### Incremental Delivery

1. Foundational → base pronta.
2. US1 → MVP: resumo funciona ponta a ponta.
3. US2 → adiciona a garantia de "nunca a cada request" + rastreabilidade via evento.
4. US3 → refina o prompt para tamanho/compactação sem mudar contrato de dados.
5. Polish → typecheck/test verdes, quickstart validado.

## Notes

- [P] = arquivos diferentes, sem dependência entre si.
- [Story] mapeia a tarefa para a user story correspondente (rastreabilidade).
- Nenhuma tarefa deste plano introduz infraestrutura de mensageria: o evento "summarize" é um log
  estruturado (research.md §5), não uma fila.
- Commitar após cada tarefa ou grupo lógico, mantendo `typecheck`/`test` verdes (Constitution,
  Princípio IV).
