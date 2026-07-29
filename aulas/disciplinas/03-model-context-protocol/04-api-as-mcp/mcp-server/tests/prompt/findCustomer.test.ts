import { describe, it, after, before } from "node:test";
import assert from "node:assert";
import { type Client } from "@modelcontextprotocol/sdk/client";

import {
  type CustomerMutation,
  type Customer,
} from "../../src/domain/customer.ts";
import { createTestClient } from "../helpers.ts";

describe("Customer Prompts", () => {
  let client: Client;

  before(async () => {
    client = await createTestClient();
  });

  after(async () => {
    await client.close();
  });

  it("Should return the find_customer_prompt", async () => {
    const result = await client.getPrompt({
      name: "find_customer_prompt",
      arguments: { name: "Teste" },
    });

    const text = result.messages[0].content;
    assert.ok(
      "text" in text && text.text.includes("get_customer"),
      "Prompt should reference the get_customer tool",
    );
    assert.ok(
      "text" in text && text.text.includes("Teste"),
      "Prompt should include de search params",
    );
  });
});
