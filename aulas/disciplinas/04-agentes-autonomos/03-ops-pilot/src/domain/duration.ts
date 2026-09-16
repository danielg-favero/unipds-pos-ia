const UNIT_MS: Readonly<Record<string, number>> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Aceita `<inteiro positivo><s|m|h|d>` (ex.: "24h", "30m", "7d"). `undefined` se não reconhecido. */
export const parseDurationMs = (input: string): number | undefined => {
  const match = /^(\d+)(s|m|h|d)$/.exec(input);
  if (match === null) return undefined;
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit as string]!;
};
