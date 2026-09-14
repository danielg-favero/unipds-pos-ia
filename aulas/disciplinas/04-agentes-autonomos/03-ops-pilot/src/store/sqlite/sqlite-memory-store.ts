import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";

import { embed } from "../../memory/embeddings.js";
import type { Memory, MemoryStore, RecalledMemory } from "../../memory/memory-store.js";
import { dotProduct } from "../../memory/similarity.js";
import { ensureMemorySchema } from "./memory-schema.js";

/** Acima deste produto escalar, um novo fato é considerado duplicata semântica (FR-003). */
const DEDUP_THRESHOLD = 0.92;

/** Abaixo deste produto escalar, um fato não é relevante o bastante para o recall (FR-005). */
const MIN_RELEVANCE = 0.3;

/** `recall` nunca devolve mais que este número de fatos (FR-004). */
const DEFAULT_RECALL_LIMIT = 3;

type MemoryRow = { id: string; user_id: string; fact: string; embedding: Buffer; created_at: string };

const toFloat32Array = (buffer: Buffer): Float32Array =>
  new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);

const toBuffer = (vector: Float32Array): Buffer => Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);

const toMemory = (row: MemoryRow): Memory & { readonly embedding: Float32Array } => ({
  id: row.id,
  userId: row.user_id,
  fact: row.fact,
  createdAt: row.created_at,
  embedding: toFloat32Array(row.embedding),
});

/**
 * Adaptador SQLite de `MemoryStore`, sobre a tabela `memories`. Mesmo padrão de
 * `SqliteConversationStore`: DDL idempotente no construtor, toda query é
 * prepared statement. Similaridade (dedup/recall) é calculada em memória —
 * ver research.md §2/§3 (sem índice vetorial nesta versão).
 */
export class SqliteMemoryStore implements MemoryStore {
  readonly #db: DatabaseSync;
  readonly #stmts: {
    readonly insertMemory: StatementSync;
    readonly allByUser: StatementSync;
    readonly deleteById: StatementSync;
  };

  constructor(path: string = process.env.OPSPILOT_DB ?? "./data/opspilot.db") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new DatabaseSync(path);
    ensureMemorySchema(this.#db);

    this.#stmts = {
      insertMemory: this.#db.prepare(
        "INSERT INTO memories (id, user_id, fact, embedding) VALUES (?, ?, ?, ?)",
      ),
      allByUser: this.#db.prepare(
        "SELECT id, user_id, fact, embedding, created_at FROM memories WHERE user_id = ?",
      ),
      deleteById: this.#db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?"),
    };
  }

  async #allByUser(userId: string): Promise<ReadonlyArray<Memory & { readonly embedding: Float32Array }>> {
    const rows = this.#stmts.allByUser.all(userId) as MemoryRow[];
    return rows.map(toMemory);
  }

  async remember(userId: string, fact: string): Promise<void> {
    const embedding = await embed(fact);
    const existing = await this.#allByUser(userId);

    const isDuplicate = existing.some(
      (memory) => dotProduct(embedding, memory.embedding) > DEDUP_THRESHOLD,
    );
    if (isDuplicate) return;

    this.#stmts.insertMemory.run(randomUUID(), userId, fact, toBuffer(embedding));
  }

  async recall(
    userId: string,
    query: string,
    limit: number = DEFAULT_RECALL_LIMIT,
  ): Promise<readonly RecalledMemory[]> {
    const queryEmbedding = await embed(query);
    const memories = await this.#allByUser(userId);

    return memories
      .map(({ embedding, ...memory }) => ({ ...memory, score: dotProduct(queryEmbedding, embedding) }))
      .filter((memory) => memory.score >= MIN_RELEVANCE)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async forget(userId: string, memoryId: string): Promise<void> {
    this.#stmts.deleteById.run(memoryId, userId);
  }

  close(): void {
    this.#db.close();
  }
}
