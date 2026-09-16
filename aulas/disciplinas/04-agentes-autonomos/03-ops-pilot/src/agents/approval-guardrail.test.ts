import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApprovalRequiredError } from "../domain/approval.js";
import { MemoryOpsStore } from "../store/memory.js";
import { SqliteApprovalStore } from "../store/sqlite/sqlite-approval-store.js";
import { withApprovalGuardrail } from "./approval-guardrail.js";

describe("withApprovalGuardrail", () => {
  it("preserva todos os métodos não sensíveis do store original (regressão: spread perdia métodos de protótipo)", async () => {
    const store = new MemoryOpsStore();
    const guarded = withApprovalGuardrail(store, "r1", "c1", new SqliteApprovalStore(":memory:"));

    // Nenhum destes deve lançar "is not a function".
    await guarded.listAlerts();
    await guarded.listServices();
    await guarded.listIncidents();
    await guarded.getRunbook("checkout-api");
    const incident = await store.openIncident({ title: "x", serviceId: "checkout-api", severity: "high" });
    const found = await guarded.getIncident(incident.id);
    assert.equal(found?.id, incident.id);
  });

  it("intercepta openIncident/resolveIncident: nunca executa, sempre lança ApprovalRequiredError", async () => {
    const store = new MemoryOpsStore();
    const opened = await store.openIncident({ title: "x", serviceId: "checkout-api", severity: "high" });
    const guarded = withApprovalGuardrail(store, "r1", "c1", new SqliteApprovalStore(":memory:"));

    await assert.rejects(() => guarded.resolveIncident(opened.id), ApprovalRequiredError);
    const stillOpen = await store.getIncident(opened.id);
    assert.equal(stillOpen?.status, "open");
  });
});
