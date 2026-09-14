import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { SqliteMemoryStore } from "./sqlite-memory-store.js";

describe("SqliteMemoryStore — remember (US1)", () => {
  let store: SqliteMemoryStore;

  before(() => {
    store = new SqliteMemoryStore(":memory:");
  });
  after(() => store.close());

  it("grava um novo fato, recuperável depois via recall", async () => {
    await store.remember("u1", "só trabalho com Node e prefiro respostas curtas");
    const recalled = await store.recall("u1", "que linguagem você recomendaria pra mim usar aqui?");
    assert.equal(recalled.length, 1);
    assert.equal(recalled[0]?.fact, "só trabalho com Node e prefiro respostas curtas");
    assert.equal(recalled[0]?.userId, "u1");
    assert.equal(typeof recalled[0]?.createdAt, "string");
  });

  it("não duplica o mesmo fato repetido para o mesmo usuário (dedup > 0.92)", async () => {
    await store.remember("u2", "prefiro reuniões pela manhã");
    await store.remember("u2", "prefiro reuniões pela manhã");
    const recalled = await store.recall("u2", "reunião de manhã", 10);
    assert.equal(recalled.length, 1);
  });

  it("não deduplica o mesmo fato entre usuários diferentes", async () => {
    await store.remember("u3", "gosto de café");
    await store.remember("u4", "gosto de café");
    const forU3 = await store.recall("u3", "café", 10);
    const forU4 = await store.recall("u4", "café", 10);
    assert.equal(forU3.length, 1);
    assert.equal(forU4.length, 1);
  });
});

describe("SqliteMemoryStore — recall (US2)", () => {
  let store: SqliteMemoryStore;

  before(() => {
    store = new SqliteMemoryStore(":memory:");
  });
  after(() => store.close());

  it("encontra um fato relevante sem nenhuma palavra em comum com a consulta", async () => {
    await store.remember("u1", "prefiro reuniões pela manhã");
    const recalled = await store.recall("u1", "qual o melhor horário para marcar uma call comigo?");
    assert.ok(recalled.some((memory) => memory.fact === "prefiro reuniões pela manhã"));
  });

  it("nunca retorna mais que o limite (default 3) e descarta scores abaixo de 0.3", async () => {
    await store.remember("u5", "gosto de futebol");
    await store.remember("u5", "meu time é o Flamengo");
    await store.remember("u5", "trabalho como engenheiro de dados");
    await store.remember("u5", "moro em São Paulo");

    const recalled = await store.recall("u5", "qual seu time de futebol favorito?");
    assert.ok(recalled.length <= 3);
    assert.ok(recalled.every((memory) => memory.score >= 0.3));
  });

  it("nunca retorna fatos de outro usuário", async () => {
    await store.remember("u6", "meu fato secreto é X");
    const recalledForOther = await store.recall("u7", "meu fato secreto é X");
    assert.equal(recalledForOther.length, 0);
  });

  it("usuário sem memórias recebe array vazio, sem erro", async () => {
    const recalled = await store.recall("usuario-sem-memorias", "qualquer pergunta");
    assert.deepEqual(recalled, []);
  });
});

describe("SqliteMemoryStore — forget (US3)", () => {
  let store: SqliteMemoryStore;

  before(() => {
    store = new SqliteMemoryStore(":memory:");
  });
  after(() => store.close());

  it("remove um fato existente; recall não o retorna mais", async () => {
    await store.remember("u1", "fato a ser removido");
    const [memory] = await store.recall("u1", "fato a ser removido");
    assert.ok(memory);

    await store.forget("u1", memory.id);
    const recalled = await store.recall("u1", "fato a ser removido");
    assert.equal(recalled.length, 0);
  });

  it("forget de um id inexistente não lança erro e não afeta outras linhas", async () => {
    await store.remember("u1", "outro fato qualquer");
    await assert.doesNotReject(() => store.forget("u1", "id-inexistente"));

    const recalled = await store.recall("u1", "outro fato qualquer");
    assert.equal(recalled.length, 1);
  });

  it("forget não remove memória de outro usuário mesmo passando o id certo", async () => {
    await store.remember("u8", "fato do u8");
    const [memory] = await store.recall("u8", "fato do u8");
    assert.ok(memory);

    await store.forget("outro-usuario", memory.id);
    const stillThere = await store.recall("u8", "fato do u8");
    assert.equal(stillThere.length, 1);
  });
});
