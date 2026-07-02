import type { GraphState } from "../graph.ts";

import {
  getSystemPrompt,
  getUserPromptTemplate,
  IntentSchema,
} from "../../prompts/v1/identifyIntent.ts";
import {
  AppointmentService,
  professionals,
} from "../../services/appointmentService.ts";
import { OpenRouterService } from "../../services/openRouterService.ts";

export function createIdentifyIntentNode(
  llmClient: OpenRouterService,
  appointmentService: AppointmentService,
) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    console.log(`🔍 Identifying intent...`);
    const input = state.messages.at(-1)!.text;

    try {
      const systemPrompt = getSystemPrompt(professionals);
      const userPrompt = getUserPromptTemplate(input);

      const result = await llmClient.generateStructured(
        systemPrompt,
        userPrompt,
        IntentSchema,
      );

      if (!result.success) {
        console.error("Error identifying intent:", result.error);
        return {
          intent: "unknown",
          error: result.error,
        };
      }

      const intentData = result.data!;

      console.log("Intent identified: ", intentData);

      return {
        ...intentData,
      };
    } catch (error) {
      console.error("❌ Error in identifyIntent node:", error);
      return {
        ...state,
        intent: "unknown",
        error:
          error instanceof Error
            ? error.message
            : "Intent identification failed",
      };
    }
  };
}
