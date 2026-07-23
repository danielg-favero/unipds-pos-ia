import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { getMongoDBTool } from "../tools/mongodbTool.ts";
import { getCSVTOJSONTool } from "../tools/csvToJsonTool.ts";
import { getFsTool } from "../tools/fsTool.ts";

export const getMCPTools = async () => {
  const client = new MultiServerMCPClient({
    mcpServers: {
      ...getMongoDBTool(),
      ...getFsTool(),
    },
    onMessage(log: any, source: any) {
      console.log(`[${source.server}] ${log.data}`);
    },
  });

  const mcpTools = await client.getTools();

  return [...mcpTools, getCSVTOJSONTool()];
};
