import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerListCustomersTool } from "./tools/listCustomers.ts";
import { CustomerService } from "../application/customerService.ts";
import { registerApiInfoResource } from "./resources/apiInfo.ts";
import { registerCreateCustomerTool } from "./tools/createCustomer.ts";
import { registerGetCustomerTool } from "./tools/getCustomer.ts";
import { registerFindCustomerPrompt } from "./prompts/findCustomer.ts";
import { registerUpdateCustomerTool } from "./tools/updateCustomer.ts";
import { registerDeleteCustomerTool } from "./tools/deleteCustomer.ts";

const BASE_URL = "http://localhost:9999/v1";

const customerService = new CustomerService(BASE_URL);

export const server = new McpServer({
  name: "@danielg.favero/customers-mcp",
  version: "0.0.1",
});

registerListCustomersTool(server, customerService);
registerCreateCustomerTool(server, customerService);
registerGetCustomerTool(server, customerService);
registerUpdateCustomerTool(server, customerService);
registerDeleteCustomerTool(server, customerService);

registerApiInfoResource(server, BASE_URL);

registerFindCustomerPrompt(server);
