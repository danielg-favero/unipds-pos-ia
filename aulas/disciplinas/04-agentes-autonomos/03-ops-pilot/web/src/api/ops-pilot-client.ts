import { getApiUrl } from "../config/api-settings";
import { OpsPilotApiError, type ChatResult, type PendingApproval, type RunMetrics, type TraceEvent } from "./types";

export type PostChatInput = {
  readonly message: string;
  readonly userId: string;
  readonly conversation?: string;
};

const joinUrl = (base: string, path: string): string => new URL(`opspilot${path}`, ensureTrailingSlash(base)).toString();
const ensureTrailingSlash = (url: string): string => (url.endsWith("/") ? url : `${url}/`);

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** POST /chat — trata 200 (sucesso) e 202 (ação pendente) como variantes tipadas de um mesmo resultado (contracts/http-api.md). */
export async function postChat(input: PostChatInput): Promise<ChatResult> {
  const response = await fetch(joinUrl(getApiUrl(), "/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = await readJson(response);

  if (response.status === 200) {
    return {
      kind: "success",
      answer: body.answer as string,
      trace: body.trace as readonly TraceEvent[],
      metrics: body.metrics as RunMetrics,
      conversation: body.conversation as string,
      requestId: body.requestId as string,
    };
  }

  if (response.status === 202) {
    return {
      kind: "pendingApproval",
      conversation: body.conversation as string,
      pendingApproval: body.pendingApproval as PendingApproval,
    };
  }

  throw new OpsPilotApiError((body.error as string) ?? `HTTP ${response.status}`, response.status);
}

export type Decision = "approve" | "deny";

export type DecisionResult = {
  readonly answer: string;
  readonly trace: readonly TraceEvent[];
  readonly conversation?: string;
  readonly requestId: string;
};

/** POST /chat/:requestId/decision — 200 (decidido), 404 (id desconhecido) ou 409 (já decidido). */
export async function postDecision(requestId: string, decision: Decision): Promise<DecisionResult> {
  const response = await fetch(joinUrl(getApiUrl(), `/chat/${requestId}/decision`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });

  const body = await readJson(response);

  if (response.status !== 200) {
    throw new OpsPilotApiError((body.error as string) ?? `HTTP ${response.status}`, response.status);
  }

  return {
    answer: body.answer as string,
    trace: body.trace as readonly TraceEvent[],
    conversation: body.conversation as string | undefined,
    requestId: body.requestId as string,
  };
}
