import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDurationMs } from "./duration.js";

describe("parseDurationMs", () => {
  it("aceita segundos, minutos, horas e dias", () => {
    assert.equal(parseDurationMs("30s"), 30_000);
    assert.equal(parseDurationMs("30m"), 1_800_000);
    assert.equal(parseDurationMs("24h"), 86_400_000);
    assert.equal(parseDurationMs("7d"), 604_800_000);
  });

  it("devolve undefined para formatos não reconhecidos", () => {
    assert.equal(parseDurationMs("24"), undefined);
    assert.equal(parseDurationMs("h24"), undefined);
    assert.equal(parseDurationMs("24hrs"), undefined);
    assert.equal(parseDurationMs(""), undefined);
  });
});
