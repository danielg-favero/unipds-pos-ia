import { buildAppointmentGraph } from "./graph.ts";

import { config } from "../config.ts";
import { OpenRouterService } from "../services/openRouterService.ts";
import { AppointmentService } from "../services/appointmentService.ts";

export function buildGraph() {
  const llmClient = new OpenRouterService(config);
  const appointmentService = new AppointmentService();

  return buildAppointmentGraph(llmClient, appointmentService);
}

export const graph = async () => {
  return buildGraph();
};

export default graph;
