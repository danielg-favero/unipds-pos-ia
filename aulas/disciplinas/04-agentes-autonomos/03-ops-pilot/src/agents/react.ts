import type { BaseMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

import { describeProviderError } from "./provider-errors.js";
import type { ReasoningStrategy, StrategyInput, StrategyRun } from "../domain/strategy.js";
import { finishRun } from "../domain/strategy.js";
import { toTrace } from "./from-messages.js";
import { RunTracker } from "./metrics.js";
import { createModel } from "./model.js";
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
    const tracker = new RunTracker(history.length);

    const memoryTools =
      input.memoryStore && input.userId ? makeMemoryTools(input.memoryStore, input.userId) : [];

    const agent = createReactAgent({
      llm: createModel(),
      tools: [...makeTools(input.store), ...memoryTools],
      prompt: SYSTEM_PROMPT,
      version: "v2",
    });

    // Acumulado fora do try: se o limite estourar, o trace parcial sobrevive.
    let messages: BaseMessage[] = [];
    // Memórias e histórico entram como mensagens iniciais para dar contexto ao
    // modelo, mas ficam fora do trace: só a troca da requisição atual é reportada.
    const memoryMessage =
      memories.length === 0
        ? []
        : [
            {
              role: "system",
              content: `Fatos memorizados sobre este usuário:\n${memories.map((fact) => `- ${fact}`).join("\n")}`,
            },
          ];
    const initialMessages = [
      ...memoryMessage,
      ...history.map((message) => ({ role: message.role, content: message.content })),
      { role: "user", content: input.request },
    ];
    const offset = memoryMessage.length + history.length;

    try {
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

      const { events, answer } = toTrace(messages.slice(offset));
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
        toTrace(messages.slice(offset)).events,
        `Execução interrompida: ${describeProviderError(error)}`,
        true,
        tracker.snapshot(),
      );
    }
  },
};
