import { pathToFileURL } from "node:url";

import express, { type Express } from "express";

import { strategies as productionStrategies } from "../agents/registry.js";
import { UnknownStrategyError, errorMessage } from "../domain/errors.js";
import type { ReasoningStrategy } from "../domain/strategy.js";
import type { OpsStore } from "../store/port.js";
import { chatRequestSchema } from "./schemas.js";

/** Mesmo default do CLI (`src/cli/args.ts`) para manter as estratégias comparáveis. */
const DEFAULT_MAX_ITERATIONS = 8;

/** Tempo limite por requisição (FR-009): 180s, sobrescrevível nos testes. */
const DEFAULT_TIMEOUT_MS = 180_000;

export type ServerDeps = {
  readonly strategies: Readonly<Record<string, ReasoningStrategy>>;
  readonly store: OpsStore;
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

    const { message, reflect, strategy: strategyName = "react" } = parsed.data;
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

    Promise.race([
      strategy.run({ request: message, maxIterations: DEFAULT_MAX_ITERATIONS, store: deps.store }),
      timeout,
    ])
      .then((result) => {
        if (result === TIMEOUT) {
          res.status(504).json({ error: "tempo limite excedido (180s)" });
          return;
        }
        res.status(200).json(result);
      })
      .catch((error: unknown) => {
        res.status(500).json({ error: errorMessage(error) });
      });
  });

  return app;
}

async function main(): Promise<void> {
  const { SqliteOpsStore } = await import("../store/sqlite/sqlite-ops-store.js");
  const store = new SqliteOpsStore();
  const app = createServer({ strategies: productionStrategies, store });
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, () => {
    console.log(`OpsPilot HTTP server ouvindo em :${port}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void main();
}
