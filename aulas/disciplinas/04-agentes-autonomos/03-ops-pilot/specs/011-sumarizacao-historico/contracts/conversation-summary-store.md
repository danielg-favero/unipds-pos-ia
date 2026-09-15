# Contract: `ConversationSummaryStore`

Porta interna (camada `store`), análoga a `ConversationStore` (`src/store/conversation-port.ts`).

```ts
export type ConversationSummary = {
  readonly summary: string;
  readonly summarizedThrough: number;
};

export interface ConversationSummaryStore {
  /** `undefined` quando a conversa ainda não tem resumo (FR-009). */
  get(conversationId: string): Promise<ConversationSummary | undefined>;

  /** Substitui (upsert) o resumo acumulado da conversa. */
  save(conversationId: string, summary: ConversationSummary): Promise<void>;
}
```

## Regras de contrato

- `get` nunca lança para "conversa inexistente" — devolve `undefined` (mesmo espírito de
  `ConversationStore.lastMessages` devolver lista vazia).
- `save` é idempotente: chamar duas vezes com o mesmo `conversationId` substitui o resumo
  anterior por completo (não acumula linhas).
- Implementação SQLite (`SqliteConversationSummaryStore`) segue o mesmo padrão de
  `SqliteConversationStore`: DDL idempotente no construtor, todas as queries são prepared
  statements sobre o mesmo `OPSPILOT_DB`.

## Adaptador de teste (fake, em memória)

Para os testes de `history-summarizer.test.ts` e `server.test.ts`, uma implementação em memória
(`Map<string, ConversationSummary>`) substitui a SQLite, mesmo padrão já usado para
`memoryStore`/`conversationStore` fake em `server.test.ts` existente.
