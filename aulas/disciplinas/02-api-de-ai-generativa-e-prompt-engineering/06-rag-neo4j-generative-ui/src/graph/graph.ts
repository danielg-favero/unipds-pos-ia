import { StateGraph, START, END, MessagesZodMeta } from "@langchain/langgraph";
import { withLangGraph } from "@langchain/langgraph/zod";

import { z } from "zod/v3";
import type { BaseMessage } from "@langchain/core/messages";

import { Neo4jService } from "../services/neo4jService.ts";
import { OpenRouterService } from "../services/openrouterService.ts";

import { createCypherGeneratorNode } from "./nodes/cypherGeneratorNode.ts";
import { createCypherExecutorNode } from "./nodes/cypherExecutorNode.ts";
import { createCypherCorrectionNode } from "./nodes/cypherCorrectionNode.ts";
import { createQueryPlannerNode } from "./nodes/queryPlannerNode.ts";
import { createAnalyticalResponseNode } from "./nodes/analyticalResponseNode.ts";
import { createExtractQuestionNode } from "./nodes/extractQuestionNode.ts";

const SalesStateAnnotation = z.object({
  // Input
  messages: withLangGraph(z.custom<BaseMessage[]>(), MessagesZodMeta),
  question: z.string().optional(),

  // Cypher generation
  query: z.string().optional(),
  originalQuery: z.string().optional(),

  // Query execution
  dbResults: z.array(z.any()).optional(),

  // Self-correction
  correctionAttempts: z.number().optional(),
  validationError: z.string().optional(),
  needsCorrection: z.boolean().optional(),

  // Multi-step decomposition
  isMultiStep: z.boolean().optional(),
  subQuestions: z.array(z.string()).optional(),
  currentStep: z.number().optional(),
  subQueries: z.array(z.string()).optional(),
  subResults: z.array(z.array(z.any())).optional(),

  // Response generation
  answer: z.string().optional(),
  followUpQuestions: z.array(z.string()).optional(),

  // Error handling
  error: z.string().optional(),
});

export type GraphState = z.infer<typeof SalesStateAnnotation>;

export function buildSalesGraph(
  llmClient: OpenRouterService,
  neo4jService: Neo4jService,
) {
  const workflow = new StateGraph({
    stateSchema: SalesStateAnnotation,
  })
    // Entender a pergunta do usuário: "Qual os 10 usuários que compraram mais cursos?"
    .addNode("extractQuestion", createExtractQuestionNode())
    // Planejar query para o Nejo4j para caso ele precise decompor a query em várias etapas,
    .addNode("queryPlanner", createQueryPlannerNode(llmClient))
    // Gerar a query do banco de dados
    .addNode(
      "cypherGenerator",
      createCypherGeneratorNode(llmClient, neo4jService),
    )
    // Executar a query do banco de dados
    .addNode("cypherExecutor", createCypherExecutorNode(neo4jService))

    // Nó de correção caso alguma resposta dê problemas
    .addNode(
      "cypherCorrection",
      createCypherCorrectionNode(llmClient, neo4jService),
    )
    // A query vai retornar dados estruturados, para responder para o cliente é preciso responder de forma humana
    .addNode("analyticalResponse", createAnalyticalResponseNode(llmClient))

    .addEdge(START, "extractQuestion")

    .addConditionalEdges("extractQuestion", (state: GraphState) => {
      if (state.error) return END;
      return "queryPlanner";
    })

    .addEdge("queryPlanner", "cypherGenerator")
    .addEdge("cypherGenerator", "cypherExecutor")

    .addConditionalEdges("cypherExecutor", (state: GraphState) => {
      if (
        state.needsCorrection &&
        (!state.correctionAttempts || state.correctionAttempts < 1)
      ) {
        return "cypherCorrection";
      }

      if (
        state.isMultiStep &&
        state.subQuestions &&
        state.currentStep !== undefined
      ) {
        if (state.currentStep < state.subQuestions.length) {
          return "cypherGenerator";
        }
      }

      return "analyticalResponse";
    })

    .addEdge("cypherCorrection", "cypherExecutor")
    .addEdge("analyticalResponse", END);

  return workflow.compile();
}
