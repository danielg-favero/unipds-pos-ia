# Phase 0 Research: Provider Status Tool

No `NEEDS CLARIFICATION` markers remained after `/speckit-specify`. This document records the concrete technical decisions taken while turning the spec into an implementable plan.

## Decision: Timeout mechanism

- **Decision**: Use `fetch(url, { signal: AbortSignal.timeout(5000) })`.
- **Rationale**: `AbortSignal.timeout()` is a built-in Node global (available since Node 17.3, well within this project's Node 24 LTS baseline) — no extra dependency needed, and it's exactly what the user specified.
- **Alternatives considered**: Manual `setTimeout` + `AbortController` — rejected as unnecessary boilerplate `AbortSignal.timeout` already covers.

## Decision: Retry policy

- **Decision**: On network error (fetch throws) or HTTP status >= 500, perform exactly one retry (i.e., at most 2 total attempts), immediately, no backoff delay.
- **Rationale**: Explicitly required by the feature description; keeps worst-case latency bounded (~2 × 5s ≈ 10s) which is acceptable for an interactive/agent-invoked diagnostic tool.
- **Alternatives considered**: Exponential backoff / multiple retries — rejected as over-engineering for a tool whose entire value is a fast "is it them" answer; multiple retries would blow past a reasonable response-time budget.

## Decision: Response validation shape

- **Decision**: Validate with a Zod schema equivalent to:
  ```ts
  z.object({
    status: z.object({
      indicator: z.string(),
      description: z.string(),
    }),
  });
  ```
  Only `status.indicator` and `status.description` are consumed; other fields in the statuspage.io payload (e.g. `page`, `components`) are ignored/unvalidated.
- **Rationale**: Matches the shape given in the feature description and the actual statuspage.io `summary`/`status.json` response format (`{ page: {...}, status: { indicator, description } }`). Keeping the schema minimal avoids brittleness if statuspage.io adds unrelated fields.
- **Alternatives considered**: Validating the full statuspage.io schema (components, incidents, page metadata) — rejected as unnecessary; the tool only ever surfaces the top-level indicator/description line.

## Decision: Error handling strategy (not routed through `asToolResult`)

- **Decision**: `check_provider_status` uses its own local try/catch around the fetch+parse+validate sequence, catching everything (network errors, `AbortError`/timeout, non-OK-after-retry, Zod validation failure) and always resolving to a string (either the success line or an error line) — never propagating a thrown exception out of the tool callback.
- **Rationale**: See Constitution Check / Complexity Tracking in `plan.md`. The shared `asToolResult` helper only translates `isDomainError` failures and rethrows anything else, which is the wrong shape for an external-HTTP-call tool that must swallow *all* failure modes per FR-011.
- **Alternatives considered**: Force-fit failures into `DomainError` to reuse `asToolResult` — rejected, conflates infrastructure failure with domain-rule failure and complicates the existing error taxonomy for no real benefit.

## Decision: Fetch injection mechanism

- **Decision**: `makeTools` (or a new factory, e.g. `makeProviderStatusTool`) accepts an optional `fetchImpl: typeof fetch` parameter defaulting to the global `fetch`, mirroring how `store: OpsStore` is already injected into `makeTools`.
- **Rationale**: FR-013 requires the fetch function to be injectable for tests without real network calls; a default-parameter injection is the smallest change consistent with the existing dependency-injection style already used for `store`.
- **Alternatives considered**: Module-level mockable singleton / monkey-patching global `fetch` in tests — rejected as it fights Node's ESM module system and is less explicit than parameter injection.

## Decision: Provider → URL mapping

- **Decision**: A small internal `Record<"github" | "cloudflare", string>` (or equivalent switch) maps the `provider` enum to its statuspage.io URL:
  - `github` → `https://www.githubstatus.com/api/v2/status.json`
  - `cloudflare` → `https://www.cloudflarestatus.com/api/v2/status.json`
- **Rationale**: Directly specified by the feature description; keeps provider→URL mapping colocated with the tool, easy to extend later if more providers are added (explicitly out of scope for this feature per Assumptions).
- **Alternatives considered**: External config file for provider URLs — rejected as premature for a two-entry, rarely-changing mapping.

## Output

All unknowns resolved; no `NEEDS CLARIFICATION` markers remain. Proceeding to Phase 1.
