import { ChatOpenAI } from "@langchain/openai";
import {
  createAgent,
  HumanMessage,
  providerStrategy,
  SystemMessage,
} from "langchain";
import { z } from "zod/v3";

import { config, type ModelConfig } from "../config.ts";

export class OpenRouterService {
  private config: ModelConfig;
  private llmModel: ChatOpenAI;

  constructor(configOverride?: ModelConfig) {
    this.config = configOverride ?? config;

    this.llmModel = new ChatOpenAI({
      apiKey: this.config.apiKey,
      model: this.config.models.at(0),
      temperature: this.config.temperature,
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": this.config.httpReferer,
          "X-Title": this.config.xTitle,
        },
      },
      modelKwargs: {
        models: this.config.models,
        provider: this.config.provider,
      },
    });
  }

  async generateStructured<T>(
    systemPrompt: string,
    userPrompt: string,
    outputSchema: z.ZodSchema<T>,
  ) {
    try {
      // Aqui é preciso utilizar um modelo que suporte Json estruturado
      const agent = createAgent({
        model: this.llmModel,
        tools: [],
        responseFormat: providerStrategy(outputSchema),
      });

      const messages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];

      const data = await agent.invoke({ messages });
      return {
        success: true,
        data: data.structuredResponse,
      };
    } catch (error) {
      console.error("Error in generateStructured:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
