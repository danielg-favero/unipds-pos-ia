import { AIMessage } from "langchain";
import { type GraphState } from "../graph.ts";

export const fallbackNode = (state: GraphState): GraphState => {
  const message =
    "Unkwon command. Try 'make this uppercase' or 'make this lowercase'";
  const fallbackMessage = new AIMessage({ content: message });

  return {
    ...state,
    output: message,
    // Messagens que são exibidas no chat
    messages: [...state.messages, fallbackMessage],
  };
};
