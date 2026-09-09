---

description: "Task list for Provider Status Tool"
---

# Tasks: Provider Status Tool

**Input**: Design documents from `/specs/004-provider-status-tool/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/check_provider_status.md, quickstart.md

**Tests**: Included — FR-014 and constitution Principle IV (Teste é Parte da Tarefa) both require tests for this feature.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single project (existing repo). All changes land in `src/agents/tools.ts` (implementation) and `src/agents/tools.test.ts` (tests) — both files already exist.

---

## Phase 1: Setup

**Purpose**: No new project scaffolding is needed — this feature extends existing files. Nothing to set up beyond confirming the target files exist.

- [X] T001 Confirm `src/agents/tools.ts` and `src/agents/tools.test.ts` exist and review their current structure (tool registration pattern, `TOOL_NAMES`, existing test setup) so new code matches conventions

**Checkpoint**: No blocking setup — proceed directly to Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared building blocks every user story's tests/implementation rely on — the provider→URL map, response schema, and the fetch-with-timeout-and-retry primitive, all colocated in `src/agents/tools.ts` per the plan's Structure Decision.

**⚠️ CRITICAL**: Must be complete before any user story task starts.

- [X] T002 In `src/agents/tools.ts`, add `PROVIDER_STATUS_URLS: Record<"github" | "cloudflare", string>` mapping `github` → `https://www.githubstatus.com/api/v2/status.json` and `cloudflare` → `https://www.cloudflarestatus.com/api/v2/status.json` (per research.md "Provider → URL mapping")
- [X] T003 In `src/agents/tools.ts`, add the Zod response schema `providerStatusResponseSchema = z.object({ status: z.object({ indicator: z.string(), description: z.string() }) })` (per data-model.md "External Response Shape")
- [X] T004 In `src/agents/tools.ts`, add the `checkProviderStatusSchema` Zod input schema: `z.object({ provider: z.enum(["github", "cloudflare"]).default("github").describe(...) })` with the description text from contracts/check_provider_status.md "Input Schema"
- [X] T005 In `src/agents/tools.ts`, implement an internal `fetchProviderStatus(url, fetchImpl)` helper that performs one attempt with `fetchImpl(url, { signal: AbortSignal.timeout(5000) })`, and on thrown error or `response.status >= 500`, retries exactly once identically (per research.md "Timeout mechanism" / "Retry policy"); returns the final `Response` or throws the final error/rejection for the caller to handle

**Checkpoint**: Foundational primitives ready — user story implementation can begin.

---

## Phase 3: User Story 1 - Check whether an outage is external (Priority: P1) 🎯 MVP

**Goal**: A caller can invoke `check_provider_status` (default `github`, or explicit `provider: "cloudflare"`) and get back a compact single-line status result reflecting the real provider status.

**Independent Test**: Call the tool with `provider: "github"` (default) and with `provider: "cloudflare"` against a fake fetch returning valid bodies; confirm each call returns one line naming the provider's indicator and description.

### Tests for User Story 1 ⚠️

> Write these first; they should fail until the implementation tasks below are done.

- [X] T006 [P] [US1] In `src/agents/tools.test.ts`, add a test "check_provider_status: github padrão devolve status compacto" — inject a fake `fetchImpl` resolving with `{ status: { indicator: "none", description: "All Systems Operational" } }` for the github URL, call the tool with `{}` (no provider given), assert the returned string is a single line containing `"github"`, `"none"`, and `"All Systems Operational"`
- [X] T007 [P] [US1] In `src/agents/tools.test.ts`, add a test "check_provider_status: cloudflare explícito" — inject a fake `fetchImpl` that asserts it was called with the Cloudflare URL and resolves with a valid body (e.g. indicator `"minor"`), call the tool with `{ provider: "cloudflare" }`, assert the returned line contains `"cloudflare"` and the given indicator/description

### Implementation for User Story 1

