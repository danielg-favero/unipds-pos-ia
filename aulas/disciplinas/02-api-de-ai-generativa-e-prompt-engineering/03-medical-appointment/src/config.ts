export type ModelConfig = {
  apiKey: string;
  httpReferer: string;
  xTitle: string;

  provider: {
    sort: {
      by: string;
      partition: string;
    };
  };

  models: string[];
  temperature: number;
};

console.assert(
  process.env.OPENROUTER_API_KEY,
  "OPENROUTER_API_KEY is not set in environment variables",
);

export const config: ModelConfig = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  httpReferer: "",
  xTitle: "IA Devs - Prompt Chaining Article Generator",
  models: [
    // "openai/gpt-oss-20b:free"
    "nvidia/nemotron-nano-9b-v2:free",
  ],
  provider: {
    sort: {
      by: "throughput", // Route to model with highest throughput (fastest response)
      partition: "none",
    },
  },
  temperature: 0.7,
};
