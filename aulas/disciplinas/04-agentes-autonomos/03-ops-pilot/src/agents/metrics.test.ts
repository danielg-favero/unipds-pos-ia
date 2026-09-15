import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LLMResult } from "@langchain/core/outputs";
import { AIMessage } from "@langchain/core/messages";

import { RunTracker } from "./metrics.js";

const ZERO_BREAKDOWN = { history: 0, memories: 0, systemPrompt: 0, request: 0 };

const chatGeneration = (inputTokens?: number) => ({
  text: "",
  message: new AIMessage({
    content: "resposta",
    usage_metadata:
      inputTokens === undefined
        ? undefined
        : { input_tokens: inputTokens, output_tokens: 0, total_tokens: inputTokens },
  }),
});

const llmResult = (inputTokens?: number): LLMResult => ({
  generations: [[chatGeneration(inputTokens)]],
});

describe("RunTracker — promptTokensReal (010)", () => {
  it("soma o uso real de duas chamadas simuladas via handleLLMEnd", () => {
    const tracker = new RunTracker();
    tracker.counter.handleLLMEnd?.(llmResult(50));
    tracker.counter.handleLLMEnd?.(llmResult(30));

    const snapshot = tracker.snapshot(ZERO_BREAKDOWN);
    assert.equal(snapshot.promptTokensReal, 80);
  });

  it("devolve promptTokensReal undefined quando nenhuma chamada reporta uso real", () => {
    const tracker = new RunTracker();
    tracker.counter.handleLLMEnd?.(llmResult(undefined));

    const snapshot = tracker.snapshot(ZERO_BREAKDOWN);
    assert.equal(snapshot.promptTokensReal, undefined);
  });

  it("sem nenhuma chamada, promptTokensReal é undefined e contextBreakdown é sempre devolvido (010, US3)", () => {
    const tracker = new RunTracker();
    const snapshot = tracker.snapshot(ZERO_BREAKDOWN);
    assert.equal(snapshot.promptTokensReal, undefined);
    assert.deepEqual(snapshot.contextBreakdown, ZERO_BREAKDOWN);
    assert.equal(snapshot.llmCalls, 0);
  });
});

describe("RunTracker — robustez quando o provedor não reporta uso (010, US3)", () => {
  it("um handleLLMEnd sem usage_metadata nunca lança, e o snapshot continua completo", () => {
    const tracker = new RunTracker(3);
    assert.doesNotThrow(() => tracker.counter.handleLLMEnd?.(llmResult(undefined)));

    const snapshot = tracker.snapshot(ZERO_BREAKDOWN);
    assert.equal(snapshot.llmCalls, 0);
    assert.equal(snapshot.historyMessages, 3);
    assert.equal(snapshot.promptTokensReal, undefined);
    assert.deepEqual(snapshot.contextBreakdown, ZERO_BREAKDOWN);
  });
});
