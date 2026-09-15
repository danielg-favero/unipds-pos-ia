import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { SqliteConversationStore } from "./sqlite-conversation-store.js";

let dir: string;
let counter = 0;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "ops-sqlite-conv-"));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

const freshFile = (): string => join(dir, `db-${(counter += 1)}.db`);

describe("SqliteConversationStore (:memory:) — create", () => {
  it("gera ids distintos a cada chamada", async () => {
    const store = new SqliteConversationStore(":memory:");
    const a = await store.create();
    const b = await store.create();
    assert.notEqual(a, b);
    store.close();
  });
});

describe("SqliteConversationStore (:memory:) — append/lastMessages", () => {
  it("uma conversa sem mensagens devolve histórico vazio", async () => {
    const store = new SqliteConversationStore(":memory:");
    const id = await store.create();
    assert.deepEqual(await store.lastMessages(id, 12), []);
    store.close();
  });

  it("um id nunca gravado também devolve histórico vazio (sem erro)", async () => {
    const store = new SqliteConversationStore(":memory:");
    assert.deepEqual(await store.lastMessages("id-nunca-visto", 12), []);
    store.close();
  });

  it("devolve as mensagens gravadas em ordem cronológica", async () => {
    const store = new SqliteConversationStore(":memory:");
    const id = await store.create();
    await store.append(id, { role: "user", content: "oi" });
    await store.append(id, { role: "assistant", content: "olá, como posso ajudar?" });

    assert.deepEqual(await store.lastMessages(id, 12), [
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá, como posso ajudar?" },
    ]);
    store.close();
  });

  it("isola conversas diferentes", async () => {
    const store = new SqliteConversationStore(":memory:");
    const a = await store.create();
    const b = await store.create();
    await store.append(a, { role: "user", content: "mensagem de a" });

    assert.deepEqual(await store.lastMessages(a, 12), [
      { role: "user", content: "mensagem de a" },
    ]);
    assert.deepEqual(await store.lastMessages(b, 12), []);
    store.close();
  });

  it("lastMessages nunca devolve mais que o limite pedido, mantendo ordem cronológica", async () => {
    const store = new SqliteConversationStore(":memory:");
    const id = await store.create();
    for (let i = 1; i <= 15; i += 1) {
      await store.append(id, { role: "user", content: `mensagem ${i}` });
    }

    const last = await store.lastMessages(id, 12);
    assert.equal(last.length, 12);
    assert.equal(last[0]?.content, "mensagem 4");
    assert.equal(last.at(-1)?.content, "mensagem 15");
    store.close();
  });
});

describe("SqliteConversationStore — countMessages/messagesRange (011)", () => {
  it("countMessages é 0 para conversa vazia ou inexistente", async () => {
    const store = new SqliteConversationStore(":memory:");
    const id = await store.create();
    assert.equal(await store.countMessages(id), 0);
    assert.equal(await store.countMessages("id-nunca-visto"), 0);
    store.close();
  });

  it("countMessages reflete o total gravado", async () => {
    const store = new SqliteConversationStore(":memory:");
    const id = await store.create();
    for (let i = 1; i <= 5; i += 1) {
      await store.append(id, { role: "user", content: `mensagem ${i}` });
    }
    assert.equal(await store.countMessages(id), 5);
    store.close();
  });

  it("messagesRange devolve um intervalo parcial em ordem cronológica", async () => {
    const store = new SqliteConversationStore(":memory:");
    const id = await store.create();
    for (let i = 1; i <= 10; i += 1) {
      await store.append(id, { role: "user", content: `mensagem ${i}` });
    }
    const range = await store.messagesRange(id, 2, 5);
    assert.deepEqual(
      range.map((m) => m.content),
      ["mensagem 3", "mensagem 4", "mensagem 5"],
    );
    store.close();
  });

  it("messagesRange além do total devolve só o que existe, sem erro", async () => {
    const store = new SqliteConversationStore(":memory:");
    const id = await store.create();
    await store.append(id, { role: "user", content: "mensagem 1" });
    const range = await store.messagesRange(id, 0, 8);
    assert.deepEqual(range.map((m) => m.content), ["mensagem 1"]);
    store.close();
  });
});

describe("SqliteConversationStore — persistência entre reinícios (US3)", () => {
  it("mensagens gravadas antes de reiniciar continuam visíveis numa nova instância sobre o mesmo arquivo", async () => {
    const path = freshFile();
    const first = new SqliteConversationStore(path);
    const id = await first.create();
    await first.append(id, { role: "user", content: "qual o status do checkout?" });
    await first.append(id, { role: "assistant", content: "checkout-api está saudável." });
    first.close();

    const second = new SqliteConversationStore(path);
    const history = await second.lastMessages(id, 12);
    assert.deepEqual(history, [
      { role: "user", content: "qual o status do checkout?" },
      { role: "assistant", content: "checkout-api está saudável." },
    ]);
    second.close();
  });
});
