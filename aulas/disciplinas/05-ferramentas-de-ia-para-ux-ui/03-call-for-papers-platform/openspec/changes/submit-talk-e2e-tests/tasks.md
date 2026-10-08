## 1. Cypress setup in frontend-e2e

- [x] 1.1 Update `@nx/cypress/plugin` options in `nx.json` to use `cypress-e2e` / `cypress-e2e-ci` target names so they don't clash with Playwright's `e2e`
- [x] 1.2 Create `frontend-e2e/cypress.config.ts` (baseUrl `http://localhost:4200`, `specPattern` `src/e2e/**/*.cy.ts`, `nxE2EPreset`)
- [x] 1.3 Add Cypress types to `frontend-e2e/tsconfig.json` (or a `tsconfig.cy.json`) and ensure Playwright's tsconfig/lint still work

## 2. Tests

- [x] 2.1 Create `frontend-e2e/src/e2e/talk-submit.cy.ts` with `beforeEach` that intercepts `POST /api/speakers` (201) and visits `/talks/submit`
- [x] 2.2 Success test: type name and talk title via `#name`/`#talkTitle`, click `button[type="submit"]`, `cy.wait('@submit')`, assert request body, cleared fields and no error alert
- [x] 2.3 Error test: focus/blur empty `#name` and `#talkTitle`, assert "Name is required." and "Talk title is required." via `cy.contains`, submit button disabled, no request sent

## 3. Verification

- [x] 3.1 Run `npx nx run frontend-e2e:cypress-e2e` and confirm both tests pass
- [x] 3.2 Confirm Playwright `example.spec.ts` is unaffected and lint passes for `frontend-e2e`
