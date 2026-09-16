import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import express, { type Express } from "express";

import { strategies as productionStrategies } from "../agents/registry.js";
import { isRouteName } from "../agents/production-graph.js";
import { withReflection } from "../agents/reflection.js";
import { parseDurationMs } from "../domain/duration.js";
import { RequestNotFoundError, UnknownStrategyError, errorMessage } from "../domain/errors.js";
import { estimateCostUsd } from "../domain/pricing.js";
import { groupBy, summarize } from "../domain/stats.js";
import type { ReasoningStrategy } from "../domain/strategy.js";
import { routeOf } from "../domain/trace.js";
import type { HistorySummarizerFn } from "../memory/history-summarizer.js";
import { updateHistorySummary } from "../memory/history-summarizer.js";
import { reflectLearning } from "../memory/learning-reflector.js";
import type { MemoryStore } from "../memory/memory-store.js";
import { logEvent } from "../obs/logger.js";
import type { ConversationSummaryStore } from "../store/conversation-summary-port.js";
import type { ConversationStore } from "../store/conversation-port.js";
import type { OpsStore } from "../store/port.js";
import type { RequestTraceStore } from "../store/request-trace-port.js";
import {
  chatRequestSchema,
  forgetQuerySchema,
  recallQuerySchema,
  rememberRequestSchema,
  requestIdParamSchema,
  statsQuerySchema,
} from "./schemas.js";

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
  readonly summaryStore: ConversationSummaryStore;
  readonly memoryStore: MemoryStore;
  /** Persistência de trace/métricas por requisição (015). */
  readonly requestTraceStore: RequestTraceStore;
  readonly timeoutMs?: number;
  /** Sobrescrevível nos testes por um resumidor fake determinístico (011). */
  readonly historySummarizerFn?: HistorySummarizerFn;
};

const TIMEOUT = Symbol("timeout");

