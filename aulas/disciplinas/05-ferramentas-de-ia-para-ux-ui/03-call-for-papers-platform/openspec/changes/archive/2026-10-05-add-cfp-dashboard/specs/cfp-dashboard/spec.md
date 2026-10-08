## ADDED Requirements

### Requirement: API lists submitted talks
The system SHALL expose `GET /api/speakers` returning a JSON array of `SpeakerDTO` containing every talk submitted so far, or an empty array when none exist.

#### Scenario: Submissions exist
- **WHEN** a client requests `GET /api/speakers` after talks were submitted
- **THEN** the response is `200` with an array containing each submitted `SpeakerDTO` (`id`, `name`, `talkTitle`, `isGDE`)

#### Scenario: No submissions
- **WHEN** a client requests `GET /api/speakers` before any talk was submitted
- **THEN** the response is `200` with an empty array

### Requirement: Dashboard displays submitted talks
The system SHALL provide a dashboard at the route `dashboard` that fetches the submitted talks and displays them in a semantic table with speaker name, talk title and GDE status, with loading, empty and error states announced accessibly.

#### Scenario: Talks are listed
- **WHEN** a user opens `/dashboard` and the API returns talks
- **THEN** each talk is shown as a row in a `<table>` with a caption and column headers (`scope="col"`)

#### Scenario: Empty state
- **WHEN** the API returns an empty array
- **THEN** the dashboard shows a message that no talks have been submitted yet instead of an empty table

#### Scenario: Loading failure
- **WHEN** the request fails
- **THEN** the dashboard shows an error message in an ARIA live region (`role="alert"`) and no table

### Requirement: Dashboard matches the form's visual identity
The dashboard SHALL use the same design tokens (CSS custom properties from `styles.css`), surface/border/radius treatment and focus styles as the talk submission form, and SHALL NOT introduce new hard-coded colors, so light and dark themes both work.

#### Scenario: Theme consistency
- **WHEN** the user's system theme is light or dark
- **THEN** the dashboard colors derive from the same tokens as the form

### Requirement: Navigation between form and dashboard
The talk submission form SHALL provide a navigation control to `/dashboard`, styled consistently with the form, and the dashboard SHALL provide a way back to the form.

#### Scenario: Navigate to dashboard
- **WHEN** a user activates the dashboard link on the submission form
- **THEN** the app navigates to `/dashboard` without a full page reload, and the link is keyboard-focusable with a visible focus ring
