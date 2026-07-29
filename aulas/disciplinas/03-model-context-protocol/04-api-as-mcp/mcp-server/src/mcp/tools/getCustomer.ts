import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v3";

import { CustomerService } from "../../application/customerService.ts";
import {
  CustomerSchema,
  CustomerSearchSchema,
  type CustomerSearch,
} from "../../domain/customer.ts";

export function registerGetCustomerTool(
  server: McpServer,
  service: CustomerService,
) {
  server.registerTool(
    "get_customer",
    {
      description: "Get a customer",
      inputSchema: CustomerSearchSchema,
      outputSchema: {
        customer: CustomerSchema.nullable().describe(
          "Customer detail if found, otherwise null!",
        ),
      },
    },
    async (params: CustomerSearch) => {
      try {
        const customer = await service.findCustomer(params);
        return {
          content: [{ type: "text", text: JSON.stringify(customer, null, 2) }],
          structuredContent: { customer },
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to get a customer! Error details: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
