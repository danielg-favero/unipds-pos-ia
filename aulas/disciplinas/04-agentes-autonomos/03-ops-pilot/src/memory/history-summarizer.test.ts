import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { estimateTokens } from "../context/tokens.js";
import { MemoryConversationStore } from "../store/memory-conversation.js";
import { MemoryConversationSummaryStore } from "../store/memory-conversation-summary.js";
import {
  HISTORY_SUMMARY_SYSTEM_PROMPT,
  type HistorySummarizerFn,
  nextBatchToSummarize,
  updateHistorySummary,
} from "./history-summarizer.js";

const fillConversation = async (
  conversationStore: MemoryConversationStore,
  conversationId: string,
  count: number,
): Promise<void> => {
  for (let i = 1; i <= count; i += 1) {
    await conversationStore.append(conversationId, { role: "user", content: `mensagem ${i}` });
  }
};

describe("nextBatchToSummarize", () => {
  it("devolve undefined para totais de 0 a 15 mensagens (nenhum lote completo saiu)", () => {
    for (let total = 0; total <= 15; total += 1) {
      assert.equal(nextBatchToSummarize(total, 0), undefined, `total=${total}`);
    }
  });

  it("devolve o primeiro lote na 16ª mensagem", () => {
    assert.deepEqual(nextBatchToSummarize(16, 0), { start: 0, end: 8 });
  });

  it("não devolve novo lote entre 17 e 23 mensagens, já com summarizedThrough=8", () => {
    for (let total = 17; total <= 23; total += 1) {
      assert.equal(nextBatchToSummarize(total, 8), undefined, `total=${total}`);
    }
  });

  it("devolve o segundo lote na 24ª mensagem", () => {
    assert.deepEqual(nextBatchToSummarize(24, 8), { start: 8, end: 16 });
  });
});

describe("updateHistorySummary (US1) — sem resumo anterior", () => {
  it("sumariza o primeiro lote de 8 e persiste com summarizedThrough=8", async () => {
    const conversationStore = new MemoryConversationStore();
    const summaryStore = new MemoryConversationSummaryStore();
    const conversationId = "conv-1";
    await fillConversation(conversationStore, conversationId, 16);

    const fake: HistorySummarizerFn = async (input) => {
      assert.equal(input.previousSummary, "");
      assert.equal(input.messages.length, 8);
      assert.equal(input.messages[0]?.content, "mensagem 1");
      return "resumo do primeiro lote";
    };

    await updateHistorySummary({ conversationId, conversationStore, summaryStore }, fake);

    assert.deepEqual(await summaryStore.get(conversationId), {
      summary: "resumo do primeiro lote",
      summarizedThrough: 8,
    });
  });

  it("conversa com 8 ou menos mensagens não cria linha de resumo (FR-009)", async () => {
    const conversationStore = new MemoryConversationStore();
    const summaryStore = new MemoryConversationSummaryStore();
    const conversationId = "conv-curta";
    await fillConversation(conversationStore, conversationId, 8);

    await updateHistorySummary(
      { conversationId, conversationStore, summaryStore },
      async () => {
        throw new Error("não deveria ser chamado");
      },
    );

    assert.equal(await summaryStore.get(conversationId), undefined);
  });
});

describe("updateHistorySummary (US1) — mesclagem com resumo anterior", () => {
  it("passa o resumo anterior ao resumidor e persiste o resultado mesclado", async () => {
    const conversationStore = new MemoryConversationStore();
    const summaryStore = new MemoryConversationSummaryStore();
    const conversationId = "conv-2";
    await summaryStore.save(conversationId, { summary: "resumo antigo", summarizedThrough: 8 });
    await fillConversation(conversationStore, conversationId, 24);

    const fake: HistorySummarizerFn = async (input) => {
      assert.equal(input.previousSummary, "resumo antigo");
      assert.equal(input.messages[0]?.content, "mensagem 9");
      return `${input.previousSummary} + lote novo`;
    };

    await updateHistorySummary({ conversationId, conversationStore, summaryStore }, fake);

    assert.deepEqual(await summaryStore.get(conversationId), {
      summary: "resumo antigo + lote novo",
      summarizedThrough: 16,
    });
  });
});

