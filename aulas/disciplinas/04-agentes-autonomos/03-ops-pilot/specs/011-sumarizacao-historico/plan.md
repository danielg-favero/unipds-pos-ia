# Implementation Plan: Sumarização de Histórico (Pruning de Contexto)

**Branch**: `011-sumarizacao-historico` | **Date**: 2026-09-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-sumarizacao-historico/spec.md`

## Summary

Quando uma conversa acumula mensagens além da janela recente usada no contexto, o conteúdo que
sai dessa janela deixa de existir para o assistente. A feature introduz uma tabela
`conversation_summaries` (uma linha por conversa) que acumula um resumo (~150 tokens) das
decisões, fatos e pendências das mensagens que já saíram da janela. O resumo só é recalculado
quando um lote completo de 8 mensagens sai da janela desde a última atualização — nunca a cada
request — e é mesclado ao resumo anterior (não substituído). Toda sumarização emite um evento
`summarize` para rastreabilidade. O resumo persistido entra no contexto de `/chat` junto do
histórico recente. A abordagem segue o mesmo padrão arquitetural de `reflectLearning`
(`src/memory/learning-reflector.ts`): uma função de sumarização substituível por um fake
determinístico nos testes, chamada de dentro do fluxo de `/chat` depois que a mensagem é
persistida.

## Technical Context

**Language/Version**: TypeScript ESM (Node 24 LTS, `strict: true`)

**Primary Dependencies**: Express (HTTP), Zod (validação), LangChain (`createModel` /
`withStructuredOutput`, mesmo padrão de `defaultLearningReflector`), `node:sqlite` (`DatabaseSync`)

**Storage**: SQLite via `node:sqlite`, mesmo arquivo `OPSPILOT_DB` das demais tabelas
(`messages`, `memories`); nova tabela `conversation_summaries`

**Testing**: `node:test` via `tsx`, com resumidor fake determinístico (mesmo padrão de
`LearningReflectorFn` injetável em `reflectLearning`)

**Target Platform**: Servidor Node.js (mesmo processo do `/chat` em `src/http/server.ts`)

**Project Type**: Single project (backend/CLI already unified em `src/`)

**Performance Goals**: Sumarização não deve atrasar a resposta ao usuário — executa depois que a
resposta já foi enviada (fire-and-forget), mesmo padrão de `reflectLearning`

**Constraints**: Resumo alvo de ~150 tokens (heurística `estimateTokens` já existente em
`src/context/tokens.ts`); sumarização só dispara a cada lote completo de 8 mensagens que saem da
janela recente, nunca por request

**Scale/Scope**: Uma linha de resumo por conversa; volume proporcional ao número de conversas
ativas, mesma ordem de grandeza de `messages`/`memories`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Camadas Explícitas**: novo store (`ConversationSummaryStore`) na camada `store`; a
  orquestração (decidir quando sumarizar, montar contexto) fica em `service`/`http`, nunca I/O
  direto de domínio. ✅ Sem violação.
- **II. Validações na Fronteira**: o texto do resumo produzido pelo modelo é validado com Zod
  (mesmo padrão de `learningVerdictSchema`) antes de ser persistido. ✅
- **III. Erros são de Domínio**: falha na sumarização não deve derrubar `/chat`; é absorvida
  dentro da função de sumarização (mesmo padrão de `reflectLearning`, que engole exceções e não
  propaga). ✅
- **IV. Teste é Parte da Tarefa**: cada peça nova (janela/gatilho, mesclagem, persistência,
  inclusão no contexto) ganha teste com resumidor fake, sem depender de chamada real ao modelo. ✅
- **V. Segurança por Padrão**: nenhuma leitura de `.env`; toda query em `conversation_summaries`
  usa prepared statements, sem SQL concatenado a partir de entrada externa. ✅
- **VI. Funções Puras**: a lógica de "quantas mensagens saíram da janela" e "quando disparar
  sumarização" é pura (recebe contagens, devolve decisão); o I/O (ler/escrever
  `conversation_summaries`, chamar o modelo) fica isolado na função injetável e no store. ✅

Nenhuma violação identificada — não é necessário preencher Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/011-sumarizacao-historico/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── store/
│   ├── conversation-port.ts              # (existente) ConversationStore — sem mudança de contrato
│   ├── conversation-summary-port.ts      # NOVO: porta ConversationSummaryStore
│   └── sqlite/
│       ├── conversation-schema.ts        # (existente) tabela messages
│       ├── conversation-summary-schema.ts # NOVO: DDL da tabela conversation_summaries
│       └── sqlite-conversation-summary-store.ts # NOVO: adaptador SQLite
├── memory/
│   └── history-summarizer.ts             # NOVO: lógica pura de gatilho (8/8) + função de
│                                          #        sumarização/mesclagem injetável (mesmo
│                                          #        padrão de learning-reflector.ts)
└── http/
    └── server.ts                         # ajustado: inclui resumo no contexto de /chat e
                                           #           dispara sumarização fire-and-forget

tests/ (ou *.test.ts ao lado do código, seguindo o padrão atual do repo)
├── store/sqlite/sqlite-conversation-summary-store.test.ts
├── memory/history-summarizer.test.ts
└── http/server.test.ts (cenários novos adicionados ao arquivo existente)
```

**Structure Decision**: Segue a estrutura já existente no repositório (sem `src/models`/`src/cli`
genéricos) — camada `store` para persistência, `memory` para lógica de domínio de
sumarização/reflexão (ao lado de `learning-reflector.ts`, que já tem o mesmo formato de "função
injetável + orquestrador fire-and-forget"), e `http/server.ts` como ponto de integração com o
fluxo de `/chat`. Nenhuma estrutura nova é introduzida.

## Complexity Tracking

> Não aplicável — nenhuma violação da Constitution Check.
