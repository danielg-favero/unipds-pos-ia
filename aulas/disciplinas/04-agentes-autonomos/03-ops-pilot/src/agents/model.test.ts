import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ConfigError } from "../domain/errors.js";
import { getModelPlan, withModelResilience } from "./model.js";

const withEnv = async (env: Record<string, string | undefined>, run: () => Promise<void> | void) => {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) previous[key] = process.env[key];

  try {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const FAKE_KEY = "sk-fake-secret-value-do-not-leak";

describe("getModelPlan (014)", () => {
  it("lança ConfigError citando o NOME da variável quando OPENROUTER_API_KEY/OPENROUTER_MODEL faltam", async () => {
    await withEnv(
      { OPENROUTER_API_KEY: undefined, OPENROUTER_MODEL: undefined, OPENROUTER_MODEL_FALLBACK: undefined },
      () => {
        assert.throws(() => getModelPlan(), (error: unknown) => {
          assert.ok(error instanceof ConfigError);
          assert.match((error as Error).message, /OPENROUTER_API_KEY/);
          assert.match((error as Error).message, /OPENROUTER_MODEL\b/);
          return true;
        });
      },
    );
  });

  it("trata OPENROUTER_MODEL_FALLBACK ausente como fallbackModel undefined, sem erro (FR-008)", async () => {
    await withEnv(
      { OPENROUTER_API_KEY: FAKE_KEY, OPENROUTER_MODEL: "primary-model", OPENROUTER_MODEL_FALLBACK: undefined },
      () => {
        const plan = getModelPlan();
        assert.equal(plan.primaryModel, "primary-model");
        assert.equal(plan.fallbackModel, undefined);
      },
    );
  });

  it("expõe fallbackModel quando OPENROUTER_MODEL_FALLBACK está definido", async () => {
    await withEnv(
      { OPENROUTER_API_KEY: FAKE_KEY, OPENROUTER_MODEL: "primary-model", OPENROUTER_MODEL_FALLBACK: "backup-model" },
      () => {
        const plan = getModelPlan();
        assert.equal(plan.fallbackModel, "backup-model");
      },
    );
  });
});

describe("withModelResilience (014)", () => {
  it("US1: recupera de uma falha transitória do primário via retry, sem envolver a reserva", async () => {
    let calls = 0;
    const outcome = await withModelResilience({ primaryModel: "primary", fallbackModel: "backup" }, async (model) => {
      calls += 1;
      assert.equal(model, "primary");
      if (calls === 1) throw new Error("falha transitória");
      return "ok";
    });

    assert.equal(outcome.result, "ok");
    assert.equal(outcome.modelUsed, "primary");
    assert.equal(outcome.usedFallback, false);
    assert.equal(calls, 2);
  });

  it("US2: troca para a reserva quando o primário esgota as tentativas", async () => {
    const outcome = await withModelResilience({ primaryModel: "primary", fallbackModel: "backup" }, async (model) => {
      if (model === "primary") throw new Error("primário sempre falha");
      return `resposta de ${model}`;
    });

    assert.equal(outcome.result, "resposta de backup");
    assert.equal(outcome.modelUsed, "backup");
    assert.equal(outcome.usedFallback, true);
  });

  it("US1/FR-008: sem reserva configurada, propaga o erro do primário assim que ele se esgota", async () => {
    await assert.rejects(
      withModelResilience({ primaryModel: "primary", fallbackModel: undefined }, async () => {
        throw new Error("primário sempre falha");
      }),
      /primário sempre falha/,
    );
  });

  it("US3: se ambos se esgotarem, rejeita com o erro do último candidato, sem tentativa adicional", async () => {
    const attempts: string[] = [];
    await assert.rejects(
      withModelResilience({ primaryModel: "primary", fallbackModel: "backup" }, async (model) => {
        attempts.push(model);
        throw new Error(`${model} indisponível`);
      }),
      /backup indisponível/,
    );

    // 2 tentativas no primário + 2 na reserva (RETRY_ATTEMPTS = 2 cada) — nunca infinito.
    assert.deepEqual(attempts, ["primary", "primary", "backup", "backup"]);
  });

  it("FR-007: uma falha total não expõe a API key nas mensagens de erro", async () => {
    try {
      await withModelResilience({ primaryModel: "primary", fallbackModel: "backup" }, async () => {
        throw new Error("erro genérico do provedor, sem credenciais");
      });
      assert.fail("deveria ter rejeitado");
    } catch (error) {
      assert.doesNotMatch((error as Error).message, new RegExp(FAKE_KEY));
    }
  });
});
