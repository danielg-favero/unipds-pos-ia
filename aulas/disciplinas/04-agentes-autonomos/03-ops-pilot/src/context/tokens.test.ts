import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LLMResult } from "@langchain/core/outputs";
import { AIMessage } from "@langchain/core/messages";

import type { ConversationMessage } from "../store/conversation-port.js";
import { buildContextBreakdown, estimateTokens, extractPromptTokens } from "./tokens.js";

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

describe("extractPromptTokens", () => {
  it("soma usage_metadata.input_tokens de uma única generation", () => {
    const output: LLMResult = { generations: [[chatGeneration(120)]] };
    assert.equal(extractPromptTokens(output), 120);
  });

  it("soma usage_metadata.input_tokens de múltiplas generations/chamadas", () => {
    const output: LLMResult = {
      generations: [[chatGeneration(50)], [chatGeneration(30)]],
    };
    assert.equal(extractPromptTokens(output), 80);
  });

  it("devolve undefined quando nenhuma generation tem usage_metadata", () => {
    const output: LLMResult = { generations: [[chatGeneration(undefined)]] };
    assert.equal(extractPromptTokens(output), undefined);
  });

  it("devolve undefined para um LLMResult sem generations", () => {
    const output: LLMResult = { generations: [] };
    assert.equal(extractPromptTokens(output), undefined);
  });
});

describe("estimateTokens", () => {
  it("de uma string vazia é 0", () => {
    assert.equal(estimateTokens(""), 0);
  });

  it("é Math.ceil(N/4) para um texto de N caracteres", () => {
    assert.equal(estimateTokens("a".repeat(8)), 2);
    assert.equal(estimateTokens("a".repeat(9)), 3);
  });
});

describe("buildContextBreakdown", () => {
  it("com histórico e memórias vazios devolve 0 para essas fontes, sem erro", () => {
    const breakdown = buildContextBreakdown({
      history: [],
      memories: [],
      systemPrompt: "instruções fixas",
      request: "pedido atual",
    });
    assert.equal(breakdown.history, 0);
    assert.equal(breakdown.memories, 0);
    assert.equal(breakdown.systemPrompt, estimateTokens("instruções fixas"));
    assert.equal(breakdown.request, estimateTokens("pedido atual"));
  });

  it("com fontes populadas, estima cada uma somando os itens de história/memórias", () => {
    const history: readonly ConversationMessage[] = [
      { role: "user", content: "mensagem um" },
      { role: "assistant", content: "resposta um" },
    ];
    const memories = ["prefere respostas curtas", "trabalha de manhã"];

    const breakdown = buildContextBreakdown({
      history,
      memories,
      systemPrompt: "instruções fixas do assistente",
      request: "pedido atual do usuário",
    });

    assert.equal(
      breakdown.history,
      estimateTokens("mensagem um") + estimateTokens("resposta um"),
    );
    assert.equal(
      breakdown.memories,
      estimateTokens("prefere respostas curtas") + estimateTokens("trabalha de manhã"),
    );
    assert.equal(breakdown.systemPrompt, estimateTokens("instruções fixas do assistente"));
    assert.equal(breakdown.request, estimateTokens("pedido atual do usuário"));
  });
});
