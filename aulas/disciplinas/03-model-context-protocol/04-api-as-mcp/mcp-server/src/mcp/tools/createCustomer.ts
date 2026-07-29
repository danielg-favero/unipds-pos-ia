import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

import { CustomerService } from "../../application/customerService.ts";
import { CustomerSchema } from "../../domain/customer.ts";

export function registerCreateCustomerTool(
  server: McpServer,
  service: CustomerService,
) {
  server.registerTool(
    "create_customer",
    {
      description: "Create a customer",
      inputSchema: {
        name: z.string().describe("Full name of the customer"),
        phone: z.string().describe("Phone number of the customer"),
      },
      outputSchema: {
        message: z.string().describe("Confirmation message"),
        id: z.string().describe("MongoDB ObjectID of newly created customer"),
      },
    },
    async ({ name, phone }) => {
      try {
        const response = await service.createCustomer({ name, phone });
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
          structuredContent: response,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to create customer! Error details: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
