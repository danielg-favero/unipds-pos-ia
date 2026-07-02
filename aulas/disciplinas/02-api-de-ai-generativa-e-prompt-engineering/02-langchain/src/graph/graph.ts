import { END, MessagesZodMeta, START, StateGraph } from "@langchain/langgraph";
import { withLangGraph } from "@langchain/langgraph/zod";
import { BaseMessage } from "langchain";
import { z } from "zod/v3";

import { identifyIntentNode } from "./nodes/identify-intent-node.ts";
import { chatResponseNode } from "./nodes/chat-response-node.ts";
import { upperCaseNode } from "./nodes/upper-case-node.ts";
import { lowerCaseNode } from "./nodes/lower-case-node.ts";
import { fallbackNode } from "./nodes/fallback-node.ts";

const GraphState = z.object({
  messages: withLangGraph(z.custom<BaseMessage[]>(), MessagesZodMeta),
  output: z.string(),
  command: z.enum(["uppercase", "lowercase", "unkown"]),
});

export type GraphState = z.infer<typeof GraphState>;

export function buildGraph() {
  const workflow = new StateGraph({
    stateSchema: GraphState,
  })
    .addNode("identifyIntent", identifyIntentNode)
    .addNode("chatResponse", chatResponseNode)
    .addNode("upperCase", upperCaseNode)
    .addNode("lowerCase", lowerCaseNode)
    .addNode("fallback", fallbackNode)
    .addEdge(START, "identifyIntent")
    .addConditionalEdges(
      "identifyIntent",
      (state: GraphState) => {
        switch (state.command) {
          case "uppercase":
            return "uppercase";
          case "lowercase":
            return "lowercase";
          default:
            return "fallback";
        }
      },
      {
        uppercase: "upperCase",
        lowercase: "lowerCase",
        fallback: "fallback",
      },
    )
    .addEdge("upperCase", "chatResponse")
    .addEdge("lowerCase", "chatResponse")
    .addEdge("fallback", "chatResponse")
    .addEdge("chatResponse", END);

  return workflow.compile();
}
