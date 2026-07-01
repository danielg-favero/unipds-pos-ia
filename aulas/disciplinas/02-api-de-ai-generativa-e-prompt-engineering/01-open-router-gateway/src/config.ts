console.assert(
  process.env.OPENROUTER_API_KEY,
  "OPENROUTER_API_KEY is not defined in env file",
);

export type ModelConfig = {
  apiKey: string;
  httpRefer: string;
  xTitle: string;
  port: number;
  models: Array<string>;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;

  provider: {
    sort: {
      by: string;
      partition: string;
    };
  };
};

export const CONFIG: ModelConfig = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  httpRefer: "http://pos-ai.com",
  xTitle: "OpenRouterGateway",
  port: 3000,
  models: [
    // O openrouter vai mudar o modelo com base na config de ordenação
    "cohere/north-mini-code:free",
  ],
  temperature: 0.2,
  maxTokens: 50,
  systemPrompt: "You are a helpful assistent.",
  provider: {
    sort: {
      // Os modelos podem ser ordenados por price, latency e throughput
      by: "price",
      partition: "none",
    },
  },
};
