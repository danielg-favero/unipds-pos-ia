import { describe, it, after, before } from "node:test";
import assert from "node:assert";
import { Client } from "@modelcontextprotocol/sdk/client";

import { createTestClient } from "./helpers.ts";

async function encryptMessage(
  client: Client,
  message: string,
  encryptionKey: string,
) {
  return (await client.callTool({
    name: "encrypt_message",
    arguments: {
      message,
      encryptionKey,
    },
  })) as unknown as {
    structuredContent: { encryptedMessage: string };
  };
}

async function decryptMessage(
  client: Client,
  encryptedMessage: string,
  encryptionKey: string,
) {
  return (await client.callTool({
    name: "decrypt_message",
    arguments: {
      encryptedMessage,
      encryptionKey,
    },
  })) as unknown as {
    structuredContent: { decryptedMessage: string };
  };
}

describe("MCP Tool Tests", () => {
  let client: Client;
  let encryptionKey = "test_passphrase";

  before(async () => {
    client = await createTestClient();
  });

  after(async () => {
    await client.close();
  });

  it("Should encrypt a message", async () => {
    const message = "Hello World!";

    const result = await encryptMessage(client, message, encryptionKey);

    assert.ok(
      result.structuredContent?.encryptedMessage.length > 60,
      "Encrypted message should not be empty",
    );
  });

  it("Should dencrypt a message", async () => {
    const message = "Heyyy";
    const key = "other_test_passphrase";

    const {
      structuredContent: { encryptedMessage },
    } = await encryptMessage(client, message, key);
    const {
      structuredContent: { decryptedMessage },
    } = await decryptMessage(client, encryptedMessage, key);

    assert.deepStrictEqual(
      decryptedMessage,
      message,
      "Decrypted message should match original",
    );
  });

  it("Should list the encryption://info resource", async () => {
    const { resources } = await client.listResources();

    const info = resources.find((item) => item.uri === "encryption://info");

    assert.ok(info, "Resource encryption://info not found");
  });

  it("Should return encrypt_message_prompt", async () => {
    const result = await client.getPrompt({
      name: "encrypt_message_prompt",
      arguments: {
        message: "Hello World!",
        encryptionKey,
      },
    });

    const item = result.messages.at(0)?.content as unknown as { text: string };
    const expected = `Please encrypt the following message using the encrypt_message tool.
Message: Hello World!
Encryption key: test_passphrase`;
    assert.deepStrictEqual(
      item.text,
      expected,
      "Prompt should be in the correct format",
    );
  });
});
