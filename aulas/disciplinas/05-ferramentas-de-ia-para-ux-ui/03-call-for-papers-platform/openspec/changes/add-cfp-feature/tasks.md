# Tasks

## 1. Shared contract

- [ ] 1.1 Add `class-validator`/`class-transformer` as dependencies of `shared-types` (and `api` if not already present via Nest) and verify `npx nx build shared-types` succeeds
- [ ] 1.2 Create `SubmitTalkDto` class in `shared-types/src/lib/submit-talk.dto.ts` with `class-validator` decorators for `name` (string, required), `talkTitle` (string, required), `isGDE` (boolean, required), matching `SpeakerDTO`'s shape, and export it from `shared-types/src/index.ts`; verify `npx nx test shared-types` passes

## 2. API: validation and endpoint

- [ ] 2.1 Enable a global `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`) in `api/src/main.ts` and verify `npx nx build api` succeeds
- [ ] 2.2 Create `SpeakersModule` with `SpeakersController` (`POST /speakers` using `@Body() dto: SubmitTalkDto`) and `SpeakersService` (in-memory store) under `api/src/app/speakers/`, and register `SpeakersModule` in `api/src/app/app.module.ts`
- [ ] 2.3 Add `api/src/app/speakers/speakers.controller.spec.ts` with Jest tests asserting: a valid `SubmitTalkDto` payload is accepted and returned; a payload missing `talkTitle` is rejected with `400`; a payload with `isGDE` as a wrong type is rejected with `400`; a payload with an extra unknown field is rejected with `400` — verify `npx nx test api` passes
- [ ] 2.4 Add `api/src/app/speakers/speakers.service.spec.ts` covering the service's create/list behavior in isolation from HTTP concerns and verify `npx nx test api` passes

## 3. Frontend: talk submission form

- [x] 3.1 Add `provideHttpClient()` to `frontend/src/app/app.config.ts` and verify `npx nx build frontend` succeeds
- [x] 3.2 Create standalone `TalkSubmissionFormComponent` in `frontend/src/app/talk-submission/talk-submission-form.component.ts` using a Reactive `FormGroup` for field validation plus `submitting = signal(false)`, `error = signal<string | null>(null)`, and `canSubmit = computed(() => this.form.valid && !this.submitting())`; bind the submit button's `disabled` to `!canSubmit()`
- [x] 3.3 Add WAI-ARIA attributes: `<label>`/`for` (or `aria-label`) for each field, `aria-invalid` and `aria-describedby` on invalid fields, and a `role="alert"` region that renders `error()` so assistive tech announces submission failures
- [x] 3.4 Implement submit handling: on valid submit, set `submitting.set(true)`, POST the `SubmitTalkDto` via `HttpClient` to `/api/speakers`, clear `error` and reset the form on success, set `error` and re-enable the form on failure, and always reset `submitting` to `false` when the request settles
- [x] 3.5 Register `TalkSubmissionFormComponent` in `frontend/src/app/app.routes.ts` under a `talks/submit` (or similar) path
- [x] 3.6 Add `frontend/src/app/talk-submission/talk-submission-form.component.spec.ts` with Jest/Angular Testing Library-style tests asserting: on initial render the submit button is disabled and `canSubmit()` is `false`; after filling all required fields with valid values the submit button becomes enabled; while a submission is in flight the submit button is disabled again — verify `npx nx test frontend` passes

## 4. Integration check

- [ ] 4.1 Run `npx nx run-many -t test` for `shared-types`, `api`, and `frontend` and verify all suites pass, confirming the end-to-end contract (shared DTO → API validation → form state) is consistent
