import { AIMessage } from "langchain";

import type { GraphState } from "../graph.ts";

import { OpenRouterService } from "../../services/openRouterService.ts";
import {
  getSystemPrompt,
  getUserPromptTemplate,
  MessageSchema,
} from "../../prompts/v1/messageGenerator.ts";

export function createMessageGeneratorNode(llmClient: OpenRouterService) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    console.log(`💬 Generating response message...`);

    try {
      const hasSucceded = state.actionSuccess ? "success" : "error";
      const scenario = `${state.intent ?? "unknown"}_${hasSucceded}`;
      const details = {
        professionalName: state.professionalName,
        datetime: state.datetime,
        patientName: state.patientName,
        error: state.error,
      };

      const systemPrompt = getSystemPrompt();
      const userPrompt = getUserPromptTemplate({ scenario, details });

      const result = await llmClient.generateStructured(
        systemPrompt,
        userPrompt,
        MessageSchema,
      );

      console.log(
        "Message generated: ",
        result.data?.message ?? result.data ?? result,
      );

      if (result.error) {
        console.error("❌ Error in messageGenerator node:", result.error);
        return {
          messages: [
            ...state.messages,
            new AIMessage(
              "Desculpe, não consegui gerar uma resposta. Tente novamente.",
            ),
          ],
        };
      }

      const message = result.data?.message ?? result.data ?? result;

      return {
        messages: [...state.messages, new AIMessage(message)],
      };
    } catch (error) {
      console.error("❌ Error in messageGenerator node:", error);
      return {
        messages: [
          ...state.messages,
          new AIMessage("An error occurred while processing your request."),
        ],
      };
    }
  };
}