describe("updateHistorySummary (US2) — não refeito a cada request", () => {
  it("não chama o resumidor entre 17 e 23 mensagens, com summarizedThrough=8", async () => {
    const conversationStore = new MemoryConversationStore();
    const summaryStore = new MemoryConversationSummaryStore();
    const conversationId = "conv-3";
    await summaryStore.save(conversationId, { summary: "resumo", summarizedThrough: 8 });

    let calls = 0;
    const fake: HistorySummarizerFn = async () => {
      calls += 1;
      return "não deveria acontecer";
    };

    for (let total = 17; total <= 23; total += 1) {
      await fillConversation(conversationStore, conversationId, 1);
      await updateHistorySummary({ conversationId, conversationStore, summaryStore }, fake);
    }

    assert.equal(calls, 0);
    assert.deepEqual(await summaryStore.get(conversationId), {
      summary: "resumo",
      summarizedThrough: 8,
    });
  });

  it("registra o evento summarize exatamente uma vez por lote processado", async () => {
    const conversationStore = new MemoryConversationStore();
    const summaryStore = new MemoryConversationSummaryStore();
    const conversationId = "conv-4";
    await fillConversation(conversationStore, conversationId, 16);

    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (msg: string) => logs.push(msg);
    try {
      await updateHistorySummary(
        { conversationId, conversationStore, summaryStore },
        async () => "resumo",
      );
      // Mais uma chamada sem lote completo: não deve logar de novo.
      await fillConversation(conversationStore, conversationId, 1);
      await updateHistorySummary(
        { conversationId, conversationStore, summaryStore },
        async () => "resumo",
      );
    } finally {
      console.log = originalLog;
    }

    const summarizeLogs = logs
      .map((line) => JSON.parse(line) as { event: string; outcome?: string; summarizedThrough?: number })
      .filter((entry) => entry.event === "summarize");
    assert.equal(summarizeLogs.length, 1);
    assert.equal(summarizeLogs[0]?.outcome, "ok");
    assert.equal(summarizeLogs[0]?.summarizedThrough, 8);
  });

  it("quando o resumidor falha, summarizedThrough não avança e a próxima chamada tenta de novo (FR-010)", async () => {
    const conversationStore = new MemoryConversationStore();
    const summaryStore = new MemoryConversationSummaryStore();
    const conversationId = "conv-5";
    await fillConversation(conversationStore, conversationId, 16);

    let calls = 0;
    const flaky: HistorySummarizerFn = async () => {
      calls += 1;
      if (calls === 1) throw new Error("provedor indisponível");
      return "resumo na segunda tentativa";
    };

    await updateHistorySummary({ conversationId, conversationStore, summaryStore }, flaky);
    assert.equal(await summaryStore.get(conversationId), undefined);

    await updateHistorySummary({ conversationId, conversationStore, summaryStore }, flaky);
    assert.deepEqual(await summaryStore.get(conversationId), {
      summary: "resumo na segunda tentativa",
      summarizedThrough: 8,
    });
    assert.equal(calls, 2);
  });
});

describe("updateHistorySummary (US3) — tamanho compacto do resumo", () => {
  it("um resumo simulando ~150 tokens fica dentro da faixa esperada (150 ± 30%)", async () => {
    const conversationStore = new MemoryConversationStore();
    const summaryStore = new MemoryConversationSummaryStore();
    const conversationId = "conv-6";
    await fillConversation(conversationStore, conversationId, 16);

    const decisao = "Decisão: usar SQLite via node:sqlite para persistência.";
    const fato = "Fato: a conversa já tinha 8 mensagens antes deste lote.";
    const pendencia = "Pendência: confirmar o comportamento em caso de falha do resumidor.";
    const fakeSummary = `${decisao} ${fato} ${pendencia}`.repeat(3);

    await updateHistorySummary(
      { conversationId, conversationStore, summaryStore },
      async () => fakeSummary,
    );

    const persisted = await summaryStore.get(conversationId);
    assert.ok(persisted);
    const tokens = estimateTokens(persisted.summary);
    assert.ok(tokens >= 105 && tokens <= 195, `esperado ~150 tokens (±30%), obtido ${tokens}`);
    assert.ok(persisted.summary.includes("Decisão"));
    assert.ok(persisted.summary.includes("Fato"));
    assert.ok(persisted.summary.includes("Pendência"));
  });

  it("o prompt do resumidor real instrui compressão ao mesclar, não concatenação", () => {
    // Teste de contrato do prompt (não de qualidade de LLM real): garante que o texto do
    // system prompt usado por defaultHistorySummarizer menciona tamanho alvo e compressão.
    assert.match(HISTORY_SUMMARY_SYSTEM_PROMPT, /150 tokens/);
    assert.match(HISTORY_SUMMARY_SYSTEM_PROMPT, /comprima/i);
  });
});
