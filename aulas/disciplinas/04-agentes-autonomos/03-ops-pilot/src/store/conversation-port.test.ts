import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MemoryConversationStore } from "./memory-conversation.js";

describe("MemoryConversationStore — create", () => {
  it("gera ids distintos a cada chamada", async () => {
    const store = new MemoryConversationStore();
    const a = await store.create();
    const b = await store.create();
    assert.notEqual(a, b);
  });
});

describe("MemoryConversationStore — append/lastMessages", () => {
  it("uma conversa sem mensagens devolve histórico vazio", async () => {
    const store = new MemoryConversationStore();
    const id = await store.create();
    assert.deepEqual(await store.lastMessages(id, 12), []);
  });

  it("um id nunca gravado também devolve histórico vazio (sem erro)", async () => {
    const store = new MemoryConversationStore();
    assert.deepEqual(await store.lastMessages("id-nunca-visto", 12), []);
  });

  it("devolve as mensagens gravadas em ordem cronológica", async () => {
    const store = new MemoryConversationStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "oi" });
    await store.append(id, { role: "assistant", content: "olá, como posso ajudar?" });

    assert.deepEqual(await store.lastMessages(id, 12), [
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá, como posso ajudar?" },
    ]);
  });

  it("isola conversas diferentes", async () => {
    const store = new MemoryConversationStore();
    const a = await store.create();
    const b = await store.create();
    await store.append(a, { role: "user", content: "mensagem de a" });

    assert.deepEqual(await store.lastMessages(a, 12), [
      { role: "user", content: "mensagem de a" },
    ]);
    assert.deepEqual(await store.lastMessages(b, 12), []);
  });
});

describe("MemoryConversationStore — janela de histórico (US2)", () => {
  it("lastMessages nunca devolve mais que o limite pedido", async () => {
    const store = new MemoryConversationStore();
    const id = await store.create();
    for (let i = 1; i <= 15; i += 1) {
      await store.append(id, { role: "user", content: `mensagem ${i}` });
    }

    const last = await store.lastMessages(id, 12);
    assert.equal(last.length, 12);
    assert.equal(last[0]?.content, "mensagem 4");
    assert.equal(last.at(-1)?.content, "mensagem 15");
  });

  it("com menos mensagens que o limite, devolve todas", async () => {
    const store = new MemoryConversationStore();
    const id = await store.create();
    await store.append(id, { role: "user", content: "única mensagem" });

    assert.equal((await store.lastMessages(id, 12)).length, 1);
  });
});