- [X] T008 [US1] In `src/agents/tools.ts`, implement `makeCheckProviderStatusTool(fetchImpl: typeof fetch = fetch)` using `tool()` from `@langchain/core/tools`: resolve the URL via `PROVIDER_STATUS_URLS[provider]`, call `fetchProviderStatus` (T005), parse `await response.json()`, validate with `providerStatusResponseSchema` (T003), and on success return `` `${provider}: ${status.indicator} — ${status.description}` `` (depends on T002-T005)
- [X] T009 [US1] In `src/agents/tools.ts`, set the tool's `name` to `"check_provider_status"` and `schema` to `checkProviderStatusSchema` (T004) when registering it with `tool(...)` (depends on T008)
- [X] T010 [US1] In `src/agents/tools.ts`, export `makeCheckProviderStatusTool` and wire it into `makeTools`'s returned array (or export/call it alongside `makeTools`, matching how the file currently structures its single `makeTools` factory) so the tool is available to the agent runtime (depends on T008, T009)

**Checkpoint**: User Story 1 is independently functional — successful status checks for both providers work end-to-end.

---

## Phase 4: User Story 2 - Get a clear answer even when the check itself fails (Priority: P2)

**Goal**: Timeout, repeated network/5xx failure, and invalid response shape all resolve to a readable error string instead of throwing; a single 5xx-then-success sequence resolves to the successful result.

**Independent Test**: Simulate (via fake fetch) a timeout, a 5xx-then-valid retry, and a malformed body; confirm each yields the documented string outcomes with no thrown exception.

### Tests for User Story 2 ⚠️

- [X] T011 [P] [US2] In `src/agents/tools.test.ts`, add a test "check_provider_status: timeout após retry devolve erro legível" — inject a fake `fetchImpl` that always rejects with an abort-style error (e.g. `DOMException("The operation was aborted", "AbortError")`), call the tool, assert the call resolves (does not throw) to a string mentioning `"github"` and a timeout-related word, and assert `fetchImpl` was called exactly twice (1 attempt + 1 retry)
- [X] T012 [P] [US2] In `src/agents/tools.test.ts`, add a test "check_provider_status: 5xx na primeira tentativa, sucesso no retry" — inject a fake `fetchImpl` that returns a `Response` with `status: 503` on the first call and a valid 200 body on the second call, call the tool, assert the returned string is the successful compact line (not an error) and that `fetchImpl` was called exactly twice
- [X] T013 [P] [US2] In `src/agents/tools.test.ts`, add a test "check_provider_status: resposta inválida devolve erro legível" — inject a fake `fetchImpl` that resolves with a 200 `Response` whose JSON body does not match the schema (e.g. `{ foo: "bar" }`), call the tool, assert the call resolves (does not throw) to a readable error string mentioning `"github"`

### Implementation for User Story 2

- [X] T014 [US2] In `src/agents/tools.ts`, wrap the body of `makeCheckProviderStatusTool`'s tool callback (T008) in a local `try/catch` that catches every error (fetch rejection, non-OK response after retry, JSON parse failure, Zod validation failure) and returns a readable error string of the form `` `${provider} status check failed: ${reason}` `` instead of rethrowing — per FR-011 and contracts/check_provider_status.md "Behavior" steps 4-5 (depends on T008)
- [X] T015 [US2] In `src/agents/tools.ts`, ensure `fetchProviderStatus` (T005) treats a final non-OK response (after the one retry) as a failure the catch block in T014 turns into the `"provider returned an error"`-style message, distinct from the timeout/network-error and invalid-shape messages, so the three failure kinds are distinguishable in the returned string (depends on T005, T014)

**Checkpoint**: User Stories 1 AND 2 both work independently — successful and failed checks all resolve to well-formed strings, never exceptions.

---

## Phase 5: User Story 3 - Know when to reach for this tool (Priority: P3)

**Goal**: The tool's registered description clearly tells the agent to use it when an external issue is suspected, when asking "is it us or the provider," or when a dependency looks down.

**Independent Test**: Inspect the tool's `description` field and confirm it names those triggering situations.

### Tests for User Story 3 ⚠️

- [X] T016 [P] [US3] In `src/agents/tools.test.ts`, add a test "check_provider_status: description orienta quando usar" — after constructing the tool, assert `tool.description` (case-insensitively) mentions suspecting an external problem, distinguishing "nosso" vs. "provedor" (or equivalent "us vs. provider" phrasing), and a dependency being down/unavailable

