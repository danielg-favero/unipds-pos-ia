# Design

## Context

Nx monorepo with three relevant projects: `api` (NestJS 11), `frontend` (Angular 22), `shared-types` (plain TS lib, no validation library yet). `api/src/app/app.module.ts` currently has no feature modules; `api/src/main.ts` has no `ValidationPipe` configured. `frontend/src/app/app.routes.ts` is empty and `app.config.ts` only provides the router and global error listeners. `shared-types` currently exports a plain `SpeakerDTO` interface with no decorators or runtime validation. See proposal.md - Why / What Changes.

## Goals / Non-Goals

**Goals:**
- Define one shared, decorated class both `api` and `frontend` compile against as the runtime source of truth for validation.
- Make the API reject invalid submissions with `400` using NestJS's built-in `ValidationPipe`, no hand-rolled validation.
- Make the Angular form's submit affordance fully driven by Signals, with no hidden component state.
- Meet WAI-ARIA basics (label association, live-region error announcement, disabled-state semantics) without pulling in a UI library.

**Non-Goals:**
- No persistence layer (DB) — the API service holds submissions in memory for this change; storage is a future capability.
- No authentication/authorization for submitters.
- No listing/review UI for organizers — only the submission path.
- No CFP deadline/window logic.

## Decisions

**1. Validation contract lives in `shared-types` as a class, not an interface.**
`class-validator` decorators only work on classes, and NestJS's `ValidationPipe` needs a class (via `@Body() dto: SubmitTalkDto`) to instantiate and validate against. The existing `SpeakerDTO` interface stays as the plain read-shape contract; a new `SubmitTalkDto` class in `shared-types/src/lib/submit-talk.dto.ts` carries the decorators and is what both apps import for the submission flow. Alternative considered: duplicate a validation class inside `api` only — rejected because it breaks the "both consume the same contract" requirement and risks drift.

**2. `class-validator`/`class-transformer` become dependencies of `shared-types`, not just `api`.**
Since the decorated class lives in `shared-types`, that package needs the decorators at compile time. `frontend` only needs the class shape (decorators are inert in the browser bundle; no server-side validation logic runs there), so no extra runtime cost. Alternative considered: keep `shared-types` decorator-free and duplicate a validated DTO in `api` — rejected per decision 1.

**3. Global `ValidationPipe` in `api/src/main.ts`, not a per-route pipe.**
`whitelist: true` and `forbidNonWhitelisted: true` give the "unknown fields rejected" and "wrong type rejected" behavior from the spec for every current and future endpoint, with `transform: true` so `@Body()` yields a real `SubmitTalkDto` instance. Alternative considered: apply `@UsePipes(new ValidationPipe())` only on the speakers controller — rejected as it doesn't scale to future endpoints and is easy to forget.

**4. New `SpeakersModule` (controller + service) registered in `AppModule`.**
Keeps the submission feature isolated from the placeholder `AppController`/`AppService` rather than bolting the endpoint onto them. In-memory storage lives in `SpeakersService` for now (see Non-Goals).

**5. Angular: one standalone `TalkSubmissionFormComponent` using Signals for all state.**
State needed: form field values (via Angular's typed Reactive Forms, which the component reads into signals) or a pure Signal-based form — this change uses Angular's `FormGroup` for field-level validation (required, minLength) bound to a `submitting = signal(false)` and a computed `canSubmit = computed(...)` combining form validity and `!submitting()`. The submit button's `[disabled]` binds to `!canSubmit()`. This avoids reinventing form validation while keeping submission/loading/error state in Signals as required. Alternative considered: fully custom Signal-based form (no `FormGroup`) — rejected as unnecessary complexity for a single form with standard field validation; Signals still own the state the spec and task list actually care about (initial disabled state, in-flight disabling).
- ARIA: submit error rendered in an element with `role="alert"` (implicit `aria-live="assertive"`); each invalid field gets `aria-invalid="true"` and `aria-describedby` pointing at its error message element.

**6. HTTP call via Angular's `HttpClient`, injected with `provideHttpClient()` added to `app.config.ts`.**
Standard, minimal addition; no interceptors needed yet.

## Risks / Trade-offs

- [In-memory API storage loses data on restart] → Acceptable for this change; a persistence capability is explicitly out of scope and can be layered in later behind the same `SpeakersService` interface.
- [Reusing Angular Reactive Forms alongside Signals could be seen as mixing paradigms] → Mitigated by keeping all *submission-flow* state (submitting, error, canSubmit) in Signals/computed, which is what the spec's scenarios and the required tests actually assert on.
- [`shared-types` gaining a runtime dependency (`class-validator`) it didn't have before] → Small, well-established dependency; only used for decorator metadata, not evaluated at import time in the browser.
