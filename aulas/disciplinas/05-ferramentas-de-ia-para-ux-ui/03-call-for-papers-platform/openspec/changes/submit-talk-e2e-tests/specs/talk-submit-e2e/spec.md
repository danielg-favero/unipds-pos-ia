## ADDED Requirements

### Requirement: Successful submission is covered by an e2e test
The e2e suite SHALL verify that a speaker can open `/talks/submit`, fill the form and submit it successfully.

#### Scenario: Valid form is submitted
- **WHEN** the test visits `/talks/submit`, types a name and a talk title, and clicks the submit button
- **THEN** a `POST /api/speakers` request is sent with the typed name and talk title
- **AND** the form fields are cleared after the request succeeds
- **AND** no error message is displayed

#### Scenario: Submit is only available when the form is valid
- **WHEN** the test visits `/talks/submit` and the fields are empty
- **THEN** the submit button is disabled

### Requirement: Validation errors are covered by an e2e test
The e2e suite SHALL verify that an empty form shows validation messages and cannot be submitted.

#### Scenario: Empty form shows required messages
- **WHEN** the test visits `/talks/submit` and focuses then leaves the empty Name and Talk title fields
- **THEN** the messages "Name is required." and "Talk title is required." are visible
- **AND** the submit button remains disabled
- **AND** no `POST /api/speakers` request is sent

### Requirement: Tests use plain Cypress only
The e2e suite SHALL use only standard Cypress commands and CSS selectors (`id`, `class`, `name`, attribute) and SHALL NOT depend on AI or third-party Cypress plugins.

#### Scenario: No extra plugins
- **WHEN** the spec and Cypress config are inspected
- **THEN** they import nothing beyond Cypress and TypeScript types
