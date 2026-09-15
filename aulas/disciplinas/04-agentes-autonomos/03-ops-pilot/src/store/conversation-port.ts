export type ConversationRole = "user" | "assistant";

export type ConversationMessage = {
  readonly role: ConversationRole;
  readonly content: string;
};

/**
 * Porta de histórico de conversa. `create()` só gera um identificador — nada é
 * gravado até o primeiro `append`, então um id sem mensagens é indistinguível
 * de um id inexistente (mesmo comportamento, histórico vazio).
 */
export interface ConversationStore {
  create(): Promise<string>;
  append(conversationId: string, message: ConversationMessage): Promise<void>;
  /** As `limit` mensagens mais recentes da conversa, em ordem cronológica. */
  lastMessages(conversationId: string, limit: number): Promise<readonly ConversationMessage[]>;
  /** Total de mensagens já registradas na conversa (0 se ela não existe). */
  countMessages(conversationId: string): Promise<number>;
  /** Mensagens no intervalo `[start, end)` (índices 0-based, ordem cronológica). */
  messagesRange(
    conversationId: string,
    start: number,
    end: number,
  ): Promise<readonly ConversationMessage[]>;
}
