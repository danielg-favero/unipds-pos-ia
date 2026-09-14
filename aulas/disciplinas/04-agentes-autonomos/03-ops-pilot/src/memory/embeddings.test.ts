import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { embed } from "./embeddings.js";

describe("embed", () => {
  it("devolve um vetor de 384 posições, normalizado (norma ≈ 1)", async () => {
    const vector = await embed("prefiro reuniões pela manhã");
    assert.equal(vector.length, 384);

    let normSquared = 0;
    for (const value of vector) normSquared += value * value;
    assert.ok(Math.abs(Math.sqrt(normSquared) - 1) < 1e-3);
  });

  it("reutiliza a mesma instância do pipeline em chamadas concorrentes (singleton lazy)", async () => {
    const [a, b] = await Promise.all([embed("primeiro texto"), embed("segundo texto")]);
    assert.equal(a.length, 384);
    assert.equal(b.length, 384);
  });
});
