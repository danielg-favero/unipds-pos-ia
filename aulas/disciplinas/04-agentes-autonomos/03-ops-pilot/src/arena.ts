import { resolveStrategies, strategyNames } from "./agents/registry.js";
import { parseArgs, type ArenaArgs } from "./cli/args.js";
import { errorMessage } from "./domain/errors.js";
import type { ReasoningStrategy } from "./domain/strategy.js";
import { formatTrace } from "./domain/trace.js";
import { JsonOpsStore } from "./store/json.js";
import { MemoryOpsStore } from "./store/memory.js";
import type { OpsStore } from "./store/port.js";

const makeStore = async (kind: ArenaArgs["store"]): Promise<OpsStore> => {
  // json é o padrão: o modelo lê o que já existe e o que ele cria persiste.
  if (kind === "json") return new JsonOpsStore();
  if (kind === "memory") return new MemoryOpsStore();
  const { createSequelizeStore } = await import("./store/sequelize/store.js");
  return createSequelizeStore();
};

/** Bloco de saída de uma estratégia: nome, trace formatado e métricas. */
async function runOne(strategy: ReasoningStrategy, args: ArenaArgs): Promise<string> {
  const lines = [`=== ${strategy.name} ===`];
  try {
    // Cada estratégia recebe um store novo: comparação justa sobre o mesmo estado inicial.
    const result = await strategy.run({
      request: args.request,
      maxIterations: args.maxIterations,
      store: await makeStore(args.store),
    });
    lines.push(
      formatTrace(result.trace),
      "--- métricas ---",
      `llmCalls: ${result.metrics.llmCalls}   latencyMs: ${result.metrics.latencyMs}`,
    );
    return lines.join("\n");
  } catch (error) {
    lines.push(`!!! erro: ${errorMessage(error)}`);
    throw new ArenaFailure(lines.join("\n"));
  }
}

/** Carrega o bloco já formatado para que a falha de uma estratégia não derrube as outras. */
class ArenaFailure extends Error {
  constructor(readonly block: string) {
    super("estratégia falhou");
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  const available = strategyNames();

  let args: ArenaArgs;
  let selected: ReasoningStrategy[];
  try {
    args = parseArgs(argv, available);
    // Sem --strategies, roda todas as registradas.
    selected = resolveStrategies(args.strategies.length > 0 ? args.strategies : available);
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }

  let succeeded = 0;
  for (const strategy of selected) {
    try {
      console.log(await runOne(strategy, args));
      succeeded += 1;
    } catch (error) {
      console.log(error instanceof ArenaFailure ? error.block : errorMessage(error));
    }
    console.log("");
  }

  return succeeded > 0 ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
