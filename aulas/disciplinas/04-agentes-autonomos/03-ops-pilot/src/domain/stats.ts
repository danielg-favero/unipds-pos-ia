import type { RequestStatus } from "../store/request-trace-port.js";

export type RequestStatRow = {
  readonly route?: string;
  readonly modelUsed?: string;
  readonly status: RequestStatus;
  readonly durationMs?: number;
  readonly promptTokensReal?: number;
  readonly costUsd?: number;
};

export type StatsSummary = {
  readonly total: number;
  readonly errors: number;
  readonly tokens: number;
  readonly costUsd: number;
  readonly latencyMs: { readonly p50: number; readonly p95: number };
};

export type GroupedStats = StatsSummary & { readonly key: string };

/** `status !== 'ok'` conta como erro (inclui timeout). */
const isError = (status: RequestStatus): boolean => status !== "ok";

/** Percentil por interpolação do "nearest-rank" mais próximo — `sorted` já deve estar em ordem crescente. */
export const percentile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)]!;
};

export const summarize = (rows: readonly RequestStatRow[]): StatsSummary => {
  const durations = rows
    .map((row) => row.durationMs)
    .filter((value): value is number => value !== undefined)
    .toSorted((a, b) => a - b);

  return {
    total: rows.length,
    errors: rows.filter((row) => isError(row.status)).length,
    tokens: rows.reduce((sum, row) => sum + (row.promptTokensReal ?? 0), 0),
    costUsd: rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0),
    latencyMs: { p50: percentile(durations, 50), p95: percentile(durations, 95) },
  };
};

/** Agrupa por `keyFn` (rota ou modelo); grupos sem chave definida caem em `"desconhecida"`. */
export const groupBy = (
  rows: readonly RequestStatRow[],
  keyFn: (row: RequestStatRow) => string | undefined,
  fallbackKey = "desconhecida",
): GroupedStats[] => {
  const buckets = new Map<string, RequestStatRow[]>();
  for (const row of rows) {
    const key = keyFn(row) ?? fallbackKey;
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [row]);
    else bucket.push(row);
  }

  return [...buckets.entries()]
    .map(([key, groupRows]) => ({ key, ...summarize(groupRows) }))
    .toSorted((a, b) => b.total - a.total);
};
