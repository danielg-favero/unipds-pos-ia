## 1. Backend

- [x] 1.1 Add `@Get() findAll(): SpeakerDTO[]` to `api/src/app/speakers/speakers.controller.ts` calling `speakersService.findAll()`
- [x] 1.2 Add controller tests: empty array, and array after `create` calls (`speakers.controller.spec.ts`)

## 2. Dashboard component

- [x] 2.1 Create `frontend/src/app/cfp-dashboard/cfp-dashboard.component.ts` (standalone, OnPush) with `speakers = signal<SpeakerDTO[]>([])`, `loading`, `error` signals and `HttpClient.get<SpeakerDTO[]>('/api/speakers')`
- [x] 2.2 Build semantic template: `<table>` with caption and `th scope="col"`, GDE as text, loading/empty/error (`role="alert"`) states, link back to `/talks/submit`
- [x] 2.3 Style with existing tokens only, mirroring the form's card, borders, radius, focus ring; make table scroll horizontally on small screens
- [x] 2.4 Add `cfp-dashboard.component.spec.ts` covering list, empty and error states (using `HttpTestingController`)

## 3. Routing and navigation

- [x] 3.1 Add `{ path: 'dashboard', component: CfpDashboardComponent }` to `frontend/src/app/app.routes.ts`
- [x] 3.2 Add `RouterLink` to `TalkSubmissionFormComponent` imports, add the "View dashboard" link and tokenized secondary-button styles
- [x] 3.3 Extend form spec to assert the link targets `/dashboard`

## 4. Verification

- [x] 4.1 Run lint, unit tests for `api` and `frontend`, and build via Nx
- [ ] 4.2 Manually verify in light and dark themes: submit a talk, open the dashboard, navigate back and forth with keyboard only
