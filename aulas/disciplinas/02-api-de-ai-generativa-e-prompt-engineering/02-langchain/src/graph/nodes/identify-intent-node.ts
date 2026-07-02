import { type GraphState } from "../graph.ts";

export const identifyIntentNode = (state: GraphState): GraphState => {
  const input = state.messages.at(-1)?.text ?? "";

  const inputLower = input.toLocaleLowerCase();

  let command: GraphState["command"] = "unkown";

  if (inputLower.includes("upper")) {
    command = "uppercase";
  } else if (inputLower.includes("lower")) {
    command = "lowercase";
  }

  return {
    ...state,
    command,
    // A saída de um nó é a entrada de outro
    output: input,
  };
};
