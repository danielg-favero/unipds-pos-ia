import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupBy, percentile, summarize, type RequestStatRow } from "./stats.js";

describe("percentile", () => {
  it("devolve 0 para lista vazia", () => {
    assert.equal(percentile([], 50), 0);
  });

  it("p50/p95 sobre uma lista já ordenada", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    assert.equal(percentile(sorted, 50), 50);
    assert.equal(percentile(sorted, 95), 100);
  });
});

describe("summarize", () => {
  const rows: RequestStatRow[] = [
    { status: "ok", durationMs: 100, promptTokensReal: 10, costUsd: 0.01, route: "react" },
    { status: "ok", durationMs: 200, promptTokensReal: 20, costUsd: 0.02, route: "react" },
    { status: "error", durationMs: 300, promptTokensReal: 30, costUsd: 0, route: "plan-and-execute" },
    { status: "timeout", promptTokensReal: undefined, costUsd: undefined },
  ];

  it("total conta todas as linhas; errors conta status != ok", () => {
    const summary = summarize(rows);
    assert.equal(summary.total, 4);
    assert.equal(summary.errors, 2);
  });

  it("tokens e costUsd somam, tratando ausência como 0", () => {
    const summary = summarize(rows);
    assert.equal(summary.tokens, 60);
    assert.equal(summary.costUsd, 0.03);
  });

  it("latencyMs ignora linhas sem durationMs", () => {
    const summary = summarize(rows);
    assert.equal(summary.latencyMs.p50, 200);
    assert.equal(summary.latencyMs.p95, 300);
  });

  it("lista vazia devolve zeros, sem lançar", () => {
    const summary = summarize([]);
    assert.deepEqual(summary, {
      total: 0,
      errors: 0,
      tokens: 0,
      costUsd: 0,
      latencyMs: { p50: 0, p95: 0 },
    });
  });
});

describe("groupBy", () => {
  const rows: RequestStatRow[] = [
    { status: "ok", durationMs: 100, promptTokensReal: 10, route: "react" },
    { status: "ok", durationMs: 200, promptTokensReal: 20, route: "react" },
    { status: "error", durationMs: 300, promptTokensReal: 30, route: "plan-and-execute" },
    { status: "ok", durationMs: 50, promptTokensReal: 5 },
  ];

  it("agrupa por rota, linhas sem rota caem em 'desconhecida'", () => {
    const grouped = groupBy(rows, (row) => row.route);
    const keys = grouped.map((g) => g.key).toSorted();
    assert.deepEqual(keys, ["desconhecida", "plan-and-execute", "react"]);
  });

  it("cada grupo soma corretamente e ordena por total desc", () => {
    const grouped = groupBy(rows, (row) => row.route);
    assert.equal(grouped[0]!.key, "react");
    assert.equal(grouped[0]!.total, 2);
    assert.equal(grouped[0]!.tokens, 30);
  });
});
