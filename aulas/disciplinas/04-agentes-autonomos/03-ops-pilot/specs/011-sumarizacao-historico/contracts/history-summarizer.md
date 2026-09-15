# Contract: `history-summarizer`

Módulo `src/memory/history-summarizer.ts`, no mesmo formato de
`src/memory/learning-reflector.ts` (função pura de decisão + função de efeito injetável +
orquestrador que nunca lança).

```ts
export type SummarizeBatchInput = {
  readonly previousSummary: string; // "" quando não havia resumo anterior
  readonly messages: readonly ConversationMessage[]; // lote de 8 mensagens, ordem cronológica
};

/** Nunca lança: falha do modelo deve virar exceção capturada por `updateHistorySummary`. */
export type HistorySummarizerFn = (input: SummarizeBatchInput) => Promise<string>;

/** Pura: decide se um novo lote de 8 mensagens já saiu da janela recente. */
export function nextBatchToSummarize(
  totalMessages: number,
  summarizedThrough: number,
): { start: number; end: number } | undefined;

export type UpdateHistorySummaryInput = {
  readonly conversationId: string;
  readonly conversationStore: ConversationStore;
  readonly summaryStore: ConversationSummaryStore;
};

/**
 * Orquestra: lê o total de mensagens e o resumo atual, decide via `nextBatchToSummarize`,
 * busca o lote de mensagens, chama o `summarizerFn`, persiste e loga o evento "summarize".
 * Nunca lança (FR-010) — falhas deixam `summarized_through` inalterado.
 */
export async function updateHistorySummary(
  input: UpdateHistorySummaryInput,
  summarizerFn?: HistorySummarizerFn,
): Promise<void>;
```

## Regras de contrato

- `nextBatchToSummarize(totalMessages, summarizedThrough)`:
  - Retorna `undefined` quando `(totalMessages - 8) - summarizedThrough < 8` (ainda não saiu um
    lote completo, ou a conversa tem 8 ou menos mensagens).
  - Retorna `{ start: summarizedThrough, end: summarizedThrough + 8 }` (índices 0-based,
    cronológicos) caso contrário.
  - Função pura — mesma entrada sempre produz a mesma saída, sem I/O.
- `updateHistorySummary` é chamado de `/chat` **depois** da resposta já ter sido enviada
  (fire-and-forget, mesmo padrão de `reflectLearning`), nunca bloqueia a resposta ao usuário.
- Em caso de falha (exceção do `summarizerFn`, erro de store), `updateHistorySummary` engole o
  erro e não escreve nada — próxima chamada tenta de novo (research.md §3).
- `defaultHistorySummarizer` (implementação real) usa `createModel().withStructuredOutput(...)`
  com um schema `{ summary: string().min(1) }`, mesmo padrão de `defaultLearningReflector`.

## Extensão necessária em `ConversationStore`

`nextBatchToSummarize`/`updateHistorySummary` precisam de duas capacidades que
`ConversationStore` (`src/store/conversation-port.ts`) ainda não expõe — apenas `lastMessages`
(as N mais recentes). Adicionar ao contrato existente, com implementação SQLite via prepared
statements sobre a mesma tabela `messages` (sem nova tabela):

```ts
export interface ConversationStore {
  // ...métodos existentes (create, append, lastMessages) inalterados...

  /** Total de mensagens já registradas na conversa. */
  countMessages(conversationId: string): Promise<number>;

  /** Mensagens no intervalo [start, end) em ordem cronológica (índices 0-based). */
  messagesRange(
    conversationId: string,
    start: number,
    end: number,
  ): Promise<readonly ConversationMessage[]>;
}
```

Isso é uma extensão aditiva da interface existente — não quebra os usos atuais de
`lastMessages`/`append`/`create`.

## Integração em `/chat`

- Contexto de entrada: `deps.summaryStore.get(conversationId)` → se existir, o campo `summary` é
  passado à estratégia de raciocínio junto de `history`/`memories` (mesmo ponto onde `history` e
  `memories` já são montados em `src/http/server.ts`).
- Depois de persistir a mensagem do usuário/assistente (igual ao fluxo atual), disparar
  `void updateHistorySummary({ conversationId, conversationStore, summaryStore })` sem `await`,
  ao lado do `void reflectLearning(...)` já existente.
