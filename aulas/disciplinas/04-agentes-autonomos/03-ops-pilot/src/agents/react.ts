import type { BaseMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { describeProviderError } from "./provider-errors.js";
import type { ReasoningStrategy, StrategyInput, StrategyRun } from "../domain/strategy.js";
import { finishRun } from "../domain/strategy.js";
import { toTrace } from "./from-messages.js";
import { RunTracker } from "./metrics.js";
import { createModel } from "./model.js";
import { makeTools } from "./tools.js";

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
    const tracker = new RunTracker();

    const agent = createReactAgent({
      llm: createModel(),
      tools: makeTools(input.store),
      prompt: SYSTEM_PROMPT,
      version: "v2",
    });

    // Acumulado fora do try: se o limite estourar, o trace parcial sobrevive.
    let messages: BaseMessage[] = [];

    try {
      const stream = await agent.stream(
        { messages: [{ role: "user", content: input.request }] },
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

      const { events, answer } = toTrace(messages);
      const concluded = answer !== "";

      return finishRun(
        events,
        concluded
          ? answer
          : `Limite de ${input.maxIterations} iterações atingido antes de concluir.`,
        !concluded,
        tracker.snapshot(),
      );
    } catch (error) {
      // Estouro de limite ou falha do provedor viram resposta parcial com o
      // trace e as métricas acumulados — `run` nunca rejeita (obrigação S2).
      return finishRun(
        toTrace(messages).events,
        `Execução interrompida: ${describeProviderError(error)}`,
        true,
        tracker.snapshot(),
      );
    }
  },
};
