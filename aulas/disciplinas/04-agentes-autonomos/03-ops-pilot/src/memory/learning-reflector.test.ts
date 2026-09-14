import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SqliteMemoryStore } from "../store/sqlite/sqlite-memory-store.js";
import type { LearningReflectorFn, LearningVerdict } from "./learning-reflector.js";
import { defaultLearningReflector, reflectLearning, LEARNING_SYSTEM_PROMPT } from "./learning-reflector.js";

/** Refletor falso: devolve um veredito fixo, sem tocar rede/modelo. */
function scriptedReflector(verdict: LearningVerdict): LearningReflectorFn & { calls: number } {
  const reflector = Object.assign(
    async (): Promise<LearningVerdict> => {
      reflector.calls += 1;
      return verdict;
    },
    { calls: 0 },
  );
  return reflector;
}

/** Refletor falso que sempre rejeita, simulando falha do provedor. */
function failingReflector(): LearningReflectorFn {
  return async () => {
    throw new Error("provedor indisponível");
  };
}

describe("reflectLearning — User Story 1 (aprende fatos duráveis)", () => {
  it("chama remember quando o refletor devolve hasLearned: true com fact", async () => {
    const store = new SqliteMemoryStore(":memory:");
    const reflector = scriptedReflector({ hasLearned: true, fact: "prefiro reuniões pela manhã" });

    await reflectLearning(
      { request: "só posso de manhã", answer: "ok, anotado", userId: "u1", memoryStore: store },
      reflector,
    );

    const recalled = await store.recall("u1", "reunião de manhã");
    assert.ok(recalled.some((memory) => memory.fact === "prefiro reuniões pela manhã"));
    assert.equal(reflector.calls, 1);
    store.close();
  });

  it("nunca lança quando o refletor rejeita (falha de provedor)", async () => {
    const store = new SqliteMemoryStore(":memory:");
    await assert.doesNotReject(() =>
      reflectLearning(
        { request: "oi", answer: "olá", userId: "u1", memoryStore: store },
        failingReflector(),
      ),
    );
    const recalled = await store.recall("u1", "oi", 10);
    assert.equal(recalled.length, 0);
    store.close();
  });

  it("trata saída inválida (hasLearned true sem fact) como nada aprendido, sem chamar remember", async () => {
    const store = new SqliteMemoryStore(":memory:");
    const reflector = scriptedReflector({ hasLearned: true });

    await reflectLearning(
      { request: "oi", answer: "olá", userId: "u1", memoryStore: store },
      reflector,
    );

    const recalled = await store.recall("u1", "oi", 10);
    assert.equal(recalled.length, 0);
    store.close();
  });
});

describe("reflectLearning — User Story 2 (exclui pedido pontual e informação sensível)", () => {
  it("não chama remember quando o refletor devolve hasLearned: false (pedido pontual)", async () => {
    const store = new SqliteMemoryStore(":memory:");
    const reflector = scriptedReflector({ hasLearned: false });

    await reflectLearning(
      {
        request: "abra um incidente para o checkout",
        answer: "incidente aberto",
        userId: "u1",
        memoryStore: store,
      },
      reflector,
    );

    const recalled = await store.recall("u1", "incidente checkout", 10);
    assert.equal(recalled.length, 0);
    store.close();
  });

  it("memoriza apenas a parte durável quando a mensagem mistura pedido pontual e fato", async () => {
    const store = new SqliteMemoryStore(":memory:");
    const reflector = scriptedReflector({ hasLearned: true, fact: "só trabalha de manhã" });

    await reflectLearning(
      {
        request: "abra um incidente pro checkout — aliás, eu só trabalho de manhã",
        answer: "incidente aberto",
        userId: "u1",
        memoryStore: store,
      },
      reflector,
    );

    const recalled = await store.recall("u1", "período do dia que trabalha", 10);
    assert.deepEqual(
      recalled.map((memory) => memory.fact),
      ["só trabalha de manhã"],
    );
    store.close();
  });

  it("o prompt do refletor real instrui a nunca aprender pedido pontual nem informação sensível", () => {
    const prompt = LEARNING_SYSTEM_PROMPT.toLowerCase();
    assert.match(prompt, /pontual/);
    assert.match(prompt, /sens[ií]vel|confidencial|senha|segredo/);
  });
});

describe("defaultLearningReflector", () => {
  it("é uma função exportada, usada como padrão de reflectLearning", () => {
    assert.equal(typeof defaultLearningReflector, "function");
  });
});
