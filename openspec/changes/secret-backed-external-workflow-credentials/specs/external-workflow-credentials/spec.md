# external-workflow-credentials Specification

## Purpose

Control external workflow credentials.

## Requirements

### Requirement: Administrator credential lifecycle

Only an authenticated installation administrator MUST create, inspect, regenerate, or revoke credentials. Verifiers MUST remain server-side. Creation and regeneration MUST return the plaintext secret once; later views MUST redact plaintext and verifier material.

#### Scenario: Administrator creates a credential

- GIVEN an authenticated installation administrator
- WHEN they create a scoped credential
- THEN the system returns its plaintext secret once and redacted metadata

#### Scenario: Non-administrator manages a credential

- GIVEN an authenticated non-administrator
- WHEN they request a lifecycle operation
- THEN the system denies the request without credential data

### Requirement: Explicit operation and workflow authorization

A credential MUST combine one or more explicit operation scopes (`workflow.read`, `workflow.invoke`, `workflow.trigger`, `run.status`, `run.approve`, or `run.trace`) with all-workflows or selected-workflows scope. The system MUST authorize only requests whose declared operation and target workflow are granted. Unpublished or future external endpoints MUST NOT be authorized until explicitly specified and scoped.

#### Scenario: Combined scopes authorize matching requests

- GIVEN a credential grants `workflow.read` and `workflow.invoke` for a workflow
- WHEN either operation targets that workflow
- THEN the system authorizes it

#### Scenario: Unknown operation is requested

- GIVEN a valid credential with all defined scopes
- WHEN an unpublished external operation is requested
- THEN the system denies it

### Requirement: Credential validity and rotation

A credential MUST expire at a timestamp or never expire. The system MUST reject expired or revoked credentials. Regeneration MUST issue a replacement secret and immediately invalidate the prior secret; emergency revocation MUST immediately invalidate the credential.

#### Scenario: Rotated credential changes validity

- GIVEN a valid credential
- WHEN an administrator regenerates it
- THEN the replacement authenticates and the prior secret is rejected immediately

#### Scenario: Expired or revoked credential is used

- GIVEN an expired or emergency-revoked credential
- WHEN it authenticates an external request
- THEN the system rejects it

### Requirement: Durable shared rate limiting

The system MUST enforce a durable installation-wide per-credential limit shared by server replicas. The default MUST be 60 requests per minute; administrators MAY configure an integer from 1 through 600.

#### Scenario: Requests remain within the limit

- GIVEN a credential limited to 60 requests per minute across replicas
- WHEN it makes the sixtieth request in that minute
- THEN the system accepts it

#### Scenario: Shared limit is exceeded

- GIVEN replica requests consume the configured credential limit
- WHEN another request arrives that minute
- THEN the system rejects it as throttled

### Requirement: Redacted immutable audit evidence

The system MUST durably record immutable, redacted credential lifecycle, authentication, authorization-failure, and throttling events for 365 days. Audits MUST be administrator-only and MUST NOT contain plaintext or verifier material.

#### Scenario: Lifecycle event is audited

- GIVEN an administrator rotates or revokes a credential
- WHEN the operation succeeds
- THEN an administrator can view its redacted immutable audit event

#### Scenario: Retention and visibility are enforced

- GIVEN a credential audit event
- WHEN a non-administrator reads it or it is older than 365 days
- THEN access is denied or the event is unavailable

### Requirement: Legacy bearer-key compatibility

The system MUST migrate existing external bearer credentials so valid legacy clients authenticate with their existing secret. Migration MUST keep verifiers server-side, retain no plaintext, and apply this specification's authorization, validity, rate-limit, and audit rules after cutover.

#### Scenario: Legacy client authenticates after migration

- GIVEN a valid pre-existing bearer credential
- WHEN its existing secret is presented after migration
- THEN the system authenticates it under the migrated policy

#### Scenario: Invalid legacy secret is presented

- GIVEN a migrated legacy credential
- WHEN an invalid secret is presented
- THEN the system rejects it without exposing verifier material
