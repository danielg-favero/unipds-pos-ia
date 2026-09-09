# Feature Specification: Provider Status Tool

**Feature Branch**: `004-provider-status-tool`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Tool de status de provedores externos: Tool check_provider_status src/agents/tools.ts consulta a statuspage pública do provedor via API statuspage.io (sem chave): github -> https://www.githubstatus.com/api/v2/status.json, cloudflare -> https://www.cloudflarestatus.com/api/v2/status.json. Parâmetro provider(enum: github | cloudflare, default 'github', .describe explicando isso). Descrição orientada a quando usar: suspeita de problema externo, 'é o nosso ou do provedor?', dependência fora do ar. Resiliência: timeout de 5s via AbortSignal.timeout; falha de rede ou 5xx, UMA nova tentativa; resposta validada com zod ({ status: {indicador, description} }); qualquer falha final retorna string de erro legível como resultado da tool (erro é observação - nunca lança exceção para fora da tool). Retorno compacto (indicador + descrição, uma linha), para não inflar o contexto. Teste: a função de fetch é injetável; testes cobrem sucesso, timeout e resposta inválida sem uso de rede (fake fetch)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Check whether an outage is external (Priority: P1)

An operator (human or the agent itself, during an incident investigation) needs to quickly determine whether a problem they're seeing is caused by their own system or by an external provider (GitHub, Cloudflare) that the system depends on. They invoke the provider status check and get a compact, immediate answer describing the provider's current operational status.

**Why this priority**: This is the entire purpose of the feature — without it, there is no way to distinguish "our bug" from "their outage" during triage, which is the single highest-value moment for this tool.

**Independent Test**: Can be fully tested by calling the tool with `provider: "github"` (or leaving it at its default) against a real or faked GitHub status endpoint and confirming a compact, human-readable status line is returned.

**Acceptance Scenarios**:

1. **Given** the GitHub status API is reachable and returns a healthy status, **When** the tool is called with no provider specified, **Then** it returns a single-line result showing GitHub's status indicator and description.
2. **Given** the Cloudflare status API is reachable and returns a degraded status, **When** the tool is called with `provider: "cloudflare"`, **Then** it returns a single-line result showing Cloudflare's status indicator and description.

---

### User Story 2 - Get a clear answer even when the check itself fails (Priority: P2)

While investigating an incident, the network path to the status provider may itself be slow, down, or return something unexpected. The caller still needs a usable, non-crashing result rather than an unhandled exception, so that an automated agent invoking this tool as one step among many does not have its whole run aborted.

**Why this priority**: Reliability of the tool's failure mode is what makes it safe to expose to an autonomous agent; without graceful degradation the tool could destabilize any workflow that calls it.

**Independent Test**: Can be fully tested by simulating a timeout, a 5xx response, and a malformed response body (via an injected fake fetch) and confirming each case yields a readable error string as the tool's result rather than a thrown exception.

**Acceptance Scenarios**:

1. **Given** the status endpoint does not respond within 5 seconds, **When** the tool is called, **Then** it retries the request exactly once and, if it still fails, returns a readable error string as its result (no exception propagates).
2. **Given** the status endpoint returns a 5xx error on the first attempt and a valid response on the retry, **When** the tool is called, **Then** it returns the valid status result from the retry.
3. **Given** the status endpoint returns a response body that does not match the expected shape, **When** the tool is called, **Then** it returns a readable error string as its result (no exception propagates).

---

### User Story 3 - Know when to reach for this tool (Priority: P3)

An agent deciding which tool to use during an investigation needs the tool's own description to make clear that it should be used when there's suspicion of an external issue ("is it us or the provider?") or when a dependency appears to be down — so the tool gets selected at the right moments without the operator having to explain it each time.

**Why this priority**: Correct tool selection is what makes the capability actually get used in practice; a technically correct tool with a vague description won't be invoked when it matters.

**Independent Test**: Can be verified by inspecting the tool's registered description text and confirming it names the triggering situations (suspected external issue, "is it us or the provider", dependency appears down).

