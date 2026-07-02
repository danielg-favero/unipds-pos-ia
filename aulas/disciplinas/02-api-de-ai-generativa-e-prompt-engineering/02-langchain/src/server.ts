import Fastify from "fastify";
import { HumanMessage } from "langchain";

import { buildGraph } from "./graph/graph.ts";

const graph = buildGraph();

export const createServer = () => {
  const app = Fastify();

  app.post(
    "/chat",
    {
      schema: {
        body: {
          type: "object",
          required: ["question"],
          properties: {
            question: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { question } = request.body as { question: string };
        const response = await graph.invoke({
          messages: [new HumanMessage(question)],
        });

        return reply.send(response.output);
      } catch (error) {
        console.error("Error handling /chat requests:", error);
        return reply.code(500);
      }
    },
  );

  return app;
};
