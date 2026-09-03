# @danielg-favero/danielg-favero-customers-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that wraps an **authenticated** customer CRUD REST API, exposing it as tools, a resource, and a prompt for GitHub Copilot, Claude Code, LangChain agents, and any other MCP-compatible client.

This is the [`04-api-as-mcp`](../../04-api-as-mcp/) server with authentication added: every request now carries a service token, and `401` / `403` / `429` responses are translated into messages the model can act on.

---

## What it does

| Capability  | Name                   | Description                                                        | Endpoints used                               |
| ----------- | ---------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| 🔧 Tool     | `list_customers`       | Lists every customer                                               | `GET /customers`                             |
| 🔧 Tool     | `create_customer`      | Creates a customer (`name`, `phone`) — **admin only**              | `POST /customers`                            |
| 🔧 Tool     | `get_customer`         | Finds a customer by any combination of `_id`, `name` and `phone`   | `GET /customers/:id` **or** `GET /customers` |
| 🔧 Tool     | `update_customer`      | Updates `name` and/or `phone` by `_id` — **admin only**            | `PUT /customers/:id`                         |
| 🔧 Tool     | `delete_customer`      | Deletes a customer by `_id` — **admin only**                       | `DELETE /customers/:id`                      |
| 📄 Resource | `customers://api-info` | Describes the wrapped API: base URL, endpoints, `Customer` shape   | —                                            |
| 💬 Prompt   | `find_customer_prompt` | Template asking the agent to locate a customer from partial data   | —                                            |

`get_customer` is the one that shows why tools are **actions, not endpoints**: given an `_id` it hits `GET /customers/:id`; given only a name or phone it lists and filters in memory. The model sees a single action either way.

### Authentication

The server authenticates against the API with a **service token** sent as `Authorization: Bearer <token>` on every request. The token is read from the `SERVICE_TOKEN` environment variable at startup — it is never a tool argument, so the model can neither read it nor swap it for a more privileged one.

The server exits immediately if `SERVICE_TOKEN` is missing, rather than surfacing the problem as a `401` mid-conversation.

The token's role determines what actually works: `member` tokens can read but get **403** on every mutation, while `admin` tokens can do everything. All five tools are listed regardless of role — the model discovers the boundary by hitting it.

### Error handling

HTTP failures are surfaced as tool content (`isError: true`), never as thrown exceptions, so the model reads them as context and can correct itself:

| Status | Error               | Message the model receives                             |
| ------ | ------------------- | ------------------------------------------------------ |
| `401`  | `UnauthorizedError` | Unauthorized: service token is missing or invalid       |
| `403`  | `ForbiddenError`    | Forbidden: token does not have sufficient permissions   |
| `429`  | `RateLimitError`    | Rate limit exceeded. Please try again later.            |

---

## Prerequisites

- **Node.js v24+** — runs TypeScript natively, no build step
- The **customers API** running on `http://localhost:9999` (see [`../nodejs-fastify-mongodb-crud/`](../nodejs-fastify-mongodb-crud/))
- A **service token** issued by that API

---

## Installation

```bash
npm install
```

### Getting a service token

```bash
curl -X POST http://localhost:9999/v1/auth/service-token \
  -H "Content-Type: application/json" \
  -d '{"username":"danielg-favero","password":"123123","adminSuperSecret":"admin_supersecret"}'
```

Returns `{ "serviceToken": "<uuid>", "role": "admin" }`. Use `amanda` / `1234` for a `member` token to exercise the `403` path.

> ⚠️ `getServiceToken.sh` and `tests/helpers.ts` still send `"AM I THE BOSS?"` as `adminSuperSecret`, while the API expects `"admin_supersecret"` (see `../nodejs-fastify-mongodb-crud/src/auth.js`). With the old value the request returns **401**. Align all three before running the script or the test suite.

---

## Using in VS Code

`.vscode/mcp.json` already registers the server:

