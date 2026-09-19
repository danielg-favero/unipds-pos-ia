import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { makeTools } from "../../agents/tools.js";
import { MemoryOpsStore } from "../../store/memory.js";
import { withApprovalGuardrail } from "../../agents/approval-guardrail.js";
import { SqliteApprovalStore } from "../../store/sqlite/sqlite-approval-store.js";
import { ApprovalRequiredError } from "../../domain/approval.js";
import { EXECUTOR_TOOL_NAMES } from "./executor.js";

describe("executor — escopo de ferramentas e guardrail (US2, FR-007)", () => {
  it("só recebe as ferramentas de ação sobre incidentes", () => {
    const tools = makeTools(new MemoryOpsStore()).filter((tool) =>
      (EXECUTOR_TOOL_NAMES as readonly string[]).includes(tool.name),
    );
    const names = tools.map((tool) => tool.name).toSorted();
    assert.deepEqual(names, [...EXECUTOR_TOOL_NAMES].toSorted());
  });

  it("sobre um store protegido por withApprovalGuardrail, abrir/resolver incidente nunca executa direto — sempre exige aprovação", async () => {
    const store = new MemoryOpsStore();
    const guarded = withApprovalGuardrail(store, "r1", "c1", new SqliteApprovalStore(":memory:"));
    const tools = makeTools(guarded).filter((tool) =>
      (EXECUTOR_TOOL_NAMES as readonly string[]).includes(tool.name),
    );
    const openIncident = tools.find((tool) => tool.name === "open_incident")!;

    await assert.rejects(
      () => guarded.openIncident({ title: "x", serviceId: "checkout-api", severity: "high" }),
      ApprovalRequiredError,
    );
    assert.ok(openIncident !== undefined);
  });
});
