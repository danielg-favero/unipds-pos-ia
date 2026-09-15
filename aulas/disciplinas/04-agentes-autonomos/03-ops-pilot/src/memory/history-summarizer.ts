import { z } from "zod";

import { createModel } from "../agents/model.js";
import type { ConversationMessage, ConversationStore } from "../store/conversation-port.js";
import type { ConversationSummaryStore } from "../store/conversation-summary-port.js";

const BATCH_SIZE = 8;

/**
 * Pura: decide se um novo lote de 8 mensagens já saiu da janela recente de 8 desde a última
 * sumarização. `totalMessages - BATCH_SIZE` é quantas mensagens já saíram (ou estão saindo) da
 * janela recente; comparar com `summarizedThrough` garante que só disparamos a cada lote
 * *completo* de 8, nunca a cada mensagem (FR-005, research.md §1).
 */
export function nextBatchToSummarize(
  totalMessages: number,
  summarizedThrough: number,
): { readonly start: number; readonly end: number } | undefined {
  const outsideWindow = totalMessages - BATCH_SIZE;
  if (outsideWindow - summarizedThrough < BATCH_SIZE) return undefined;
  return { start: summarizedThrough, end: summarizedThrough + BATCH_SIZE };
}

export const historySummarySchema = z.object({ summary: z.string().min(1) });

export type SummarizeBatchInput = {
  /** "" quando não havia resumo anterior. */
  readonly previousSummary: string;
  /** Lote de 8 mensagens, em ordem cronológica. */
  readonly messages: readonly ConversationMessage[];
};

/** Nunca lança: falha do modelo/provedor deve virar exceção capturada por `updateHistorySummary`. */
export type HistorySummarizerFn = (input: SummarizeBatchInput) => Promise<string>;

export const HISTORY_SUMMARY_SYSTEM_PROMPT = [
  "Você é o sumarizador de histórico do OpsPilot.",
  "Receberá um lote de mensagens de uma conversa que já saiu da janela recente, e o resumo",
  "acumulado até agora (pode estar vazio, se for o primeiro lote).",
  "Produza um único resumo, em português, com aproximadamente 150 tokens (~600 caracteres),",
  "mesclando o conteúdo do resumo anterior com o novo lote — nunca apenas concatenando os dois.",
  "Priorize preservar decisões tomadas, fatos relevantes e pendências em aberto.",
  "Ao mesclar, comprima o que for redundante ou de baixo valor para manter o tamanho alvo, mesmo",
  "que isso signifique perder detalhes menos importantes do resumo anterior.",
].join(" ");

const formatBatch = (messages: readonly ConversationMessage[]): string =>
  messages.map((message) => `${message.role}: ${message.content}`).join("\n");

/**
 * Sumarizador real: uma chamada estruturada (`withStructuredOutput`), mesmo padrão de
 * `defaultLearningReflector` em `src/memory/learning-reflector.ts`. Não trata erros — quem
 * embrulha (`updateHistorySummary`) absorve falhas.
 */
export const defaultHistorySummarizer: HistorySummarizerFn = async (input) => {
  const raw = await createModel()
    .withStructuredOutput(historySummarySchema)
    .invoke([
      ["system", HISTORY_SUMMARY_SYSTEM_PROMPT],
      [
        "user",
        `Resumo anterior: ${input.previousSummary || "(nenhum)"}\n\nNovo lote de mensagens:\n${formatBatch(input.messages)}`,
      ],
    ]);
  return historySummarySchema.parse(raw).summary;
};

export type UpdateHistorySummaryInput = {
  readonly conversationId: string;
  readonly conversationStore: ConversationStore;
  readonly summaryStore: ConversationSummaryStore;
};

/**
 * Orquestra a sumarização de histórico de uma conversa: lê o total de mensagens e o resumo atual,
 * decide via `nextBatchToSummarize` se um lote completo de 8 já saiu da janela recente, busca
 * esse lote, chama o `summarizerFn`, persiste o resultado mesclado e loga o evento "summarize".
 * Nunca lança (FR-010): falhas deixam `summarizedThrough` inalterado, e a próxima chamada tenta
 * de novo. Pensada para ser chamada sem `await` a partir do `/chat` (fire-and-forget), mesmo
 * padrão de `reflectLearning`.
 */
export async function updateHistorySummary(
  input: UpdateHistorySummaryInput,
  summarizerFn: HistorySummarizerFn = defaultHistorySummarizer,
): Promise<void> {
  const { conversationId, conversationStore, summaryStore } = input;
  try {
    const [totalMessages, current] = await Promise.all([
      conversationStore.countMessages(conversationId),
      summaryStore.get(conversationId),
    ]);
    const summarizedThrough = current?.summarizedThrough ?? 0;
    const batch = nextBatchToSummarize(totalMessages, summarizedThrough);
    if (batch === undefined) return;

    const messages = await conversationStore.messagesRange(conversationId, batch.start, batch.end);
    const summary = await summarizerFn({
      previousSummary: current?.summary ?? "",
      messages,
    });

    await summaryStore.save(conversationId, { summary, summarizedThrough: batch.end });
    console.log(
      JSON.stringify({
        event: "summarize",
        conversationId,
        summarizedThrough: batch.end,
        outcome: "ok",
      }),
    );
  } catch {
    console.log(
      JSON.stringify({ event: "summarize", conversationId, outcome: "error" }),
    );
    // Falha do provedor, saída malformada ou erro de store: nada sumarizado nesta vez (FR-010) —
    // summarizedThrough não avança, a próxima chamada tenta de novo o mesmo lote.
  }
}