**Acceptance Scenarios**:

1. **Given** the tool registry/definition is inspected, **When** its description is read, **Then** it explicitly states it should be used when an external issue is suspected, when the question "is it us or the provider" arises, or when a dependency appears to be unavailable.

---

### Edge Cases

- What happens when `provider` is omitted? The tool defaults to `github`.
- What happens when the provider's response is valid JSON but missing the expected `status.indicator`/`status.description` fields? Treated as an invalid response and reported as a readable error result.
- What happens when the first attempt fails with a network error (not just 5xx)? A network failure also triggers the single retry, same as a 5xx.
- What happens if both the initial attempt and the retry fail? The tool returns a single readable error string; no exception is thrown out of the tool.
- What happens if the retry itself times out? It is treated as a final failure and reported as a readable error result.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a tool named `check_provider_status` that reports the current operational status of a supported external provider.
- **FR-002**: The tool MUST accept a `provider` parameter restricted to the values `github` and `cloudflare`, defaulting to `github` when omitted.
- **FR-003**: The `provider` parameter MUST carry a description explaining what selecting each value means (i.e., which provider it checks).
- **FR-004**: The tool's own description MUST indicate it is intended for use when an external problem is suspected, when determining whether an issue is internal or provider-caused, or when a dependency appears unavailable.
- **FR-005**: For `provider: "github"`, the system MUST query `https://www.githubstatus.com/api/v2/status.json`.
- **FR-006**: For `provider: "cloudflare"`, the system MUST query `https://www.cloudflarestatus.com/api/v2/status.json`.
- **FR-007**: The system MUST NOT require any API key or credential to perform the status check.
- **FR-008**: Each request to the provider's status endpoint MUST be bounded by a 5-second timeout.
- **FR-009**: On a network failure or an HTTP 5xx response, the system MUST perform exactly one retry of the request before giving up.
- **FR-010**: The response body MUST be validated against the expected shape (an object containing `status.indicator` and `status.description`); a response that fails validation MUST be treated as a failure.
- **FR-011**: Any failure that persists after the retry (timeout, network error, 5xx, or invalid response shape) MUST result in the tool returning a readable error string as its result value, and MUST NOT throw an exception out of the tool.
- **FR-012**: On success, the tool MUST return a compact, single-line result containing the provider's status indicator and status description.
- **FR-013**: The function responsible for performing the HTTP fetch MUST be injectable/replaceable, so that tests can supply a fake implementation without making real network calls.
- **FR-014**: Automated tests MUST cover: a successful status check, a timeout scenario, and an invalid/malformed response scenario — all without performing real network requests.

### Key Entities

- **Provider Status Result**: The compact outcome of a status check — includes an indicator (e.g., operational/degraded/outage) and a short description, condensed to one line for the caller.
- **Provider**: One of the two supported external services (`github`, `cloudflare`), each associated with its own public status endpoint.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator or agent can determine a supported provider's current status in a single tool call, with a result returned in one line of text.
- **SC-002**: 100% of failure conditions (timeout, network error, malformed response, repeated 5xx) result in a readable error message rather than an unhandled exception, across the full automated test suite.
- **SC-003**: A slow or unresponsive provider endpoint never delays the calling workflow by more than approximately 10 seconds (5s timeout plus one 5s retry) before a result — success or error — is returned.
- **SC-004**: All test scenarios (success, timeout, invalid response) run without making any real network request.

## Assumptions

- Only GitHub and Cloudflare are in scope for this feature; adding further providers is out of scope for this spec.
- "Readable error string" means a short, human-legible message describing what went wrong (e.g., which provider, timeout vs. invalid response), not a raw exception dump or stack trace.
- The retry is a single, immediate retry with no additional backoff delay specified beyond the existing per-request timeout.
- The provider's status page schema is assumed stable enough that `status.indicator` and `status.description` are the only fields consumed; other fields in the response are ignored.
- No authentication, rate-limit handling, or caching of provider status is required for v1.
