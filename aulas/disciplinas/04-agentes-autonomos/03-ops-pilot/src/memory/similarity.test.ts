import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dotProduct } from "./similarity.js";

describe("dotProduct", () => {
  it("de vetores idênticos normalizados é aproximadamente 1", () => {
    const v = new Float32Array([0.6, 0.8]);
    assert.ok(Math.abs(dotProduct(v, v) - 1) < 1e-6);
  });

  it("de vetores ortogonais é 0", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    assert.equal(dotProduct(a, b), 0);
  });
});
