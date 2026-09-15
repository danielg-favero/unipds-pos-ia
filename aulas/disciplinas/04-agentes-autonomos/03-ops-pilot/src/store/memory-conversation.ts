import { randomUUID } from "node:crypto";

import type { ConversationMessage, ConversationStore } from "./conversation-port.js";

/**
 * Fake em memória de `ConversationStore` — usado em testes e como wiring de
 * produção provisório antes do adaptador SQLite (ver `SqliteConversationStore`).
 */
export class MemoryConversationStore implements ConversationStore {
  readonly #messages = new Map<string, ConversationMessage[]>();

  async create(): Promise<string> {
    return randomUUID();
  }

  async append(conversationId: string, message: ConversationMessage): Promise<void> {
    const existing = this.#messages.get(conversationId);
    if (existing === undefined) {
      this.#messages.set(conversationId, [message]);
      return;
    }
    existing.push(message);
  }

  async lastMessages(
    conversationId: string,
    limit: number,
  ): Promise<readonly ConversationMessage[]> {
    const messages = this.#messages.get(conversationId) ?? [];
    return messages.slice(-limit);
  }

  async countMessages(conversationId: string): Promise<number> {
    return this.#messages.get(conversationId)?.length ?? 0;
  }

  async messagesRange(
    conversationId: string,
    start: number,
    end: number,
  ): Promise<readonly ConversationMessage[]> {
    const messages = this.#messages.get(conversationId) ?? [];
    return messages.slice(start, end);
  }
}
