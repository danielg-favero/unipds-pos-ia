import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { estimateCostUsd } from "./pricing.js";

describe("estimateCostUsd", () => {
  it("modelo terminado em :free custa 0, mesmo com tokens", () => {
    assert.equal(estimateCostUsd("meta-llama/llama-3-8b:free", 10_000), 0);
  });

  it("modelo desconhecido custa 0 (sem preço cadastrado)", () => {
    assert.equal(estimateCostUsd("modelo-nunca-visto", 10_000), 0);
  });

  it("sem modelo ou sem tokens custa 0", () => {
    assert.equal(estimateCostUsd(undefined, 10_000), 0);
    assert.equal(estimateCostUsd("openai/gpt-4o", undefined), 0);
  });

  it("modelo com preço cadastrado calcula proporcional a 1K tokens", () => {
    assert.equal(estimateCostUsd("openai/gpt-4o-mini", 2000), 0.0003);
  });
});
