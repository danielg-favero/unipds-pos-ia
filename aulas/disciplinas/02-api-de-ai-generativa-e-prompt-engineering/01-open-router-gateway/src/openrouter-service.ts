import { OpenRouter } from "@openrouter/sdk";
import { type ChatGenerationParams } from "@openrouter/sdk/models";

import { CONFIG, type ModelConfig } from "./config.ts";

export type LLMResponse = {
  model: string;
  content: string;
};

export class OpenRouterService {
  private config: ModelConfig;
  private client: OpenRouter;

  constructor(configOverride?: ModelConfig) {
    this.config = configOverride || CONFIG;
    this.client = new OpenRouter({
      apiKey: this.config.apiKey,
      httpReferer: this.config.httpRefer,
      xTitle: this.config.xTitle,
    });
  }

  async generate(prompt: string): Promise<LLMResponse> {
    const response = await this.client.chat.send({
      models: this.config.models,
      messages: [
        {
          role: "system",
          content: this.config.systemPrompt,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      stream: false,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      provider: this.config.provider as ChatGenerationParams["provider"],
    });

    const content = String(response.choices.at(0)?.message.content) ?? "";

    return {
      model: response.model,
      content,
    };
  }
}
