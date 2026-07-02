import { type GraphState } from "../graph.ts";

export const upperCaseNode = (state: GraphState): GraphState => {
  const responseText = state.output.toLocaleUpperCase();

  return {
    ...state,
    output: responseText,
  };
};
