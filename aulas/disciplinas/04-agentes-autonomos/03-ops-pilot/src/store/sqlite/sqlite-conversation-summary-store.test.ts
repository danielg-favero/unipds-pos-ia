import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SqliteConversationSummaryStore } from "./sqlite-conversation-summary-store.js";

describe("SqliteConversationSummaryStore — get", () => {
  it("devolve undefined para conversa sem resumo (FR-009)", async () => {
    const store = new SqliteConversationSummaryStore(":memory:");
    assert.equal(await store.get("nunca-sumarizada"), undefined);
    store.close();
  });
});

describe("SqliteConversationSummaryStore — save/get", () => {
  it("save seguido de get devolve o valor salvo", async () => {
    const store = new SqliteConversationSummaryStore(":memory:");
    await store.save("conv-1", { summary: "decidiu usar SQLite", summarizedThrough: 8 });
    assert.deepEqual(await store.get("conv-1"), {
      summary: "decidiu usar SQLite",
      summarizedThrough: 8,
    });
    store.close();
  });

  it("save duplicado substitui o resumo em vez de acumular linhas", async () => {
    const store = new SqliteConversationSummaryStore(":memory:");
    await store.save("conv-1", { summary: "primeiro resumo", summarizedThrough: 8 });
    await store.save("conv-1", { summary: "resumo mesclado", summarizedThrough: 16 });
    assert.deepEqual(await store.get("conv-1"), {
      summary: "resumo mesclado",
      summarizedThrough: 16,
    });
    store.close();
  });

  it("isola conversas diferentes", async () => {
    const store = new SqliteConversationSummaryStore(":memory:");
    await store.save("conv-a", { summary: "resumo de a", summarizedThrough: 8 });
    assert.equal(await store.get("conv-b"), undefined);
    store.close();
  });
});