export function createServer(deps: ServerDeps): Express {
  const app = express();
  app.use(express.json());

  app.post("/chat", (req, res) => {
    // Gerado uma vez por requisição (015): correlaciona corpo, header e trace persistido.
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    const respond = (status: number, body: Record<string, unknown>): void => {
      res.status(status).json({ ...body, requestId });
    };

    const parsed = chatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      respond(400, { error: "corpo inválido", issues: parsed.error.issues });
      return;
    }

    const { message, userId, reflect, conversation, strategy: strategyName } = parsed.data;

    // `production` (013) roteia automaticamente entre as estratégias-base; é o
    // default quando `strategy` não vem no corpo. Quando o catálogo injetado
    // não a registra (ex.: testes com estratégias fake isoladas), o default
    // legado ("react") é preservado — comportamento anterior a 013 intacto.
    const production = deps.strategies.production;

    let strategy: ReasoningStrategy | undefined;
    let overrideRoute: string | undefined;

    if (strategyName === undefined) {
      strategy = production ?? deps.strategies.react;
      if (strategy !== undefined) strategy = reflect ? withReflection(strategy) : strategy;
    } else {
      const resolvedName = reflect ? `reflect:${strategyName}` : strategyName;
      const explicit = deps.strategies[resolvedName];
      if (explicit === undefined) {
        const available = Object.keys(deps.strategies).toSorted();
        const error = new UnknownStrategyError(resolvedName, available);
        respond(422, { error: error.message, requested: resolvedName, available });
        return;
      }
      // Override manual (013): só passa pelo grafo unificado quando `strategy`
      // nomeia uma das rotas que ele entende — caso contrário, mantém o
      // despacho direto de sempre (compatível com nomes de catálogo livres).
      if (production !== undefined && isRouteName(strategyName)) {
        overrideRoute = strategyName;
        strategy = reflect ? withReflection(production) : production;
      } else {
        strategy = explicit;
      }
    }

    if (strategy === undefined) {
      const requested = "react";
      const available = Object.keys(deps.strategies).toSorted();
      const error = new UnknownStrategyError(requested, available);
      respond(422, { error: error.message, requested, available });
      return;
    }

    const resolvedStrategy = strategy;

    const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      setTimeout(() => resolve(TIMEOUT), timeoutMs).unref();
    });

    (async () => {
      // conversation ausente: nova conversa. conversation desconhecida: tratada
      // como conversa nova com esse id (sem erro) — ver spec (Assumptions).
      const conversationId = conversation ?? (await deps.conversationStore.create());

      // Fire-and-forget (015): a persistência do trace nunca deve atrasar nem
      // derrubar a resposta principal — falhas são absorvidas aqui mesmo.
      void deps.requestTraceStore.startRequest(requestId, conversationId).catch(() => {});

      const history = await deps.conversationStore.lastMessages(conversationId, HISTORY_WINDOW);
      const recalled = await deps.memoryStore.recall(userId, message);
      const memories = recalled.map((memory) => memory.fact);
      const existingSummary = await deps.summaryStore.get(conversationId);

      const result = await Promise.race([
        resolvedStrategy.run({
          request: message,
          maxIterations: DEFAULT_MAX_ITERATIONS,
          store: deps.store,
          history,
          memories,
          historySummary: existingSummary?.summary,
          userId,
          memoryStore: deps.memoryStore,
          overrideRoute,
        }),
        timeout,
      ]);

      if (result === TIMEOUT) {
        respond(504, { error: "tempo limite excedido (180s)" });
        void deps.requestTraceStore
          .finishRequest(requestId, { status: "timeout" })
          .catch(() => {});
        return;
      }

      // Só grava em caso de sucesso — sem mensagem de usuário órfã em timeout/erro.
      await deps.conversationStore.append(conversationId, { role: "user", content: message });
      await deps.conversationStore.append(conversationId, {
        role: "assistant",
        content: result.answer,
      });
      respond(200, { ...result, conversation: conversationId });

      // Fire-and-forget (FR-006/009): a reflexão de aprendizado nunca atrasa
      // nem afeta a resposta já enviada — falhas são absorvidas dentro dela.
      void reflectLearning({
        request: message,
        answer: result.answer,
        userId,
        memoryStore: deps.memoryStore,
      });
      void updateHistorySummary(
        {
          conversationId,
          conversationStore: deps.conversationStore,
          summaryStore: deps.summaryStore,
        },
        deps.historySummarizerFn,
      );

      // Fire-and-forget (015): persiste métricas + trace e emite uma linha de
      // log por evento (metadados apenas — FR-008/SC-005), depois da resposta.
      void deps.requestTraceStore
        .finishRequest(requestId, {
          status: "ok",
          metrics: result.metrics,
          route: routeOf(result.trace),
          costUsd: estimateCostUsd(result.metrics.modelUsed, result.metrics.promptTokensReal),
        })
        .catch(() => {});
      void deps.requestTraceStore.appendTraceEvents(requestId, result.trace).catch(() => {});
      result.trace.forEach((event, seq) => {
        try {
          logEvent(requestId, seq, event);
        } catch {
          // observabilidade nunca deve afetar a resposta já enviada
        }
      });
    })().catch((error: unknown) => {
      respond(500, { error: errorMessage(error) });
      void deps.requestTraceStore
        .finishRequest(requestId, { status: "error", error: errorMessage(error) })
        .catch(() => {});
    });
  });

  app.get("/stats", (req, res) => {
    const parsed = statsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "query inválida", issues: parsed.error.issues });
      return;
    }

    const sinceMs = parseDurationMs(parsed.data.since);
    if (sinceMs === undefined) {
      res.status(400).json({ error: `since inválido: "${parsed.data.since}"` });
      return;
    }
    const sinceIso = new Date(Date.now() - sinceMs).toISOString();

    deps.requestTraceStore
      .statsSince(sinceIso)
      .then((rows) => {
        res.status(200).json({
          since: parsed.data.since,
          ...summarize(rows),
          byRoute: groupBy(rows, (row) => row.route),
          byModel: groupBy(rows, (row) => row.modelUsed),
        });
      })
      .catch((error: unknown) => res.status(500).json({ error: errorMessage(error) }));
  });

  app.get("/requests/:id", (req, res) => {
    const parsed = requestIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "query inválida", issues: parsed.error.issues });
      return;
    }

    deps.requestTraceStore
      .getRequestWithTrace(parsed.data.id)
      .then((found) => {
        if (found === undefined) {
          const error = new RequestNotFoundError(parsed.data.id);
          res.status(404).json({ error: error.message });
          return;
        }
        res.status(200).json(found);
      })
      .catch((error: unknown) => res.status(500).json({ error: errorMessage(error) }));
  });

  app.post("/memories", (req, res) => {
    const parsed = rememberRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "corpo inválido", issues: parsed.error.issues });
      return;
    }

    const { userId, fact } = parsed.data;
    deps.memoryStore
      .remember(userId, fact)
      .then(() => res.status(201).json({ ok: true }))
      .catch((error: unknown) => res.status(500).json({ error: errorMessage(error) }));
  });

  app.get("/memories", (req, res) => {
    const parsed = recallQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "query inválida", issues: parsed.error.issues });
      return;
    }

    const { userId, query, limit } = parsed.data;
    deps.memoryStore
      .recall(userId, query, limit)
      .then((memories) => res.status(200).json({ memories }))
      .catch((error: unknown) => res.status(500).json({ error: errorMessage(error) }));
  });

  app.delete("/memories/:id", (req, res) => {
    const parsed = forgetQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "query inválida", issues: parsed.error.issues });
      return;
    }

    const { userId } = parsed.data;
    deps.memoryStore
      .forget(userId, req.params.id)
      .then(() => res.status(200).json({ ok: true }))
      .catch((error: unknown) => res.status(500).json({ error: errorMessage(error) }));
  });

  return app;
}

async function main(): Promise<void> {
  const { SqliteOpsStore } = await import("../store/sqlite/sqlite-ops-store.js");
  const { SqliteConversationStore } = await import(
    "../store/sqlite/sqlite-conversation-store.js"
  );
  const { SqliteMemoryStore } = await import("../store/sqlite/sqlite-memory-store.js");
  const { SqliteConversationSummaryStore } = await import(
    "../store/sqlite/sqlite-conversation-summary-store.js"
  );
  const { SqliteRequestTraceStore } = await import(
    "../store/sqlite/sqlite-request-trace-store.js"
  );
  const store = new SqliteOpsStore();
  const conversationStore = new SqliteConversationStore();
  const summaryStore = new SqliteConversationSummaryStore();
  const memoryStore = new SqliteMemoryStore();
  const requestTraceStore = new SqliteRequestTraceStore();
  const app = createServer({
    strategies: productionStrategies,
    store,
    conversationStore,
    summaryStore,
    memoryStore,
    requestTraceStore,
  });
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`OpsPilot HTTP server ouvindo em :${port}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main();
}
