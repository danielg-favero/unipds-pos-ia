export type ConversationSummary = {
  readonly summary: string;
  readonly summarizedThrough: number;
};

/**
 * Porta do resumo acumulado de uma conversa (011-sumarizacao-historico). Um resumo por conversa:
 * `save` sempre substitui por completo o resumo anterior (upsert), nunca acumula linhas.
 */
export interface ConversationSummaryStore {
  /** `undefined` quando a conversa ainda não tem resumo (FR-009) — não é um erro. */
  get(conversationId: string): Promise<ConversationSummary | undefined>;
  save(conversationId: string, summary: ConversationSummary): Promise<void>;
}
