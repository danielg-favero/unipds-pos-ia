# Implementation Plan: Conversa Persistente

**Branch**: `007-conversa-persistente` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-conversa-persistente/spec.md`

## Summary

`POST /chat` (`src/http/server.ts`) passa a aceitar um `conversation` opcional no corpo. Um novo
`ConversationStore` (porta `create`/`append`/`lastMessages`), com adaptador SQLite sobre uma única
tabela `messages` e um fake em memória para testes, guarda o histórico. Antes de invocar a estratégia,
o servidor busca as 12 mensagens mais recentes da conversa e as compõe no início da lista de mensagens
enviada ao agente; depois de responder, registra a mensagem do usuário e a resposta do assistente. O
número de mensagens de histórico usadas vira a métrica `historyMessages`, propagada por `RunTracker`
como as demais métricas já existentes.

## Technical Context

**Language/Version**: TypeScript ESM (Node 24 LTS), `strict: true`

**Primary Dependencies**: Express (rota `/chat` já existente), Zod (validação de fronteira),
`@langchain/core` + `@langchain/langgraph` (composição de mensagens do agente), `node:sqlite`
(`DatabaseSync`)

**Storage**: SQLite via `node:sqlite`, nova tabela `messages` no mesmo arquivo (`OPSPILOT_DB`) usado
pelo `SqliteOpsStore`; testes usam `:memory:`

**Testing**: `node:test` via `tsx` (`npm test`); testes unitários do store sobre `:memory:` e um fake
(`MemoryConversationStore`); teste de integração de `/chat` reaproveitando a estratégia fake
determinística já usada em `007-http-chat-endpoint`/`006-http-chat-endpoint`

**Target Platform**: servidor HTTP Node existente (`src/http/server.ts`)

**Project Type**: single project (extensão de um web-service já existente)

**Performance Goals**: sem meta nova — a busca de histórico é uma query indexada por
`conversation_id` limitada a 12 linhas, não deve alterar perceptivelmente a latência de `/chat`

**Constraints**: no máximo 12 mensagens de histórico compostas no prompt por requisição (FR-006);
compatível com as opções já existentes de `strategy` e `reflect` sem exigir escolha excludente (FR-010)

**Scale/Scope**: uma nova tabela, uma nova porta de store com dois adaptadores (SQLite + fake), e
alterações pontuais em `schemas.ts`, `server.ts`, `domain/strategy.ts`, `agents/metrics.ts` e nas
estratégias (`react.ts`, `plan-and-execute.ts`, `reflection.ts`) para propagar `history`/`historyMessages`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Camadas Explícitas** — PASS. `ConversationStore` é uma nova porta em `src/store/`, com
  adaptadores SQLite e fake; a composição do histórico (buscar → montar mensagens → chamar
  estratégia → gravar) acontece em `src/http/server.ts`, a mesma camada que já orquestra `/chat`. O
  domínio (`agents/*`) só recebe um array de mensagens já resolvido, sem saber de SQLite.
- **II. Validações na Fronteira** — PASS. `conversation` entra em `chatRequestSchema` (Zod) como
  string opcional não vazia, mesmo padrão dos campos existentes.
- **III. Erros são de Domínio** — PASS. Não há novo erro de domínio: um `conversation` desconhecido
  vira uma nova conversa (decisão registrada em Assumptions do spec), então não há caminho de falha
  previsível a modelar aqui.
- **IV. Teste é Parte da Tarefa** — PASS (gate de processo). Plano cobre testes do
  `SqliteConversationStore` sobre `:memory:`, do `MemoryConversationStore` fake, e um teste de
  integração de `/chat` cobrindo criação implícita de conversa, continuação e limite de 12 mensagens.
- **V. Segurança por Padrão** — PASS. Toda query da nova tabela usa prepared statements; nenhum
  segredo novo; nenhum acesso a `.env` fora do já existente.
- **VI. Funções Puras** — PASS. A composição de mensagens (histórico + mensagem atual → lista para o
  agente) é uma função pura; o único efeito colateral (ler/gravar mensagens) fica isolado no adaptador
  de store, como os demais.

Nenhuma violação — Complexity Tracking não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/007-conversa-persistente/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── domain/
│   └── strategy.ts              # StrategyInput.history?, RunMetrics.historyMessages (edit)
├── agents/
│   ├── metrics.ts                # RunTracker recebe historyMessages (edit)
│   ├── react.ts                  # compõe history + request antes de agent.stream (edit)
│   ├── plan-and-execute.ts       # idem (edit)
│   └── reflection.ts             # repassa history/historyMessages entre tentativas (edit)
├── store/
│   ├── conversation-port.ts      # nova porta: ConversationStore (create/append/lastMessages)
│   ├── memory-conversation.ts    # novo fake em memória, para testes
│   └── sqlite/
│       ├── conversation-schema.ts      # novo: DDL idempotente da tabela `messages`
│       └── sqlite-conversation-store.ts # novo adaptador SQLite
└── http/
    ├── schemas.ts                # chatRequestSchema ganha `conversation` opcional (edit)
    └── server.ts                 # ServerDeps.conversationStore; orquestra histórico (edit)

src/store/conversation-port.test.ts            # contrato compartilhado (fake + sqlite) — novo
src/store/sqlite/sqlite-conversation-store.test.ts  # persistência entre reinícios (:memory: + arquivo) — novo
src/http/server.test.ts                        # estende os testes existentes de /chat — edit
```

**Structure Decision**: Projeto único (extensão do web-service existente). Segue o padrão já
estabelecido por `003-persistencia-sqlite` (porta + adaptador SQLite + fake em memória) e por
`006-http-chat-endpoint` (validação Zod na rota, composição na camada HTTP). Nenhuma estrutura nova de
diretórios é introduzida — apenas novos arquivos dentro de `src/store/` e `src/store/sqlite/`.

## Complexity Tracking

> Nenhuma violação do Constitution Check — seção não se aplica.
