import test from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../src/server.ts";
import { CONFIG } from "../src/config.ts";
import {
  type LLMResponse,
  OpenRouterService,
} from "../src/openrouter-service.ts";

console.assert(
  process.env.OPENROUTER_API_KEY,
  "OPENROUTER_API_KEY is not defined in env file",
);

test.todo("Routes to cheapest model by default", async () => {
  const customConfig = {
    ...CONFIG,
    provider: {
      ...CONFIG.provider,
      sort: {
        ...CONFIG.provider.sort,
        by: "price",
      },
    },
  };

  const routerService = new OpenRouterService(customConfig);
  const app = createServer(routerService);

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    body: {
      question: "Hello",
    },
  });

  assert.equal(response.statusCode, 200);

  const body = (await response.json()) as LLMResponse;

  assert.equal(body.model, "cohere/north-mini-code-20260617:free");
});

test.todo("Routes to highest throughput model by default", async () => {
  const customConfig = {
    ...CONFIG,
    provider: {
      ...CONFIG.provider,
      sort: {
        ...CONFIG.provider.sort,
        by: "throughput",
      },
    },
  };

  const routerService = new OpenRouterService(customConfig);
  const app = createServer(routerService);

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    body: {
      question: "Hello",
    },
  });

  assert.equal(response.statusCode, 200);

  const body = (await response.json()) as LLMResponse;

  assert.equal(body.model, "cohere/north-mini-code-20260617:free");
});
