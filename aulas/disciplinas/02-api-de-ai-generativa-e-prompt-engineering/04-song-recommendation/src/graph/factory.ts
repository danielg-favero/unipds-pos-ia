import { buildChatGraph } from "./graph.ts";

import { OpenRouterService } from "../services/openrouterService.ts";
import { PreferencesService } from "../services/preferencesService.ts";
import { createMemoryService } from "../services/memoryService.ts";
import { config } from "../config.ts";

export async function buildGraph(dbPath: string = "./preferences.db") {
  const llmClient = new OpenRouterService(config);

  const preferencesService = new PreferencesService(dbPath);
  const memoryService = await createMemoryService();

  const graph = buildChatGraph(llmClient, preferencesService, memoryService);

  return {
    graph,
    preferencesService,
  };
}

export const graph = async () => buildGraph();
export default graph;
