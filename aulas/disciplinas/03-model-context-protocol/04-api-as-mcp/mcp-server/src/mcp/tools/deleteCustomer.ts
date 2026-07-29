import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

import { CustomerService } from "../../application/customerService.ts";
import { CustomerMutationSchema } from "../../domain/customer.ts";

export function registerDeleteCustomerTool(
  server: McpServer,
  service: CustomerService,
) {
  server.registerTool(
    "delete_customer",
    {
      description: "Delete a customer by their _id",
      inputSchema: {
        _id: z.string().describe("MongoDB ObjectID of the customer"),
      },
      outputSchema: CustomerMutationSchema.shape,
    },
    async ({ _id }) => {
      try {
        const response = await service.deleteCustomer(_id);
        return {
          content: [{ type: "text", text: response.message ?? "" }],
          structuredContent: response,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to delete customer! Error details: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
