import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setApiUrl } from "../../src/config/api-settings";
import { postChat, postDecision } from "../../src/api/ops-pilot-client";
import { OpsPilotApiError } from "../../src/api/types";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("postChat", () => {
  beforeEach(() => {
    setApiUrl("http://localhost:3000");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("200 vira um ChatResult de sucesso", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        answer: "ok",
        trace: [{ type: "answer", text: "ok", partial: false }],
        metrics: { llmCalls: 1, latencyMs: 1, historyMessages: 0 },
        conversation: "c1",
        requestId: "r1",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postChat({ message: "oi", userId: "u1" });
    expect(result.kind).toBe("success");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3000/opspilot/chat");
  });

  it("202 vira um ChatResult de aprovação pendente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(202, {
        conversation: "c1",
        pendingApproval: {
          id: "r1",
          tool: "resolve_incident",
          args: { id: "inc-1" },
          description: "Resolver incidente inc-1",
          status: "pending",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postChat({ message: "resolva", userId: "u1" });
    expect(result.kind).toBe("pendingApproval");
    if (result.kind === "pendingApproval") {
      expect(result.pendingApproval.status).toBe("pending");
    }
  });

  it("status de erro lança OpsPilotApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(422, { error: "estratégia desconhecida" })));
    await expect(postChat({ message: "x", userId: "u1" })).rejects.toBeInstanceOf(OpsPilotApiError);
  });
});

describe("postDecision", () => {
  beforeEach(() => {
    setApiUrl("http://localhost:3000");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("monta a URL com o requestId e retorna o resultado em caso de 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { answer: "aprovado", trace: [], conversation: "c1", requestId: "r1" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await postDecision("r1", "approve");
    expect(result.answer).toBe("aprovado");
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3000/opspilot/chat/r1/decision");
  });

  it("409 lança OpsPilotApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, { error: "decisão já registrada" })));
    await expect(postDecision("r1", "deny")).rejects.toBeInstanceOf(OpsPilotApiError);
  });
});
