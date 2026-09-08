import { z } from "zod";

import { ValidationError } from "../domain/errors.js";
import { SCENARIO_IDS, type ScenarioId } from "../bench/scenarios.js";

const BenchArgsSchema = z.object({
  scenarios: z.array(z.enum(SCENARIO_IDS)).default([...SCENARIO_IDS]),
  noReplanner: z.boolean().default(false),
});

export type BenchArgs = z.infer<typeof BenchArgsSchema>;

export const benchUsage = (): string =>
  [
    "Uso: npm run benh -- [--scenario c1,c2,c3] [--no-replanner]",
    `Cenários disponíveis: ${SCENARIO_IDS.join(", ")}`,
  ].join("\n");

const isScenarioId = (value: string): value is ScenarioId =>
  (SCENARIO_IDS as readonly string[]).includes(value);

/**
 * Validação de fronteira do bench: função pura que recebe argv e devolve args
 * validados, ou lança `ValidationError` com a mensagem de uso.
 */
export function parseBenchArgs(argv: readonly string[]): BenchArgs {
  const raw: Record<string, unknown> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case "--scenario": {
        const ids = (argv[++i] ?? "")
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id !== "");
        for (const id of ids) {
          if (!isScenarioId(id)) {
            throw new ValidationError(`Cenário desconhecido: ${id}\n${benchUsage()}`);
          }
        }
        // Lista vazia (ex.: "--scenario" sem valor) cai no default: todos.
        if (ids.length > 0) raw.scenarios = ids;
        break;
      }
      case "--no-replanner":
        raw.noReplanner = true;
        break;
      default:
        throw new ValidationError(`Flag desconhecida: ${arg}\n${benchUsage()}`);
    }
  }

  const parsed = BenchArgsSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "argumento"}: ${issue.message}`)
      .join("; ");
    throw new ValidationError(`Argumentos inválidos — ${issues}\n${benchUsage()}`);
  }
  return parsed.data;
}
