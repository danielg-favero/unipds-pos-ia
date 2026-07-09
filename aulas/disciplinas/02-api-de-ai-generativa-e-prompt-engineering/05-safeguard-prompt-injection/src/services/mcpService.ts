import { MultiServerMCPClient } from "@langchain/mcp-adapters";

export const getMCPTools = async () => {
  const mcpClient = new MultiServerMCPClient({
    filesystem: {
      transport: "stdio",
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        // Dar acesso apenas ao file system atual do projeto
        process.cwd(),
      ],
    },
  });

  // Traz toda a documentação do MCP e tudo isso será injetado no prompt
  return mcpClient.getTools();
};
