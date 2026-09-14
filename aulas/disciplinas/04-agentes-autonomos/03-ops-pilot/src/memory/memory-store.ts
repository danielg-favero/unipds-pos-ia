export type Memory = {
  readonly id: string;
  readonly userId: string;
  readonly fact: string;
  readonly createdAt: string;
};

export type RecalledMemory = Memory & { readonly score: number };

/**
 * Memória semântica por usuário. `remember` deduplica por similaridade (não por
 * igualdade textual); `recall` devolve os fatos mais relevantes para uma consulta,
 * mesmo sem palavras em comum com o texto memorizado.
 */
export interface MemoryStore {
  remember(userId: string, fact: string): Promise<void>;
  recall(userId: string, query: string, limit?: number): Promise<readonly RecalledMemory[]>;
  forget(userId: string, memoryId: string): Promise<void>;
}
