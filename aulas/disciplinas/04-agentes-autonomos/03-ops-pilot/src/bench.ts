import { createPlanAndExecuteStrategy, planAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { reactStrategy } from "./agents/react.js";
import { SCENARIOS, type BenchScenario } from "./bench/scenarios.js";
import { parseBenchArgs, type BenchArgs } from "./cli/bench-args.js";
import { errorMessage } from "./domain/errors.js";
import type { ReasoningStrategy } from "./domain/strategy.js";
import { MemoryOpsStore } from "./store/memory.js";

const DEFAULT_MAX_ITERATIONS = 8;

type ResultRow = {
  readonly scenario: string;
  readonly strategy: string;
  readonly hit: boolean;
  readonly llmCalls: number;
  readonly latencyMs: number;
  readonly note?: string;
};

/**
 * Uma execução isolada: store novo por combinação (comparação justa sobre o
 * mesmo estado inicial), acerto verificado no estado final do store — nunca
 * no texto da resposta.
 */
async function runOne(strategy: ReasoningStrategy, scenario: BenchScenario): Promise<ResultRow> {
  const store = new MemoryOpsStore();
  try {
    const result = await strategy.run({
      request: scenario.request,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      store,
    });
    const incidents = await store.listIncidents();
    return {
      scenario: scenario.id,
      strategy: strategy.name,
      hit: scenario.check(incidents, result),
      llmCalls: result.metrics.llmCalls,
      latencyMs: result.metrics.latencyMs,
    };
  } catch (error) {
    return {
      scenario: scenario.id,
      strategy: strategy.name,
      hit: false,
      llmCalls: 0,
      latencyMs: 0,
      note: errorMessage(error),
    };
  }
}

/** Tabela markdown alinhada — legível no terminal e colável em docs. */
function formatTable(rows: readonly ResultRow[]): string {
  const header = ["cenário", "estratégia", "acerto", "llmCalls", "latencyMs"];
  const body = rows.map((row) => [
    row.scenario,
    row.strategy,
    row.hit ? "sim" : "não",
    String(row.llmCalls),
    String(row.latencyMs),
  ]);
  const widths = header.map((title, col) =>
    Math.max(title.length, ...body.map((cells) => cells[col]!.length)),
  );
  const line = (cells: readonly string[]) =>
    `| ${cells.map((cell, col) => cell.padEnd(widths[col]!)).join(" | ")} |`;
  const separator = `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`;
  return [line(header), separator, ...body.map(line)].join("\n");
}

/** As duas estratégias do bench. --no-replanner troca plan-and-execute pela ablação sem replanejador. */
const matrixStrategies = (args: BenchArgs): readonly ReasoningStrategy[] => [
  reactStrategy,
  args.noReplanner
    ? createPlanAndExecuteStrategy({ name: "plan-and-execute", skipReplanner: true })
    : planAndExecuteStrategy,
];

export async function main(argv: readonly string[]): Promise<number> {
  let args: BenchArgs;
  try {
    args = parseBenchArgs(argv);
  } catch (error) {
    console.error(errorMessage(error));
    return 1;
  }

  const scenarios = SCENARIOS.filter((scenario) => args.scenarios.includes(scenario.id));
  const strategies = matrixStrategies(args);

  const rows: ResultRow[] = [];
  for (const scenario of scenarios) {
    for (const strategy of strategies) {
      // Progresso em stderr: mantém stdout limpo para a tabela consolidada.
      console.error(`rodando ${scenario.id} (${scenario.label}) × ${strategy.name}...`);
      const row = await runOne(strategy, scenario);
      if (row.note !== undefined) {
        console.error(`  !!! ${scenario.id} × ${strategy.name}: ${row.note}`);
      }
      rows.push(row);
    }
  }

  console.log(formatTable(rows));

  const hits = rows.filter((row) => row.hit).length;
  console.error(`\n${hits}/${rows.length} acertos`);

  return rows.every((row) => row.hit) ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));
