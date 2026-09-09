# Contract: `check_provider_status` agent tool

This is a LangChain agent tool (per the existing pattern in `src/agents/tools.ts`), not an HTTP endpoint — the "contract" here is the tool's schema and behavior as seen by the calling agent/LLM and by tests.

## Name

`check_provider_status`

## Description (surfaced to the agent for tool selection)

Must communicate, per FR-004:
- Checks the public operational status of an external provider (GitHub or Cloudflare).
- Use when: an external issue is suspected, when answering "é o nosso ou do provedor?" / "is it us or the provider?", or when a dependency appears to be down.

## Input Schema (Zod)

```ts
z.object({
  provider: z
    .enum(["github", "cloudflare"])
    .default("github")
    .describe(
      "Provedor externo a verificar: 'github' (GitHub, padrão) ou 'cloudflare' (Cloudflare)."
    ),
});
```

## Behavior

1. Resolve `provider` → status URL (see [data-model.md](../data-model.md)).
2. Attempt `fetchImpl(url, { signal: AbortSignal.timeout(5000) })`.
3. If the attempt throws (network error/timeout) or resolves with `status >= 500`: retry once, identically.
4. If the (possibly retried) response is not OK, or throws again: return a readable error string. **Do not throw.**
5. Parse response body as JSON; validate with the Zod schema from [data-model.md](../data-model.md).
   - On parse/validation failure: return a readable error string. **Do not throw.**
6. On success: return a compact single-line string: `"<provider>: <indicator> — <description>"`.

## Output

Always a `string` (per the tool-calling convention already used in this file — other tools return JSON-stringified `{ ok, data|error }`; this tool instead returns a plain compact line directly, since FR-012 requires a compact single-line result rather than a JSON envelope, and FR-011 requires the *same* string return path for both success and failure — no thrown exceptions).

| Outcome | Return value shape |
|---|---|
| Success | `"github: none — All Systems Operational"` |
| Timeout (after 1 retry) | `"github status check failed: request timed out"` |
| Network error (after 1 retry) | `"github status check failed: network error"` |
| 5xx (after 1 retry) | `"github status check failed: provider returned an error"` |
| Invalid response shape | `"github status check failed: unexpected response format"` |

Exact wording is an implementation detail; the contract guaranteed to callers/tests is: **always a string, always names the provider, always names the failure kind on failure, never throws.**

## Injection point (for tests)

The tool factory accepts an optional fetch implementation:

```ts
function makeCheckProviderStatusTool(fetchImpl: typeof fetch = fetch) { ... }
```

Tests pass a fake `fetchImpl` (e.g. `async () => new Response(...)` or one that rejects/hangs) to exercise success, timeout, and invalid-response paths without real network I/O (FR-013, FR-014).
