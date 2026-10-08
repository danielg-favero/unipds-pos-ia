## Context

NestJS API (`SpeakersController`, in-memory `SpeakersService` which already has `findAll()`) and an Angular standalone frontend using signals, `provideHttpClient()` and `provideRouter(appRoutes)`. The form component uses inline styles driven by global tokens in `frontend/src/styles.css` (light/dark via `prefers-color-scheme`). Existing form route: `talks/submit`.

## Goals / Non-Goals

**Goals:** read-only list endpoint; dashboard with signal state; visual parity with the form; route + navigation.
**Non-Goals:** auth, pagination, sorting/filtering, edit/delete, persistence, new shared types.

## Decisions

- **Endpoint**: add `@Get() findAll(): SpeakerDTO[]` to `SpeakersController` delegating to `speakersService.findAll()` (returns a copy). No new module/DTO.
- **Component**: `CfpDashboardComponent` in `frontend/src/app/cfp-dashboard/`, standalone, `OnPush`, inline template/styles like the form. State: `speakers = signal<SpeakerDTO[]>([])`, plus `loading` and `error` signals. Fetch with `inject(HttpClient).get<SpeakerDTO[]>('/api/speakers')` on construction/`ngOnInit`.
- **Markup**: `<table>` with `<caption>`, `<thead>` `<th scope="col">`, GDE shown as text ("Yes"/"No"), not color alone. Wrapper allows horizontal scroll on narrow screens. Empty/loading/error rendered with `@if`, error in `role="alert"`.
- **Styling**: card container copying the form's `background: var(--surface); border; border-radius; box-shadow`, header text `var(--muted)`, row borders `var(--border)`, focus `3px solid var(--primary)`. No new colors or tokens. Alternative considered: card list; rejected since the data is tabular.
- **Routing**: add `{ path: 'dashboard', component: CfpDashboardComponent }`. Component imported eagerly, consistent with the existing route (lazy loading is unnecessary at this size).
- **Navigation**: `<a routerLink="/dashboard">` in the form (links are the correct semantic for navigation), styled as a secondary button using tokens (outlined `--primary` on `--surface`) so it doesn't compete with the submit button. The dashboard gets a mirrored link back to `/talks/submit`.
- **Assumption**: no default redirect is added for `/`; out of scope.

## Risks / Trade-offs

- In-memory store: list is empty after API restart → documented, empty state handles it.
- Dashboard is publicly readable (no auth exists yet) → acceptable for this stage; flag if auth is added later.
- Duplicated card/button styles between components → acceptable now; extract to global styles if a third screen appears.
