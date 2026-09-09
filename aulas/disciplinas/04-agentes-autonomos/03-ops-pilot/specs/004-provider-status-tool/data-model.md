# Phase 1 Data Model: Provider Status Tool

This feature introduces no persisted entities and no changes to `OpsStore` or the domain layer. The "data model" here is limited to the shapes flowing through the tool at runtime.

## Provider (enum, not a stored entity)

| Value | Meaning | Status endpoint |
|---|---|---|
| `github` (default) | GitHub's public status | `https://www.githubstatus.com/api/v2/status.json` |
| `cloudflare` | Cloudflare's public status | `https://www.cloudflarestatus.com/api/v2/status.json` |

## Tool Input

```ts
{
  provider?: "github" | "cloudflare"; // default "github"
}
```

- Validated by a Zod enum schema with `.default("github")` and a `.describe(...)` explaining the two options, per FR-002/FR-003.

## External Response Shape (statuspage.io, validated subset)

```ts
{
  status: {
    indicator: string;    // e.g. "none" | "minor" | "major" | "critical" (treated as opaque string)
    description: string;  // e.g. "All Systems Operational"
  }
  // other fields (page, components, incidents, ...) exist upstream but are ignored
}
```

- Validated with Zod per FR-010; a response that doesn't match this shape (missing/wrong-typed `status.indicator` or `status.description`) is treated as a validation failure → error result.

## Tool Output (the string returned to the caller/agent)

Two possible shapes, both single-line strings (FR-012, FR-011):

- **Success**: `"<provider>: <indicator> — <description>"`
  - Example: `"github: none — All Systems Operational"`
- **Failure**: a short, human-readable error line naming the provider and the failure kind (timeout, network error, invalid response), e.g.:
  - `"github status check failed: request timed out after retry"`
  - `"cloudflare status check failed: invalid response from status API"`

No error ever throws out of the tool function; the tool's return value is always one of the two string shapes above.

## State / Relationships

None. This is a stateless, single-request-per-call operation with no relationship to existing entities (`Alert`, `Incident`, `Service`, `Runbook`).
