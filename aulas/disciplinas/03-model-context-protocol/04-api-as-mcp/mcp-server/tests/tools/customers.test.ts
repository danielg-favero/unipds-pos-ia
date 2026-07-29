import { describe, it, after, before } from "node:test";
import assert from "node:assert";
import { type Client } from "@modelcontextprotocol/sdk/client";

import {
  type CustomerMutation,
  type Customer,
  type CustomerUpdate,
} from "../../src/domain/customer.ts";
import { createTestClient } from "../helpers.ts";

type CustomersResult = {
  structuredContent: { customers: Customer[] };
};

type CustomerResult = {
  structuredContent: { customer: Customer };
};

type CreateMutationResult = {
  structuredContent: CustomerMutation;
};

describe("Customer MCP Suite", () => {
  let client: Client;

  before(async () => {
    client = await createTestClient();
  });

  after(async () => {
    await client.close();
  });

  it("Should list all customers", async () => {
    const result = (await client.callTool({
      name: "list_customers",
      arguments: {},
    })) as unknown as CustomersResult;

    assert.ok(
      Array.isArray(result.structuredContent.customers),
      "Should return an array of customers",
    );
  });

  it("Should create a customer", async () => {
    const customer = {
      name: "Teste",
      phone: "(99) 99999-9999",
    };
    const result = (await client.callTool({
      name: "create_customer",
      arguments: customer,
    })) as unknown as CreateMutationResult;

    assert.ok(result.structuredContent.id, "Should contain id");
    assert.strictEqual(
      result.structuredContent.message,
      `user ${customer.name} created!`,
      "Should contain success message",
    );
  });

  it("Should get a customer", async () => {
    const customer = {
      name: "Teste",
      phone: "(99) 99999-9999",
    };

    await client.callTool({
      name: "create_customer",
      arguments: customer,
    });

    const result = (await client.callTool({
      name: "get_customer",
      arguments: {
        name: customer.name,
      },
    })) as unknown as CustomerResult;

    assert.deepStrictEqual(
      result.structuredContent.customer.name,
      customer.name,
    );
  });

  it("Should update a customer", async () => {
    const customer = {
      name: "Teste",
      phone: "(99) 99999-9999",
    };

    const {
      structuredContent: { id },
    } = (await client.callTool({
      name: "create_customer",
      arguments: customer,
    })) as unknown as CreateMutationResult;

    const result = (await client.callTool({
      name: "update_customer",
      arguments: {
        name: "Teste Update",
        phone: "(88) 88888-8888",
        _id: id,
      } as CustomerUpdate,
    })) as unknown as CreateMutationResult;

    assert.ok(
      result.structuredContent.message,
      "Should contain success message",
    );

    assert.strictEqual(result.structuredContent.id, id);
  });

  it("Should delete a customer", async () => {
    const customer = {
      name: "Teste",
      phone: "(99) 99999-9999",
    };

    const {
      structuredContent: { id },
    } = (await client.callTool({
      name: "create_customer",
      arguments: customer,
    })) as unknown as CreateMutationResult;

    const result = (await client.callTool({
      name: "delete_customer",
      arguments: {
        _id: id,
      },
    })) as unknown as CreateMutationResult;

    assert.ok(
      result.structuredContent.message,
      "Should contain success message",
    );

    assert.strictEqual(result.structuredContent.id, id);
  });
});
