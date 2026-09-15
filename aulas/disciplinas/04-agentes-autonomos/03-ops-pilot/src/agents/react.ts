import type { BaseMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { describeProviderError } from "./provider-errors.js";
import { buildPromptSections } from "../context/context-builder.js";
import { buildContextBreakdown } from "../context/tokens.js";
import type { ReasoningStrategy, StrategyInput, StrategyRun, TraceEvent } from "../domain/strategy.js";
import { finishRun } from "../domain/strategy.js";
import { toTrace } from "./from-messages.js";
import { RunTracker } from "./metrics.js";
import { createModelNamed, getModelPlan, withModelResilience } from "./model.js";
import { makeMemoryTools, makeTools } from "./tools.js";

const SYSTEM_PROMPT = [
  "Você é o OpsPilot, copiloto de plantão de produção.",
  "Responda em português, de forma direta e verificável.",
  "Use as ferramentas para consultar e alterar o estado — nunca invente alertas, serviços ou incidentes.",
  "Se uma ferramenta devolver erro, explique o problema em vez de tentar contorná-lo com dados fictícios.",
].join(" ");

/**
 * Um ciclo ReAct consome dois supersteps do grafo (agente + tools), por isso o
 * recursionLimit é o dobro do limite de iterações, mais o passo final.
 */
export const recursionLimitFor = (maxIterations: number): number => maxIterations * 2 + 1;

export const reactStrategy: ReasoningStrategy = {
  name: "react",

  async run(input: StrategyInput): Promise<StrategyRun> {
    const history = input.history ?? [];
    const memories = input.memories ?? [];
    const historySummary = input.historySummary;
    const tracker = new RunTracker(history.length);

    const memoryTools =
      input.memoryStore && input.userId ? makeMemoryTools(input.memoryStore, input.userId) : [];
    const tools = [...makeTools(input.store), ...memoryTools];
    const plan = getModelPlan();

    // Acumulado fora do try: se o limite estourar, o trace parcial sobrevive.
    let messages: BaseMessage[] = [];
    // `memories` já vem ordenada por relevância decrescente (memory-store.ts `recall`);
    // um score sintético por posição preserva essa ordem para o corte por orçamento (FR-007).
    const scoredMemories = memories.map((fact, i) => ({ fact, score: memories.length - i }));
    const sections = buildPromptSections({
      systemPrompt: SYSTEM_PROMPT,
      request: input.request,
      historySummary,
      history,
      memories: scoredMemories,
    });

    // Memórias e histórico entram como mensagens iniciais para dar contexto ao
    // modelo, mas ficam fora do trace: só a troca da requisição atual é reportada.
    const memoryMessage =
      sections.memories.length === 0
        ? []
        : [
            {
              role: "system",
              content: `Fatos memorizados sobre este usuário:\n${sections.memories.map((m) => `- ${m.fact}`).join("\n")}`,
            },
          ];
    const summaryMessage =
      sections.historySummary === undefined || sections.historySummary.length === 0
        ? []
        : [
            {
              role: "system",
              content: `Resumo do início desta conversa (mensagens mais antigas, já fora do histórico recente):\n${sections.historySummary}`,
            },
          ];
    const initialMessages = [
      ...summaryMessage,
      ...memoryMessage,
      ...sections.history.map((message) => ({ role: message.role, content: message.content })),
      { role: "user", content: input.request },
    ];
    const offset = summaryMessage.length + memoryMessage.length + sections.history.length;
    const contextBreakdown = buildContextBreakdown({
      history,
      memories,
      systemPrompt: SYSTEM_PROMPT,
      request: input.request,
    });

    async function attempt(model: string): Promise<void> {
      const agent = createReactAgent({
        llm: createModelNamed(model, plan.apiKey),
        tools,
        prompt: SYSTEM_PROMPT,
        version: "v2",
      });
      const stream = await agent.stream(
        { messages: initialMessages },
        {
          streamMode: "values",
          // Guardrail: nada de loop infinito.
          recursionLimit: recursionLimitFor(input.maxIterations),
          callbacks: [tracker.counter],
        },
      );

      for await (const state of stream) {
        messages = state.messages;
      }
    }

    try {
      const { modelUsed, usedFallback } = await withModelResilience(plan, attempt);
      const { events, answer } = toTrace(messages.slice(offset));
      const concluded = answer !== "";

      // Emitido apenas quando o primário se esgotou e a reserva assumiu (014, FR-004).
      const fallbackEvents: TraceEvent[] = usedFallback
        ? [
            {
              type: "fallback",
              primaryModel: plan.primaryModel,
              fallbackModel: modelUsed,
              reason: "modelo primário esgotou as tentativas de repetição",
            },
          ]
        : [];

      return finishRun(
        [...fallbackEvents, ...events],
        concluded
          ? answer
          : `Limite de ${input.maxIterations} iterações atingido antes de concluir.`,
        !concluded,
        tracker.snapshot(contextBreakdown, modelUsed),
      );
    } catch (error) {
      // Estouro de limite ou falha do provedor viram resposta parcial com o
      // trace e as métricas acumulados — `run` nunca rejeita (obrigação S2).
      return finishRun(
        toTrace(messages.slice(offset)).events,
        `Execução interrompida: ${describeProviderError(error)}`,
        true,
        tracker.snapshot(contextBreakdown),
      );
    }
  },
};
