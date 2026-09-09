import { z } from "zod";

import { ValidationError } from "../domain/errors.js";

export const ArgsSchema = z.object({
  strategies: z.array(z.string().min(1)).default([]),
  maxIterations: z.number().int().min(1).max(20).default(8),
  store: z.enum(["json", "memory", "mysql", "sqlite"]).default("json"),
  request: z.string().min(1, "informe o pedido do plantonista"),
});

export type ArenaArgs = z.infer<typeof ArgsSchema>;

export const usage = (available: readonly string[]): string =>
  [
    'Uso: npm run arena -- [--strategies a,b] [--max-iterations N] [--store json|memory|mysql|sqlite] "<pedido>"',
    `Estratégias disponíveis: ${available.join(", ")}`,
  ].join("\n");

/**
 * Validação de fronteira da CLI: função pura que recebe argv e devolve args
 * validados, ou lança `ValidationError` com a mensagem de uso.
 */
export function parseArgs(argv: readonly string[], available: readonly string[]): ArenaArgs {
  const raw: Record<string, unknown> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case "--strategies":
        raw.strategies = (argv[++i] ?? "")
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name !== "");
        break;
      case "--max-iterations": {
        const value = Number(argv[++i]);
        if (!Number.isFinite(value)) {
          throw new ValidationError(
            `--max-iterations precisa ser um número.\n${usage(available)}`,
          );
        }
        raw.maxIterations = value;
        break;
      }
      case "--store":
        raw.store = argv[++i];
        break;
      default:
        if (arg.startsWith("--")) {
          throw new ValidationError(`Flag desconhecida: ${arg}\n${usage(available)}`);
        }
        positional.push(arg);
    }
  }

  raw.request = positional.join(" ").trim();

  const parsed = ArgsSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "argumento"}: ${issue.message}`)
      .join("; ");
    throw new ValidationError(`Argumentos inválidos — ${issues}\n${usage(available)}`);
  }
  return parsed.data;
}
