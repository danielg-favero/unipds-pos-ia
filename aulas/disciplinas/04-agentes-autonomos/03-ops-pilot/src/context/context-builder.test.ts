import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ConversationMessage } from "../store/conversation-port.js";
import {
  DEFAULT_CONTEXT_BUDGET,
  buildPromptSections,
  readBudgetFromEnv,
  type ScoredMemory,
} from "./context-builder.js";
import { estimateTokens } from "./tokens.js";

const history = (n: number): ConversationMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `mensagem ${i}`,
  }));

const memories = (scores: readonly number[]): ScoredMemory[] =>
  scores.map((score, i) => ({ fact: `fato ${i} `.repeat(3), score }));

describe("buildPromptSections — User Story 1 (orçamento por seção)", () => {
  it("trunca o resumo quando excede budget.summary", () => {
    const longSummary = "x".repeat(1000);
    const result = buildPromptSections({
      systemPrompt: "sys",
      request: "req",
      historySummary: longSummary,
      history: [],
      memories: [],
      budget: { summary: 10, history: 1000, memory: 1000 },
    });

    assert.ok(result.historySummary !== undefined);
    assert.ok(estimateTokens(result.historySummary!) <= 10);
    assert.ok(longSummary.startsWith(result.historySummary!));
  });

  it("mantém as mensagens mais recentes quando o histórico excede budget.history", () => {
    const messages = history(20);
    const result = buildPromptSections({
      systemPrompt: "sys",
      request: "req",
      history: messages,
      memories: [],
      budget: { summary: 1000, history: 12, memory: 1000 },
    });

    assert.deepEqual(result.history, messages.slice(messages.length - result.history.length));
    assert.equal(result.history[result.history.length - 1], messages[messages.length - 1]);
  });

  it("mantém as memórias de maior score quando excedem budget.memory", () => {
    const items = memories([1, 5, 3, 9, 2]);
    const result = buildPromptSections({
      systemPrompt: "sys",
      request: "req",
      history: [],
      memories: items,
      budget: { summary: 1000, history: 1000, memory: 20 },
    });

    const keptScores = result.memories.map((m) => m.score);
    assert.deepEqual([...keptScores].sort((a, b) => b - a), keptScores);
    assert.ok(keptScores.includes(9));
  });

  it("nunca corta systemPrompt/request, mesmo com todos os outros tetos em 0", () => {
    const result = buildPromptSections({
      systemPrompt: "instruções completas do sistema",
      request: "pedido atual completo",
      historySummary: "resumo",
      history: history(5),
      memories: memories([1, 2]),
      budget: { summary: 0, history: 0, memory: 0 },
    });

    assert.equal(result.systemPrompt, "instruções completas do sistema");
    assert.equal(result.request, "pedido atual completo");
    assert.equal(result.historySummary, undefined);
    assert.deepEqual(result.history, []);
    assert.deepEqual(result.memories, []);
  });

  it("com entradas vazias, devolve PromptSections válido sem erro", () => {
    const result = buildPromptSections({
      systemPrompt: "sys",
      request: "req",
      history: [],
      memories: [],
      budget: DEFAULT_CONTEXT_BUDGET,
    });

    assert.equal(result.historySummary, undefined);
    assert.deepEqual(result.history, []);
    assert.deepEqual(result.memories, []);
  });
});

describe("buildPromptSections — User Story 2 (corte determinístico sob tetos agressivos)", () => {
  it("budget.history menor que qualquer mensagem individual resulta em history vazio, sem lançar", () => {
    const result = buildPromptSections({
      systemPrompt: "sys",
      request: "req",
      history: history(3),
      memories: [],
      budget: { summary: 1000, history: 1, memory: 1000 },
    });

    assert.deepEqual(result.history, []);
  });

  it("budget.memory menor que qualquer memória individual resulta em memories vazio, sem lançar", () => {
    const result = buildPromptSections({
      systemPrompt: "sys",
      request: "req",
      history: [],
      memories: memories([1, 2, 3]),
      budget: { summary: 1000, history: 1000, memory: 1 },
    });

    assert.deepEqual(result.memories, []);
  });

  it("duas memórias com o mesmo score: a primeira do array de entrada é preservada quando só uma cabe", () => {
    const first: ScoredMemory = { fact: "primeira memoria de teste", score: 5 };
    const second: ScoredMemory = { fact: "segunda memoria de teste", score: 5 };
    const budget = estimateTokens(first.fact);

    const result = buildPromptSections({
      systemPrompt: "sys",
      request: "req",
      history: [],
      memories: [first, second],
      budget: { summary: 1000, history: 1000, memory: budget },
    });

    assert.deepEqual(result.memories, [first]);
  });

  it("é determinístico: mesma entrada e mesmo budget produzem sempre a mesma saída", () => {
    const input = {
      systemPrompt: "sys",
      request: "req",
      historySummary: "x".repeat(100),
      history: history(10),
      memories: memories([1, 5, 3, 9, 2]),
      budget: { summary: 20, history: 15, memory: 10 },
    };

    assert.deepEqual(buildPromptSections(input), buildPromptSections(input));
  });
});

describe("readBudgetFromEnv — User Story 3 (configuração via env)", () => {
  it("sem variáveis definidas, devolve DEFAULT_CONTEXT_BUDGET", () => {
    assert.deepEqual(readBudgetFromEnv({}), DEFAULT_CONTEXT_BUDGET);
  });

  it("com variáveis numéricas válidas, devolve exatamente esses valores", () => {
    const budget = readBudgetFromEnv({
      CONTEXT_BUDGET_SUMMARY: "50",
      CONTEXT_BUDGET_HISTORY: "100",
      CONTEXT_BUDGET_MEMORY: "20",
    });

    assert.deepEqual(budget, { summary: 50, history: 100, memory: 20 });
  });

  it("com valor inválido ou negativo, cai no default apenas para o campo afetado", () => {
    const budget = readBudgetFromEnv({
      CONTEXT_BUDGET_SUMMARY: "not-a-number",
      CONTEXT_BUDGET_HISTORY: "-5",
      CONTEXT_BUDGET_MEMORY: "42",
    });

    assert.deepEqual(budget, {
      summary: DEFAULT_CONTEXT_BUDGET.summary,
      history: DEFAULT_CONTEXT_BUDGET.history,
      memory: 42,
    });
  });
});
