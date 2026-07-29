import { describe, it, after, before } from "node:test";
import assert from "node:assert";
import { type Client } from "@modelcontextprotocol/sdk/client";

import { createTestClient } from "../helpers.ts";

describe("Customer Rosources", () => {
  let client: Client;

  before(async () => {
    client = await createTestClient();
  });

  after(async () => {
    await client.close();
  });

  it("Should list the customers://api-info resources", async () => {
    const { resources } = await client.listResources();

    const info = resources.find((r) => r.uri === "customers://api-info");

    assert.ok(info, "Should exists customers://api-info");

    assert.deepStrictEqual(
      info.description,
      "Describes the customers rest API that this MCP server wraps",
      "Description should be correct",
    );
  });
});
