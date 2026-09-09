---

description: "Task list for the OpsPilot MCP server feature"
---

# Tasks: Servidor MCP do OpsPilot

**Input**: Design documents from `/specs/005-opspilot-mcp-server/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/mcp-tools.md](./contracts/mcp-tools.md), [quickstart.md](./quickstart.md)

**Tests**: Included — constitution principle IV ("Teste é Parte da Tarefa") is non-negotiable for this project; the feature spec also explicitly requires an automated test validating the tools list (FR-013).

**Organization**: Tasks are grouped by user story from spec.md to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)

## Path Conventions

Single Node/TypeScript project — all paths are relative to the repository root (`src/`, `package.json`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the MCP SDK dependency and the new `src/mcp/` module location.

- [X] T001 Add `@modelcontextprotocol/sdk` (`^1.30.0`) to `dependencies` in `package.json` and run `npm install`
- [X] T002 Add npm script `"mcp": "tsx --env-file-if-exists=.env src/mcp/server.ts"` to `package.json` (`scripts`), matching the pattern of the existing `dev`/`arena`/`seed`/`bench` scripts
- [X] T003 Create empty directory `src/mcp/` (holds `server.ts` and `server.test.ts`)

**Checkpoint**: `npm install` succeeds, `npm run mcp` is a recognized script (will fail until Phase 2/3 create `server.ts`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make the existing tool logic reusable by a non-LangChain caller, without duplicating schemas or business rules (constitution II/III, FR-007).

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Export `asToolResult` from `src/agents/tools.ts` (add `export` to its declaration at line ~118) so it can be reused by `src/mcp/server.ts` as the single place that turns `OpsStore` results and domain errors into the `{ ok, data|error }` shape — do not change its behavior or signature
- [X] T005 Verify (read-only check, no code change) that `src/agents/tools.ts` already exports `listAlertsSchema`, `openIncidentSchema`, `resolveIncidentSchema`, and `SEVERITIES`-based validation needed by the MCP server; note any additional export need discovered here for T004

**Checkpoint**: `asToolResult`, `listAlertsSchema`, `openIncidentSchema`, `resolveIncidentSchema` are all importable from `src/agents/tools.ts` (or `src/domain/types.ts`) by code outside that module. `npm run typecheck` still passes.

---

## Phase 3: User Story 1 - Cliente MCP descobre as capacidades do OpsPilot (Priority: P1) 🎯 MVP

**Goal**: A stdio MCP server named `opspilot` starts, registers the three tools with their real Zod-derived schemas, and answers `tools/list` correctly.

**Independent Test**: Start the server, connect an MCP client (in-memory transport in test, or a real MCP-capable client manually), call `tools/list`, and confirm exactly `list_alerts`, `open_incident`, `resolve_incident` are returned with descriptions/input schemas matching `src/agents/tools.ts`.

### Tests for User Story 1

- [X] T006 [P] [US1] Write `src/mcp/server.test.ts`: using `Client` + `InMemoryTransport` (or `InMemoryTransport.createLinkedPair()`) from `@modelcontextprotocol/sdk`, connect a client to the server created by `createOpsPilotServer(store)` and assert `client.listTools()` returns exactly the tools `list_alerts`, `open_incident`, `resolve_incident` (name-only assertion first; fails until T007-T008 exist)

### Implementation for User Story 1

- [X] T007 [US1] Create `src/mcp/server.ts` exporting a pure factory `createOpsPilotServer(store: OpsStore): McpServer` that instantiates `new McpServer({ name: "opspilot", version: "1.0.0" })` — no tools registered yet, no process/transport wiring in this function (keeps it testable without stdio, per plan's layering)
- [X] T008 [US1] In `src/mcp/server.ts`, register `list_alerts` via `server.registerTool("list_alerts", { title, description, inputSchema: listAlertsSchema.shape }, handler)`, reusing the `description` text and `listAlertsSchema` already exported by `src/agents/tools.ts` (imported, not redefined); handler body is added in Phase 4 (US2) — for now it may return a placeholder empty result so registration/listing can be tested first
- [X] T009 [US1] In `src/mcp/server.ts`, register `open_incident` and `resolve_incident` the same way, reusing `openIncidentSchema`/`resolveIncidentSchema` and their existing descriptions from `src/agents/tools.ts`; handlers filled in Phase 5 (US3)
- [X] T010 [US1] At the bottom of `src/mcp/server.ts`, add the process entrypoint guard: build a store (`new MemoryOpsStore()` seeded per T013), call `createOpsPilotServer(store)`, connect it to `new StdioServerTransport()`, and run this only when the file is executed directly (not when imported by `server.test.ts`) — e.g. guard on `import.meta.url === pathToFileURL(process.argv[1]).href`
- [X] T011 [US1] Run T006's test and confirm it now passes; run `npm run typecheck`

**Checkpoint**: `npm test -- --test-name-pattern opspilot` passes for the tools-list assertion; `npm run mcp` starts the process without crashing and without printing anything before a client connects.

---

## Phase 4: User Story 2 - Cliente MCP consulta alertas ativos (Priority: P1)

**Goal**: `list_alerts` returns real alert data from the shared `OpsStore`, honoring the `firing`/`resolved`/`all` filter and rejecting invalid filters.

**Independent Test**: With seeded alert data, call `list_alerts` via the in-memory MCP client with each filter value and confirm the returned alerts match; call it with an invalid filter and confirm a validation error is returned instead of a crash.

### Tests for User Story 2

- [X] T012 [P] [US2] Extend `src/mcp/server.test.ts`: seed a `MemoryOpsStore` with known alert data (reuse `SEED_SERVICES`/seed fixtures from `src/store/seed-data.ts` or the same fixtures `tools.test.ts` uses), call `list_alerts` with no args and assert only `firing` alerts come back; call with `{ status: "all" }` and assert all alerts come back; call with an invalid `{ status: "bogus" }` and assert the call is rejected as a validation error (not a thrown exception reaching the test as an unhandled rejection)

### Implementation for User Story 2

- [X] T013 [US2] In `src/mcp/server.ts`, implement the `list_alerts` handler body: call `store.listAlerts(status === "all" ? undefined : status)`, wrap the result via the reused `asToolResult` (T004) as `{ alerts }`, and return it as MCP tool content (`{ content: [{ type: "text", text: <that JSON string> }] }`) — mirrors the existing `listAlerts` tool body in `src/agents/tools.ts`, not a reimplementation of the filtering logic
- [X] T014 [US2] In `src/mcp/server.ts` process entrypoint (T010), seed the `MemoryOpsStore` instance with the same demo data used elsewhere in the project (`SEED_SERVICES`/`seed-data.ts` fixtures) so `npm run mcp` has real alerts to serve for manual testing per quickstart.md
- [X] T015 [US2] Run T012's test and confirm it passes; run `npm run typecheck`

**Checkpoint**: User Stories 1 and 2 both work independently — a client can discover and successfully call `list_alerts` with correct filtering behavior.

---

## Phase 5: User Story 3 - Cliente MCP abre e resolve incidentes (Priority: P2)

**Goal**: `open_incident` and `resolve_incident` create/update incidents on the shared `OpsStore`, surfacing domain errors (unknown service, unknown/already-resolved incident) as structured tool errors rather than crashes.

**Independent Test**: Call `open_incident` with a valid seeded service, get back an id; call `resolve_incident` with that id and confirm status becomes `resolved`; call `resolve_incident` with a bogus id and confirm a domain-error result (`ok: false`) is returned, not an unhandled exception; call `open_incident` with an unknown service and confirm the same.

### Tests for User Story 3

- [X] T016 [P] [US3] Extend `src/mcp/server.test.ts`: call `open_incident` with a valid seeded service/title/severity, assert `ok: true` and an `id` comes back; call `resolve_incident` with that id, assert `status: "resolved"`
- [X] T017 [P] [US3] Extend `src/mcp/server.test.ts`: call `open_incident` with a non-existent service and assert a domain-error result (`ok: false`) is returned, not a thrown/unhandled exception; call `resolve_incident` with a non-existent id and assert the same
- [X] T018 [P] [US3] Extend `src/mcp/server.test.ts`: call `open_incident` with invalid input (empty `title`, `severity` outside the allowed enum) and assert the call is rejected as a schema-validation error

### Implementation for User Story 3

- [X] T019 [US3] In `src/mcp/server.ts`, implement the `open_incident` handler body: call `store.openIncident({ title, serviceId: service, severity })`, wrap via `asToolResult` returning `{ id, title, service, severity, status }`, mirroring the existing `openIncident` tool body in `src/agents/tools.ts`
- [X] T020 [US3] In `src/mcp/server.ts`, implement the `resolve_incident` handler body: call `store.resolveIncident(id)`, wrap via `asToolResult` returning `{ id, status }`, mirroring the existing `resolveIncident` tool body in `src/agents/tools.ts`
- [X] T021 [US3] Run T016-T018's tests and confirm they pass; run `npm run typecheck`

**Checkpoint**: All three tools are fully functional end to end via MCP, independently of the LangChain agent path.

---

## Phase 6: User Story 4 - Consistência de regras entre agente interno e MCP (Priority: P2)

**Goal**: Structural guarantee that the MCP server never redefines validation/business rules — verified by exercising the exact same domain-error and validation paths already covered by `src/agents/tools.test.ts`.

**Independent Test**: Compare (in test) the result of calling a tool via the MCP path against the result of calling the equivalent LangChain tool from `makeTools(store)` on the same store state and inputs — they must be structurally identical.

### Tests for User Story 4

- [X] T022 [P] [US4] Add a test in `src/mcp/server.test.ts` that, given the same `MemoryOpsStore` instance, invokes `open_incident` via the MCP server and via `makeTools(store)`'s `open_incident` LangChain tool with identical input, and asserts the parsed `{ ok, data }`/`{ ok, error }` payloads are deep-equal (proves FR-007/SC-002 — no divergent validation or business logic)

### Implementation for User Story 4

- [X] T023 [US4] If T022 reveals any divergence (e.g. a field present in one payload but not the other), fix `src/mcp/server.ts` handlers to call the exact same store methods and `asToolResult` shape used by `src/agents/tools.ts` — no new validation logic is added anywhere

**Checkpoint**: MCP and LangChain surfaces are provably consistent for identical inputs/state.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the stdout-purity guarantee (FR-011/SC-004) at the real-process level, and close out documentation/quickstart validation.

- [X] T024 Add a process-level test (e.g. `src/mcp/server.stdout.test.ts`) that spawns `tsx src/mcp/server.ts` as a real child process via `node:child_process`, sends a valid `tools/list` JSON-RPC request over its stdin, and asserts every line received on `child.stdout` parses as valid JSON-RPC (no stray log/text lines), while allowing arbitrary content on `child.stderr`
- [X] T025 [P] Re-read `src/mcp/server.ts` end to end and confirm no `console.log`/`console.info`/`console.warn` call exists anywhere in the file (only `console.error`, or none, is allowed for diagnostics)
- [X] T026 Run through [quickstart.md](./quickstart.md) manually once (or with an available MCP-capable client) end to end and confirm the documented steps match actual behavior
- [X] T027 Run `npm run typecheck` and `npm test` for the full suite and confirm both are green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (T004 export is required before any MCP handler can reuse `asToolResult`)
- **User Story 1 (Phase 3)**: Depends on Foundational — delivers the MVP (server + tool registration/listing)
- **User Story 2 (Phase 4)**: Depends on Foundational; builds on the `list_alerts` registration from Phase 3 (T008) by filling in its handler
- **User Story 3 (Phase 5)**: Depends on Foundational; builds on the `open_incident`/`resolve_incident` registration from Phase 3 (T009) by filling in their handlers
- **User Story 4 (Phase 6)**: Depends on User Stories 2 and 3 being implemented (needs real handler behavior to compare against)
- **Polish (Phase 7)**: Depends on all user stories being complete

### Within Each User Story

- Tests are written before/alongside the implementation task they validate and must fail first where practical
- Registration (schema wiring) precedes handler-body implementation for the same tool
- Story complete before moving to the next priority

### Parallel Opportunities

- T001-T003 (Setup) can be done in one pass since they touch `package.json`/directory creation, not meaningfully parallel across people but ordered
- T012, T016-T018, T022 are all edits to the same file (`src/mcp/server.test.ts`) — mark `[P]` in the sense of "independent assertions," but apply sequentially if worked by a single agent to avoid merge conflicts within one file
- T024-T025 (Phase 7) can run in parallel with each other

---

## Parallel Example: User Story 3

```bash
# These three test additions are independent assertions within server.test.ts:
Task: "open_incident + resolve_incident happy path in src/mcp/server.test.ts"
Task: "open_incident/resolve_incident domain-error paths in src/mcp/server.test.ts"
Task: "open_incident invalid-input validation path in src/mcp/server.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (export `asToolResult`)
3. Complete Phase 3: User Story 1 — server starts, registers 3 tools, `tools/list` works
4. **STOP and VALIDATE**: `npm test` passes the tools-list assertion; `npm run mcp` starts cleanly
5. This is already a demonstrable MVP: a client can discover the OpsPilot MCP server's capabilities

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → tools discoverable → demo "opspilot connects and lists tools"
3. User Story 2 → `list_alerts` works end to end → demo "read-only monitoring via MCP"
4. User Story 3 → `open_incident`/`resolve_incident` work end to end → demo "full incident workflow via MCP"
5. User Story 4 → consistency proof → confidence for maintainers, no user-visible change
6. Polish → stdout-purity guarantee verified at process level, quickstart confirmed

---

## Notes

- No new domain entities, no new persistence — this feature is a thin transport layer, per plan.md
- All handler bodies must mirror (not duplicate independently) the corresponding tool body in `src/agents/tools.ts`
- Commit after each task or logical group, per constitution's "cada tarefa cabe em um commit"
