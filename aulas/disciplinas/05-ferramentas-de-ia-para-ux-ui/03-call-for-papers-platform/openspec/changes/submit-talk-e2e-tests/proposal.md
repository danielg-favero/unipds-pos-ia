## Why

The talk submission screen (`/talks/submit`) has only Jest/Vitest unit tests. There is no browser-level test that proves a speaker can fill the form and submit it, or that validation feedback shows up. We want a traditional Cypress suite to cover these two flows.

## What Changes

- Add a Cypress e2e spec at `frontend-e2e/src/e2e/talk-submit.cy.ts` with a success scenario and an empty-form error scenario.
- Add Cypress configuration (`cypress.config.ts`, `tsconfig` for Cypress types) to the existing `frontend-e2e` project, which currently only has Playwright.
- Use only plain Cypress APIs (`cy.get()`, `cy.contains()`, `should()`, `cy.intercept()`); no AI/third-party Cypress plugins.
- No changes to application code.

### Assumptions (differences from the request)

- The request mentions Name, Address, Capacity and Date fields; the real form has **Name**, **Talk title** and a **GDE checkbox** (`id="name"`, `id="talkTitle"`, `id="isGDE"`). Tests target the real fields.
- The form uses `novalidate` and Angular custom messages (`Name is required.`, `Talk title is required.`), so "native validation messages" are interpreted as these on-screen messages, not browser bubbles.
- The submit button is disabled while the form is invalid, so the error scenario triggers validation by focusing and blurring the empty fields (touching them) and asserts the messages and the disabled button.
- The app shows no success message; it resets the form after a 2xx from `POST /api/speakers`. "Success" is verified by intercepting that request (stubbed 201), asserting the payload, and asserting the form is reset.
- The folder is `frontend-e2e/` (not `apps/frontend-e2e/`).

## Capabilities

### New Capabilities
- `talk-submit-e2e`: Cypress e2e coverage of the talk submission screen's success and validation-error flows.

### Modified Capabilities
<!-- none -->

## Impact

- New files in `frontend-e2e/` (spec, Cypress config, tsconfig).
- `nx.json`: the `@nx/cypress/plugin` currently infers an `e2e` target that would clash with the Playwright `e2e` target; its target names must be made distinct.
- Dev dependencies `cypress` and `@nx/cypress` are already in `package.json`.
