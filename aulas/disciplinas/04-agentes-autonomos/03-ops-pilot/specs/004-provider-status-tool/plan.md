# Implementation Plan: Provider Status Tool

**Branch**: `004-provider-status-tool` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-provider-status-tool/spec.md`

## Summary

Add a new agent tool, `check_provider_status`, to `src/agents/tools.ts` that lets an operator or the agent itself check whether GitHub or Cloudflare (statuspage.io-backed) is having an outage, to distinguish "our bug" from "their outage" during incident triage. The tool takes an optional `provider` enum (`github` | `cloudflare`, default `github`), fetches the provider's public `status.json` with a 5s timeout and one retry on network error or 5xx, validates the body with Zod, and returns a compact one-line status string. Any failure (timeout, network error, repeated 5xx, invalid shape) is caught inside the tool and returned as a readable error string — never thrown — matching the existing `asToolResult` pattern already used by the other tools in the file. The fetch function is injected so tests can fake it without real network calls.

## Technical Context

**Language/Version**: TypeScript (ESM, `strict: true`) on Node 24 LTS

**Primary Dependencies**: `@langchain/core` (`tool()` helper), `zod` (schema + response validation)

**Storage**: N/A — this tool makes no persistence calls; it is a pure external HTTP check

**Testing**: `node:test` via `tsx` (`npm test`), following the existing pattern in `src/agents/tools.test.ts`; fetch is injected so no real network calls occur in tests

**Target Platform**: Node.js server process (existing OpsPilot agent runtime)

**Project Type**: Single project (existing `src/` layout — this is an addition to an existing module, not a new project)

**Performance Goals**: N/A beyond the stated timeout/retry bound; not a throughput-sensitive path

**Constraints**: Per-request timeout 5s via `AbortSignal.timeout(5000)`; at most one retry on network failure or 5xx; total worst case ~10s before returning a result; no API key/credential required; result string stays compact (single line) to avoid inflating agent context

**Scale/Scope**: One new tool function, its Zod schemas (input param + response shape), and its test file; no changes to other tools, store, or domain layers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Camadas Explícitas**: The tool lives in `src/agents/tools.ts`, the same layer as the other agent-facing tools. It performs I/O directly (an outbound HTTP fetch), which is consistent with how tools already function as the boundary layer that talks to the `OpsStore` port — here the "port" is simply `fetch`, injected the same way `store` is injected into `makeTools`. No domain logic performs I/O; the tool itself *is* the I/O boundary, as the other tools already are relative to the store. **PASS**.
- **II. Validações na Fronteira**: The response body from the external API is untrusted external input and MUST be validated with Zod before use — this is explicitly required by FR-010. **PASS** (by design).
- **III. Erros são de Domínio**: Failures here (timeout, network error, invalid shape) are not domain errors in the `isDomainError`/`errorMessage` sense used elsewhere (those model business-rule failures like "incident not found"). This is an external-system failure, conceptually closer to an infrastructure error. The existing `asToolResult` helper only catches `isDomainError` and rethrows everything else — it does not fit this tool's need to catch *all* failure modes and always return a string. The tool will therefore use its own local try/catch (per FR-011), not `asToolResult`. This is a narrow, justified deviation — see Complexity Tracking. **PASS with justification**.
- **IV. Teste é Parte da Tarefa**: New tests will be added covering success, timeout, and invalid-response scenarios per FR-014, with `typecheck` and `test` green before considering the task done. **PASS**.
- **V. Segurança por Padrão**: No secrets involved (public, keyless API); no destructive action; nothing reads `.env`. **PASS**.
- **VI. Funções Puras**: The HTTP fetch is the necessary side effect, isolated behind an injectable `fetchImpl` parameter (mirrors `store` injection), keeping the parsing/formatting logic around it pure and unit-testable without network access. **PASS**.

No unjustified violations. One narrow, documented deviation from the shared `asToolResult` error-translation helper (see Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/004-provider-status-tool/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── tools.ts          # Add check_provider_status tool + its Zod schemas here
│   └── tools.test.ts     # Add success/timeout/invalid-response tests here
├── domain/
├── store/
└── ...                    # unchanged
```

**Structure Decision**: Single project, existing layout. This feature only adds to the existing `src/agents/tools.ts` and `src/agents/tools.test.ts` files already present in the repo — no new top-level directories, no new project boundary. It is agent-runtime code (not domain, not store), so it lives entirely in `src/agents/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| `check_provider_status` does not use the shared `asToolResult` error-translation helper (Principle III normally routes tool failures through domain-error translation) | FR-011 requires *every* failure mode of an external HTTP call (timeout, network error, 5xx after retry, invalid Zod shape) to become a readable string result, never a thrown exception. `asToolResult` only catches `isDomainError` and rethrows anything else, which would let a `TypeError`/`DOMException` from `fetch`/`AbortSignal.timeout` escape as an unhandled exception — exactly what this tool must prevent. | Wrapping the external-call failures in a synthetic `DomainError` just to satisfy `asToolResult` was considered and rejected: these are not domain-rule failures (no business invariant is violated), and forcing them through `isDomainError` would blur the distinction Principle III draws between predictable domain failures and infrastructure failures, making the error model harder to reason about elsewhere. A small local try/catch, scoped to this one tool, keeps the deviation contained and explicit. |
