## Why

Speakers can submit talks, but nobody can see what has been submitted. Organizers need a read-only dashboard listing all submitted talks, reachable from the submission form.

## What Changes

- Add `GET /api/speakers` to the existing `SpeakersController`, returning `SpeakerDTO[]` via the already-existing `SpeakersService.findAll()`.
- Add a standalone `CfpDashboardComponent` that loads the list with `HttpClient` and holds it in a `WritableSignal<SpeakerDTO[]>`, rendered as a semantic `<table>`.
- Register the route `dashboard` in `app.routes.ts`.
- Add a navigation link/button to the dashboard in the talk submission form, styled with the same design tokens (`--primary`, `--surface`, `--border`, `--radius`, etc.) as the form.

Note: the request refers to `CfpController` and `CfpFormComponent`; in the codebase these are `SpeakersController` (`api/src/app/speakers/`) and `TalkSubmissionFormComponent` (`frontend/src/app/talk-submission/`). The plan targets those.

## Capabilities

### New Capabilities
- `cfp-dashboard`: listing of submitted talks (API read endpoint and dashboard UI, including navigation to it).

### Modified Capabilities
<!-- None: cfp-submission requirements are unchanged; the form only gains a navigation link. -->

## Impact

- `api/src/app/speakers/speakers.controller.ts` (+ spec): new GET handler.
- `frontend/src/app/cfp-dashboard/` (new component + spec), `frontend/src/app/app.routes.ts`, `frontend/src/app/talk-submission/talk-submission-form.component.ts` (link + styles).
- No new dependencies; no change to `shared-types`. Storage remains in-memory, so the list resets on API restart.
