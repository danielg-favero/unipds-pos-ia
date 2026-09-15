import type { TraceEvent } from "./strategy.js";

/** JSON com chaves ordenadas alfabeticamente — é o que torna a saída determinística. */
const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`);
  return `{${entries.join(",")}}`;
};

const formatEvent = (event: TraceEvent): string => {
  switch (event.type) {
    case "thought":
      return `[thought] ${event.text}`;
    case "plan":
      return [
        "[plan]",
        ...event.steps.map((step, index) => `  ${index + 1}. ${step}`),
      ].join("\n");
    case "action":
      return `[action] ${event.tool}(${stableJson(event.args)})`;
    case "observation":
      return event.ok
        ? `[observation] ok${event.result === undefined ? "" : ` ${stableJson(event.result)}`}`
        : `[observation] erro: ${event.error ?? "desconhecido"}`;
    case "critique":
      return `[critique] ${event.text}`;
    case "answer":
      return `[answer] ${event.text}${event.partial ? " (parcial)" : ""}`;
    case "route":
      return `[route] ${event.route}${event.manual ? " (manual)" : ""}: ${event.reason}`;
    case "fallback":
      return `[fallback] ${event.primaryModel} → ${event.fallbackModel}: ${event.reason}`;
  }
};

/**
 * Renderização determinística do trace: sem timestamps, sem cores, sem ids
 * instáveis. A mesma entrada sempre produz a mesma string (FR-007).
 */
export const formatTrace = (trace: readonly TraceEvent[]): string =>
  trace.map(formatEvent).join("\n");
