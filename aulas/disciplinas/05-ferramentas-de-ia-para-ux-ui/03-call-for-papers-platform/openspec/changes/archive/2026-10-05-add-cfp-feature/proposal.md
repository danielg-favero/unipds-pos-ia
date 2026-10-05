# Proposal

## Why

The platform currently has only scaffolded Nx apps (`frontend`, `api`) with no domain functionality. Speakers need a way to submit talk proposals so the event's Call for Papers (CFP) process can begin collecting submissions. This is the first domain feature of the platform and establishes the pattern (shared DTO, validated API, accessible form) that later CFP features (review, scheduling) will build on.

## What Changes

- Add a `POST /api/speakers` endpoint (NestJS) that accepts a talk submission payload, validates it strictly with `class-validator` via `@Body()`, and rejects invalid payloads with `400 Bad Request`.
- Extend the shared `SpeakerDTO` contract in `shared-types` (or add a companion submission DTO) with `class-validator` decorators so both `frontend` and `api` consume the same validated shape.
- Add a talk submission form in Angular (`frontend`) as a standalone component, using Signals for local form/submission state, with WAI-ARIA attributes for accessible labeling, error announcement, and disabled/busy button states.
- Wire the submission form to call the new API endpoint and reflect success/error state via Signals.
- Add Jest unit tests: NestJS tests asserting invalid payloads are rejected with `400`; Angular tests asserting the initial Signal state and that the submit button is disabled until the form is valid/not-submitting.

## Capabilities

### New Capabilities
- `cfp-submission`: Speaker talk submission for the Call for Papers — the shared submission contract, the API endpoint that validates and accepts submissions, and the Angular form that collects and submits them.

### Modified Capabilities
(none — no pre-existing specs in this project)

## Impact

- `shared-types/src/lib/speaker.dto.ts` (and/or a new `submit-talk.dto.ts`): add `class-validator` decorators, export from `shared-types/src/index.ts`.
- `api/src/app/app.module.ts`: register a new `SpeakersModule` (controller + service).
- `api/src/main.ts`: enable a global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) so invalid payloads are rejected with 400.
- `frontend/src/app/`: new standalone `TalkSubmissionForm` component + route entry in `app.routes.ts`.
- New dependency: `class-validator` and `class-transformer` in `api` (and available to `shared-types` if decorators live there).
- Jest test suites added under `api/src/app/speakers/*.spec.ts` and `frontend/src/app/talk-submission/*.spec.ts`.
