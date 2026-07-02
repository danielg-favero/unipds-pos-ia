import { type GraphState } from "../graph.ts";

export const lowerCaseNode = (state: GraphState): GraphState => {
  const responseText = state.output.toLocaleLowerCase();

  return {
    ...state,
    output: responseText,
  };
};
