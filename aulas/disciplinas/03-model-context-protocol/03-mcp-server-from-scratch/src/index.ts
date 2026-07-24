import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { server } from "./mcp.ts";

async function main() {
  // Stdio é um pacote pra ser executado na máquina do cliente
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout é o canal do JSON-RPC — qualquer log precisa ir para stderr
  console.error("Encrypt MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
