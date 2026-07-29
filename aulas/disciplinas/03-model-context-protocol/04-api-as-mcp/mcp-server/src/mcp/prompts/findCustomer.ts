import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CustomerSearchSchema } from "../../domain/customer.ts";

export function registerFindCustomerPrompt(server: McpServer) {
  server.registerPrompt(
    "find_customer_prompt",
    {
      description:
        "Prompt to search a customer using any combination of _id, name and phone number",
      argsSchema: CustomerSearchSchema.shape,
    },
    (params) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please find the customer matching the following query using the get_customer or list_customers tool.\nQuery: ${JSON.stringify(params)}`,
          },
        },
      ],
    }),
  );
}
