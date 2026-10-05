# Spec Delta

## Purpose

Lets a speaker submit a talk proposal for the Call for Papers, with the submission validated end-to-end against a shared contract before it is accepted.

## ADDED Requirements

### Requirement: Talk submission payload is strictly validated
The system SHALL validate every incoming talk submission against the shared `SpeakerDTO`-based contract and SHALL reject any payload that is missing required fields, has fields of the wrong type, or includes fields not defined by the contract.

#### Scenario: Valid submission is accepted
- **WHEN** a speaker submits a payload containing all required fields with valid types (`name`, `talkTitle`, `isGDE`)
- **THEN** the system accepts the submission and returns a success response containing the created submission

#### Scenario: Missing required field is rejected
- **WHEN** a speaker submits a payload missing a required field (e.g. `talkTitle`)
- **THEN** the system rejects the request with `400 Bad Request` and does not create a submission

#### Scenario: Wrong field type is rejected
- **WHEN** a speaker submits a payload where a field has an invalid type (e.g. `isGDE` is a string instead of a boolean)
- **THEN** the system rejects the request with `400 Bad Request` and does not create a submission

#### Scenario: Unknown fields are rejected
- **WHEN** a speaker submits a payload containing fields not defined by the submission contract
- **THEN** the system rejects the request with `400 Bad Request` and does not create a submission

### Requirement: Talk submission form reflects submission state accessibly
The system SHALL present a talk submission form whose submit control starts disabled, becomes enabled only once the form holds a valid submission, and is re-disabled while a submission is in flight, with state changes exposed to assistive technology via WAI-ARIA.

#### Scenario: Submit button disabled on initial load
- **WHEN** the talk submission form is first rendered
- **THEN** the submit button is disabled and the form's state reflects that no valid submission exists yet

#### Scenario: Submit button enabled once form is valid
- **WHEN** a speaker fills in all required fields with valid values
- **THEN** the submit button becomes enabled

#### Scenario: Submit button disabled while submitting
- **WHEN** a speaker submits a valid form and the request is in flight
- **THEN** the submit button is disabled until the request completes, preventing duplicate submissions

#### Scenario: Validation errors are announced accessibly
- **WHEN** a speaker submits an invalid form or the API rejects the submission
- **THEN** the error is exposed through an ARIA live region or equivalent so assistive technology announces it
