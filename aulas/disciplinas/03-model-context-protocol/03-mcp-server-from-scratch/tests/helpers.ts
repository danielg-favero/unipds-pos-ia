import { Client } from "@modelcontextprotocol/sdk/client";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Simulando um agente que se conecta ao servidor e executa algo
export async function createTestClient() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["--experimental-strip-types", "src/index.ts"],
  });

  const client = new Client(
    {
      name: "test-client",
      version: "0.0.1",
    },
    {
      capabilities: {},
    },
  );

  await client.connect(transport);
  return client;
}
