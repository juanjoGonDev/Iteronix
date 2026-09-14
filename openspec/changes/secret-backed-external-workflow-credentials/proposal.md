# Proposal: Secret-backed external workflow credentials

## Intent

Replace persisted, hash-only external API keys with administrator-managed credentials that preserve existing bearer clients while adding server-only secret handling, explicit operation authorization, durable abuse controls, and auditable lifecycle events.

## Scope

### In Scope

- Define credential metadata, operation scopes, expiry, rotation, immediate revocation, and migration policy.
- Keep verifier material in a server-side secret-store port; persist redacted metadata, audits, and shared durable limits in PostgreSQL.
- Let installation administrators create, regenerate, revoke, and inspect existing external credentials without secret disclosure.
- Retain immutable, administrator-only audits for 365 days and enforce per-credential limits configurable from 1 to 600 requests/minute (default 60).

### Out of Scope

- Publishing separate trigger, run-status, approval, or trace endpoints.
- Browser or renderer secret storage.
- Multi-tenant authorization and a KMS-specific adapter.

## Capabilities

### New Capabilities

- `external-workflow-credentials`: Server-managed credentials, operation authorization, expiry, rotation, revocation, durable rate limits, redaction, migration, and audit evidence.

### Modified Capabilities

- None.

## Approach

Define `workflow.read`, `workflow.invoke`, `workflow.trigger`, `run.status`, `run.approve`, and `run.trace`. Current routes require their matching declared scope; unpublished future operations receive no implicit authorization. Credentials combine operations with all-workflows or selected-workflows resource scope. Rotation displays one replacement secret and immediately disables the prior verifier; expiry is a timestamp or never-expire. Migrate existing scrypt verifiers into the local server adapter. Serialize credential, audit, and limiter mutations through PostgreSQL.

## Affected Areas

| Area                                       | Impact   | Description                               |
| ------------------------------------------ | -------- | ----------------------------------------- |
| `packages/domain/src/external-api-keys.ts` | Modified | Policy and scope contracts.               |
| `apps/server-api/src/external-api-keys.ts` | Modified | Secret-store adapter and migration.       |
| `apps/server-api/src/server.ts`            | Modified | Lifecycle, authorization, and throttling. |
| `apps/server-api/src/application-state.ts` | Modified | Metadata, audit, and limiter persistence. |
| `apps/web-ui/src/screens/Settings.ts`      | Modified | Redacted administrator management.        |

## Risks

| Risk                  | Likelihood | Mitigation                                                 |
| --------------------- | ---------- | ---------------------------------------------------------- |
| Compatibility loss    | Medium     | Migrate and verify legacy hashes before cutover.           |
| Concurrent state loss | Medium     | Use atomic durable mutations.                              |
| Secret exposure       | Low        | Server-only port, one-time display, redacted views/events. |

## Rollback Plan

Keep migrated legacy verifiers readable by the local adapter. Revert route policy only after retaining metadata and audit records; revoke newly issued credentials if secret-store integrity is uncertain.

## Dependencies

- PostgreSQL application-state migration and server-only secret adapter boundary.

## Success Criteria

- [ ] Existing bearer keys authenticate after migration without secret exposure.
- [ ] Administrators can issue, rotate, expire, revoke, and audit scoped credentials.
- [ ] Unauthorized, expired, revoked, and throttled requests are rejected and recorded.
- [ ] No unpublished future operation is authorized without its explicit scope.
