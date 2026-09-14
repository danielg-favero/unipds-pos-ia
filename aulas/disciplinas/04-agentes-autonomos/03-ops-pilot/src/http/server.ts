import { pathToFileURL } from "node:url";

import express, { type Express } from "express";

import { strategies as productionStrategies } from "../agents/registry.js";
import { UnknownStrategyError, errorMessage } from "../domain/errors.js";
import type { ReasoningStrategy } from "../domain/strategy.js";
import { reflectLearning } from "../memory/learning-reflector.js";
import type { MemoryStore } from "../memory/memory-store.js";
import type { ConversationStore } from "../store/conversation-port.js";
import type { OpsStore } from "../store/port.js";
import { chatRequestSchema } from "./schemas.js";

/** Mesmo default do CLI (`src/cli/args.ts`) para manter as estratégias comparáveis. */
const DEFAULT_MAX_ITERATIONS = 8;

/** Tempo limite por requisição (FR-009): 180s, sobrescrevível nos testes. */
const DEFAULT_TIMEOUT_MS = 180_000;

/** No máximo estas mensagens mais recentes compõem o contexto de histórico (FR-006). */
const HISTORY_WINDOW = 12;

export type ServerDeps = {
  readonly strategies: Readonly<Record<string, ReasoningStrategy>>;
  readonly store: OpsStore;
  readonly conversationStore: ConversationStore;
  readonly memoryStore: MemoryStore;
  readonly timeoutMs?: number;
};

const TIMEOUT = Symbol("timeout");

export function createServer(deps: ServerDeps): Express {
  const app = express();
  app.use(express.json());

  app.post("/chat", (req, res) => {
    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "corpo inválido", issues: parsed.error.issues });
      return;
    }

    const { message, userId, reflect, conversation, strategy: strategyName = "react" } = parsed.data;
    const resolvedName = reflect ? `reflect:${strategyName}` : strategyName;
    const strategy = deps.strategies[resolvedName];
    if (strategy === undefined) {
      const available = Object.keys(deps.strategies).toSorted();
      const error = new UnknownStrategyError(resolvedName, available);
      res.status(422).json({ error: error.message, requested: resolvedName, available });
      return;
    }

    const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      setTimeout(() => resolve(TIMEOUT), timeoutMs).unref();
    });

    (async () => {
      // conversation ausente: nova conversa. conversation desconhecida: tratada
      // como conversa nova com esse id (sem erro) — ver spec (Assumptions).
      const conversationId = conversation ?? (await deps.conversationStore.create());
      const history = await deps.conversationStore.lastMessages(conversationId, HISTORY_WINDOW);
      const recalled = await deps.memoryStore.recall(userId, message);
      const memories = recalled.map((memory) => memory.fact);

      const result = await Promise.race([
        strategy.run({
          request: message,
          maxIterations: DEFAULT_MAX_ITERATIONS,
          store: deps.store,
          history,
          memories,
          userId,
          memoryStore: deps.memoryStore,
        }),
        timeout,
      ]);

      if (result === TIMEOUT) {
        res.status(504).json({ error: "tempo limite excedido (180s)" });
        return;
      }

      // Só grava em caso de sucesso — sem mensagem de usuário órfã em timeout/erro.
      await deps.conversationStore.append(conversationId, { role: "user", content: message });
      await deps.conversationStore.append(conversationId, {
        role: "assistant",
        content: result.answer,
      });
      res.status(200).json({ ...result, conversation: conversationId });

      // Fire-and-forget (FR-006/009): a reflexão de aprendizado nunca atrasa
      // nem afeta a resposta já enviada — falhas são absorvidas dentro dela.
      void reflectLearning({
        request: message,
        answer: result.answer,
        userId,
        memoryStore: deps.memoryStore,
      });
    })().catch((error: unknown) => {
      res.status(500).json({ error: errorMessage(error) });
    });
  });

  return app;
}

async function main(): Promise<void> {
  const { SqliteOpsStore } = await import("../store/sqlite/sqlite-ops-store.js");
  const { SqliteConversationStore } = await import(
    "../store/sqlite/sqlite-conversation-store.js"
  );
  const { SqliteMemoryStore } = await import("../store/sqlite/sqlite-memory-store.js");
  const store = new SqliteOpsStore();
  const conversationStore = new SqliteConversationStore();
  const memoryStore = new SqliteMemoryStore();
  const app = createServer({ strategies: productionStrategies, store, conversationStore, memoryStore });
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`OpsPilot HTTP server ouvindo em :${port}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main();
}
