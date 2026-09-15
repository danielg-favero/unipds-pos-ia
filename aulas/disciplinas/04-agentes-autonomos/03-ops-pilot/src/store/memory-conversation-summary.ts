import type { ConversationSummary, ConversationSummaryStore } from "./conversation-summary-port.js";

/** Fake em memória de `ConversationSummaryStore` — usado em testes (011-sumarizacao-historico). */
export class MemoryConversationSummaryStore implements ConversationSummaryStore {
  readonly #summaries = new Map<string, ConversationSummary>();

  async get(conversationId: string): Promise<ConversationSummary | undefined> {
    return this.#summaries.get(conversationId);
  }

  async save(conversationId: string, summary: ConversationSummary): Promise<void> {
    this.#summaries.set(conversationId, summary);
  }
}
