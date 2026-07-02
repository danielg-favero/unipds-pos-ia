import { AIMessage } from "langchain";
import { type GraphState } from "../graph.ts";

export const chatResponseNode = (state: GraphState): GraphState => {
  const responseText = state.output;
  const aiMessage = new AIMessage(responseText);

  return {
    ...state,
    // Messagens que são exibidas no chat
    messages: [...state.messages, aiMessage],
  };
};