```json
{
  "servers": {
    "customers-mcp": {
      "command": "node",
      "args": ["--experimental-strip-types", "./src/index.ts"],
      "env": {
        "SERVICE_TOKEN": "your-service-token-here"
      }
    }
  }
}
```

Or, once published to npm:

```json
{
  "servers": {
    "customers-mcp": {
      "command": "npx",
      "args": ["-y", "@danielg-favero/danielg-favero-customers-mcp@latest"],
      "env": { "SERVICE_TOKEN": "your-service-token-here" }
    }
  }
}
```

The relative path resolves against the **workspace root** — it works when you open `customers-mcp/` directly. From the monorepo root, use an absolute path to `src/index.ts`.

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

The third prompt is the one worth watching: the agent chains `get_customer` → `update_customer` on its own, because the first tool returns the `_id` the second requires. Swap in a `member` token and it will report the permission error instead of retrying.

---

## Running the MCP Inspector

```bash
SERVICE_TOKEN=<uuid> npm run mcp:inspect
```

Opens the inspector at `http://localhost:5173`, connected to the server — list and call tools, resources, and prompts without spending an LLM call.

---

## Running tests

Tests are **integration tests over the protocol**: `tests/helpers.ts` issues a service token, then boots the server as a child process via `StdioClientTransport` and returns a real SDK `Client`. They exercise the same path an agent would, plus the live API underneath.

```bash
# Requires the API running on localhost:9999
npm test

# Watch mode with the Node.js inspector
npm run test:dev
```

Coverage:

- `tests/tools/customers.test.ts` — the full CRUD (list, create, find by name, update, delete)
- `tests/resources/api-info.test.ts` — the resource shows up in `listResources` with the right description

> ⚠️ Tests write to the **same database** the API uses (`DB_NAME=customers`) and do not clean up. Run `node ../nodejs-fastify-mongodb-crud/config/seed.js` to reset the collection.

---

## Project structure

```
src/
  index.ts                              # Entry point — validates SERVICE_TOKEN, connects stdio transport
  mcp/
    server.ts                           # Builds the McpServer and registers everything
    tools/                              # One tool per file (register*Tool)
    resources/api-info.ts               # customers://api-info
    prompts/findCustomer.ts             # find_customer_prompt
  application/customer-service.ts       # Domain actions — one intent may span several endpoints
  infrastructure/customer-http-client.ts # fetch + auth header; maps 401/403/429 to domain errors
  domain/
    customer.ts                         # Zod schemas and types
    errors.ts                           # UnauthorizedError, ForbiddenError, RateLimitError
tests/
  helpers.ts                            # Issues the token, boots the server, returns an MCP Client
```

Swapping the REST API for gRPC would only touch `infrastructure/`; adding a composite action would only touch `application/` plus one new file in `mcp/tools/`.

---

## Publishing

The package ships with both a private (Verdaccio) and a public release flow:

```bash
npm run registry:start           # Verdaccio at http://localhost:4873
npm run registry:login:private
npm run release:private          # npm version patch && publish to localhost:4873

npm run registry:login:public
npm run release:public           # npm version patch && publish --access public
```

`bin` points at `src/index.ts` (which carries a `#!/usr/bin/env node` shebang) and `npm run build` just `chmod 755`s it — Node 24 runs the TypeScript directly, so there is nothing to compile.

---

## Available scripts

| Script                           | Description                                     |
| -------------------------------- | ----------------------------------------------- |
| `npm start`                      | Start the server (this is what MCP clients run) |
| `npm run dev`                    | Start with file-watch and the Node.js inspector |
| `npm test`                       | Run all tests                                   |
| `npm run test:dev`               | Run tests in watch mode                         |
| `npm run mcp:inspect`            | Open the MCP Inspector UI                       |
| `npm run build`                  | Make the entry point executable (`chmod 755`)   |
| `npm run registry:start` / `:stop` | Start/stop the local Verdaccio registry       |
| `npm run release:private` / `:public` | Bump the patch version and publish         |
