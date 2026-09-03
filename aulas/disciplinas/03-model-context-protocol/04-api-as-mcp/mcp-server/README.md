# @danielg.favero/customers-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that wraps an existing customer CRUD REST API, exposing it as tools, a resource, and a prompt for GitHub Copilot Chat and any other MCP-compatible agent.

The API is not modified and the database is never touched directly: this server talks to it over HTTP like any other client, so the validations and rules that already live there stay in force.

---

## What it does

| Capability  | Name                   | Description                                                      | Endpoints used                               |
| ----------- | ---------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| 🔧 Tool     | `list_customers`       | Lists every customer                                             | `GET /customers`                             |
| 🔧 Tool     | `create_customer`      | Creates a customer (`name`, `phone`)                             | `POST /customers`                            |
| 🔧 Tool     | `get_customer`         | Finds a customer by any combination of `_id`, `name` and `phone` | `GET /customers/:id` **or** `GET /customers` |
| 🔧 Tool     | `update_customer`      | Updates `name` and/or `phone` by `_id`                           | `PUT /customers/:id`                         |
| 🔧 Tool     | `delete_customer`      | Deletes a customer by `_id`                                      | `DELETE /customers/:id`                      |
| 📄 Resource | `customers://api-info` | Describes the wrapped API: base URL, endpoints, `Customer` shape | —                                            |
| 💬 Prompt   | `find_customer_prompt` | Template asking the agent to locate a customer from partial data | —                                            |

### Tools are actions, not endpoints

The mapping is deliberately **not** one-to-one. `get_customer` is the clearest case: given an `_id` it hits `GET /customers/:id`; given only a name or a phone it lists and filters in memory. To the model that is a single action — "find the customer" — not two endpoints.

The resource matters here precisely because the API is external: it hands the client a map of the wrapped system (base URL, endpoints, resource shape) so the agent understands the domain before picking a tool.

### Implementation notes

- **Every tool declares an `outputSchema`** and returns `structuredContent`, so clients consume typed output instead of parsing free text. Mutations share `CustomerMutationSchema` (`{ message, id }`) — exactly what the API already returns.
- **Errors are content, not exceptions**: each tool catches and returns `{ isError: true, content: [...] }`, so a failure reaches the model as context it can recover from (e.g. asking for the right `_id`).
- **`import { z } from "zod/v3"`** — the SDK still expects Zod v3 schemas; `zod@3.25+` exposes that subpath explicitly.
- **Logs go to `stderr`**: on the `stdio` transport, stdout *is* the protocol channel, so any `console.log` would land in the middle of the JSON-RPC stream.
- **The base URL is hardcoded** in `src/mcp/server.ts` (`http://localhost:9999/v1`) — that is the thing to parameterize for another environment.
- **`PUT /customers/:id` returns 404 when nothing changes** (`modifiedCount === 0`), including when you resend identical values. An API quirk the agent inherits — in a legacy system, the kind of thing worth hiding behind the action instead of passing along raw.

---

## Prerequisites

- **Node.js v24+** — runs TypeScript natively, no build step
- The **customers API** running on `http://localhost:9999` (see [`../fastify-api/`](../fastify-api/))

---

## Installation

```bash
npm install
```

Then start the API in another terminal:

```bash
cd ../fastify-api
docker compose up -d mongodb
node config/seed.js     # optional: seed a few customers
npm start
```

Check it with `curl http://localhost:9999/v1/health` — it should answer `{"app":"customers","version":"v1.0.1"}`.

---

## Using in VS Code

`.vscode/mcp.json` already registers the server:

```json
{
  "servers": {
    "customers-mcp": {
      "command": "node",
      "args": ["--experimental-strip-types", "./src/index.ts"]
    }
  }
}
```

The relative path resolves against the **workspace root** — it works when you open `mcp-server/` directly. From the monorepo root, use an absolute path to `src/index.ts`.

Reload the window (`Cmd+Shift+P` → **Developer: Reload Window**) and, with the API up, try in Copilot Chat (Agent mode):

```
List every registered customer
```

```
Create the customer Maria Silva with phone (11) 98888-7777
```

```
Find the customer named Maria and change her phone to (11) 97777-6666
```

```
Show me the customers://api-info resource
```

The third prompt is the one that shows the difference from calling the API by hand: the agent chains `get_customer` → `update_customer` on its own, because the first tool returns the `_id` the second requires.

---

## Running the MCP Inspector

```bash
npm run mcp:inspect
```

Opens the inspector at `http://localhost:5173`, connected to the server — list and call tools, resources, and prompts without spending an LLM call.

---

## Running tests

Tests are **integration tests over the protocol**, not unit tests: `tests/helpers.ts` boots the server as a child process via `StdioClientTransport` and returns a real SDK `Client`, so they exercise the same path an agent would — and the live API underneath.

```bash
# Requires the API running on localhost:9999
npm test

# Watch mode with the Node.js inspector
npm run test:dev
```

Coverage:

- `tests/tools/customers.test.ts` — the full CRUD (list, create, find by name, update, delete)
- `tests/resources/apiInfo.test.ts` — the resource shows up in `listResources` with the right description
- `tests/prompt/findCustomer.test.ts` — the rendered prompt mentions `get_customer` and the search parameters

> ⚠️ Tests write to the **same database** the API uses (`DB_NAME=customers`) and do not clean up — each run leaves "Teste" customers behind. Run `node ../fastify-api/config/seed.js` to reset the collection.

---

## Project structure

```
src/
  index.ts                             # Entry point — connects the stdio transport
  mcp/
    server.ts                          # Builds the McpServer and registers everything
    tools/                             # One tool per file (register*Tool)
    resources/apiInfo.ts               # customers://api-info
    prompts/findCustomer.ts            # find_customer_prompt
  application/customerService.ts       # Domain actions — one intent may span several endpoints
  infrastructure/customerHttpClient.ts # The only place that knows the API is REST
  domain/customer.ts                   # Zod schemas and types
tests/
  helpers.ts                           # Boots the server, returns an MCP Client
```

Four layers instead of the two in [`03-mcp-server-from-scratch`](../../03-mcp-server-from-scratch/), because wrapping an external system needs somewhere to put the HTTP details. Swapping REST for gRPC would only touch `infrastructure/`; adding a composite action would only touch `application/` plus one new file in `mcp/tools/`.

---

## Available scripts

| Script                | Description                                     |
| --------------------- | ----------------------------------------------- |
| `npm start`           | Start the server (this is what MCP clients run) |
| `npm run dev`         | Start with file-watch and the Node.js inspector |
| `npm test`            | Run all tests                                   |
| `npm run test:dev`    | Run tests in watch mode                         |
| `npm run mcp:inspect` | Open the MCP Inspector UI                       |
