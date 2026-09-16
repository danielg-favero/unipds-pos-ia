import type { TraceEvent } from "../domain/strategy.js";

export type LogLine = {
  readonly requestId: string;
  readonly seq: number;
  readonly node: string;
  readonly status: "ok" | "error";
  readonly ts: string;
};

/** `observation` é o único tipo que pode falhar; os demais são sempre "ok". */
const statusOf = (event: TraceEvent): LogLine["status"] =>
  event.type === "observation" && !event.ok ? "error" : "ok";

/**
 * Monta a linha de log de um evento — só metadados, nunca os campos de payload
 * do `TraceEvent` original (`text`, `args`, `result`, `steps`, ...), por FR-008/SC-005.
 */
export const formatLogLine = (requestId: string, seq: number, event: TraceEvent): string =>
  JSON.stringify({
    requestId,
    seq,
    node: event.type,
    status: statusOf(event),
    ts: new Date().toISOString(),
  } satisfies LogLine);

/** Efeito colateral fino: escreve a linha em stdout. */
export const logEvent = (requestId: string, seq: number, event: TraceEvent): void => {
  console.log(formatLogLine(requestId, seq, event));
};
