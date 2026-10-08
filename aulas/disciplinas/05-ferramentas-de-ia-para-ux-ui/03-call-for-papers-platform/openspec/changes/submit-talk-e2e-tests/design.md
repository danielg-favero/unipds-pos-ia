## Context

`frontend-e2e` is a Playwright project (`playwright.config.mts`, `src/example.spec.ts`). `cypress` and `@nx/cypress` are installed, and `nx.json` registers `@nx/cypress/plugin` with target `e2e`, which collides with the Playwright plugin's `e2e`. The frontend dev server proxies `/api` to `localhost:3001`. See proposal.md for the form-field assumptions.

## Goals / Non-Goals

**Goals:** Two Cypress specs (success, empty form) runnable via Nx; independent of the API server.
**Non-Goals:** Migrating or removing Playwright; testing the dashboard; any app code changes; AI plugins.

## Decisions

- **Coexist with Playwright**: keep `example.spec.ts` as is; rename the Cypress plugin targets in `nx.json` (`e2e` → `cypress-e2e`, `ciTargetName` → `cypress-e2e-ci`) so they do not clash. Cypress `specPattern` is `src/e2e/**/*.cy.ts`, so Playwright files are ignored.
- **Cypress config**: `frontend-e2e/cypress.config.ts` with `baseUrl` `http://localhost:4200`, using `nxE2EPreset(__filename)` from `@nx/cypress/plugins/cypress-preset`, which wires `webServerCommands` to the frontend serve target.
- **Stub the API**: `cy.intercept('POST', '/api/speakers', { statusCode: 201, body: {...} }).as('submit')` so tests are deterministic and need no backend.
- **Success assertion**: `cy.wait('@submit')` then check `request.body` equals `{ name, talkTitle, isGDE: false }` and `#name`/`#talkTitle` have value `''`. Rationale: the UI has no success banner.
- **Error scenario**: `cy.get('#name').focus().blur()` (same for `#talkTitle`), then `cy.contains('Name is required.')`, `cy.contains('Talk title is required.')`, `button[type="submit"]` `should('be.disabled')`, and an intercept alias asserted with `cy.get('@submit.all').should('have.length', 0)`.
- **Selectors**: `#name`, `#talkTitle`, `#isGDE`, `button[type="submit"]`.

## Risks / Trade-offs

- Stubbed API means the real API contract is not exercised → acceptable; covered by API tests.
- Renaming Cypress targets changes plugin-inferred names → nothing else uses them yet.