### Implementation for User Story 3

- [X] T017 [US3] In `src/agents/tools.ts`, write the `description` string for the `check_provider_status` tool registration (T009) per FR-004 and contracts/check_provider_status.md "Description", e.g.: "Consulta o status público de um provedor externo (GitHub ou Cloudflare). Use quando houver suspeita de problema externo, para responder 'é o nosso ou do provedor?', ou quando uma dependência parecer fora do ar." (depends on T009)

**Checkpoint**: All three user stories independently functional — the tool works, degrades gracefully, and is discoverable at the right moments.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across the whole feature.

- [X] T018 [P] Add `"check_provider_status"` to the `TOOL_NAMES` tuple in `src/agents/tools.ts` if the project's convention (per the existing "expõe as ... tools esperadas" test) requires every tool name to be listed there — **decision: not applicable.** `TOOL_NAMES` is scoped to `makeTools(store)`'s store-bound tools and is asserted exactly by the "expõe as cinco tools esperadas" test; `check_provider_status` is deliberately a separate, store-independent factory (`makeCheckProviderStatusTool`), so adding it to `TOOL_NAMES` would both be semantically wrong and break that existing test. Left out by design.
- [X] T019 Run `npm run typecheck` and `npm test` from the repo root; fix any failures until both are green (constitution Principle IV gate)
- [X] T020 Execute the manual validation script from `specs/004-provider-status-tool/quickstart.md` ("Manual/exploratory validation") against the real GitHub/Cloudflare status APIs and confirm both calls return a compact single-line result within a few seconds

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only.
- **User Story 2 (Phase 4)**: Depends on Foundational; builds directly on the tool callback introduced in US1 (T008), since it wraps that same callback in error handling — implement after US1.
- **User Story 3 (Phase 5)**: Depends on Foundational and on the tool registration existing (T009 from US1) so its `description` can be written/tested; implement after US1 (can run alongside or after US2).
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on other stories — this is the MVP.
- **US2 (P2)**: Wraps the US1 implementation (T008) with error handling; not independently meaningful without US1, but its tests are independently checkable once US1 exists.
- **US3 (P3)**: Only touches the `description` string on the tool US1 registers (T009); independently checkable via T016 once US1 exists.

### Parallel Opportunities

- T006 and T007 (US1 tests) can run in parallel — different test cases, same file, no shared mutable state.
- T011, T012, T013 (US2 tests) can run in parallel with each other.
- T016 (US3 test) can run in parallel with US2's tests once US1's T009 is done.
- T002, T003, T004 (Foundational) touch the same file but are independent declarations — can be written in parallel by different contributors, though in practice one contributor will do them sequentially in one pass since they're small.

---

## Parallel Example: User Story 1

```bash
# Write both US1 tests together (same file, independent cases):
Task: "check_provider_status: github padrão devolve status compacto — src/agents/tools.test.ts"
Task: "check_provider_status: cloudflare explícito — src/agents/tools.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (trivial) and Phase 2 (Foundational primitives).
2. Complete Phase 3 (User Story 1): tool exists, returns a compact status line for both providers on the happy path.
3. **STOP and VALIDATE**: run T006/T007 tests; confirm they pass against the implementation.
4. This alone is a usable increment — an operator/agent can already check provider status, just without the hardened failure handling yet.

### Incremental Delivery

1. Setup + Foundational → primitives ready.
2. Add User Story 1 → test independently → MVP usable.
3. Add User Story 2 → test independently → tool is now safe to expose to an autonomous agent (never throws).
4. Add User Story 3 → test independently → tool gets selected at the right moments.
5. Polish → `typecheck`/`test` green, manual quickstart run.

## Notes

- [P] tasks touch independent test cases or declarations within the same or different files with no ordering dependency.
- Commit after each task or logical group, per constitution "Fluxo de Desenvolvimento" (each task fits in a small, reversible commit).
- Constitution Principle IV requires `typecheck` and `test` green before considering the feature done — T019 is the explicit gate for that.
