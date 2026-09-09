# Quickstart: Provider Status Tool

Validates that `check_provider_status` works end-to-end once implemented, per the contract in [contracts/check_provider_status.md](./contracts/check_provider_status.md).

## Prerequisites

- Repo dependencies installed (`npm install`).
- No environment variables or credentials required (the statuspage.io endpoints are keyless).

## Automated validation (primary path)

Run the project test suite, which per FR-014 must cover success, timeout, and invalid-response scenarios using an injected fake fetch (no real network calls):

```sh
npm test
npm run typecheck
```

Expect: all tests pass, including the new tests for `check_provider_status` covering:
1. Success — fake fetch resolves with a valid `{ status: { indicator, description } }` body → tool returns a single-line string containing both values.
2. Timeout — fake fetch never resolves / rejects with an abort-style error on both attempts → tool returns a readable error string, no exception thrown.
3. Invalid response — fake fetch resolves with a body that doesn't match the expected shape → tool returns a readable error string, no exception thrown.

## Manual/exploratory validation (optional, uses real network)

To sanity-check against the real GitHub/Cloudflare status APIs (not part of the automated suite):

```sh
node --import tsx -e "
import { makeCheckProviderStatusTool } from './src/agents/tools.js';
const tool = makeCheckProviderStatusTool();
console.log(await tool.invoke({ provider: 'github' }));
console.log(await tool.invoke({ provider: 'cloudflare' }));
console.log(await tool.invoke({})); // defaults to github
"
```

Expect: each call prints one compact line naming the provider's current indicator and description (e.g. `github: none — All Systems Operational`), returned within a few seconds.

## Outcome

- Confirms the tool is registered/exported, defaults `provider` to `github`, respects the 5s timeout + 1 retry policy, validates responses with Zod, and never throws — matching every functional requirement in [spec.md](./spec.md).
