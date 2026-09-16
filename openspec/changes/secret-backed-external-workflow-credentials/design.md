# Design: Secret-backed external workflow credentials

## Technical Approach

Replace `ApplicationState.externalApiKeys` hash records with credential metadata in PostgreSQL and a server-only verifier port. The domain decides validity and operation/resource authorization; the server maps published external routes. PostgreSQL performs lifecycle, audit, and limiter mutations atomically across replicas. Settings remains the management surface and requires an authenticated `IdeUserRole.Admin` session.

## Architecture Decisions

| Decision        | Choice                                                                                                                                                                                                             | Rationale                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Secret boundary | `ExternalWorkflowCredentialSecretStore` is injected only into `apps/server-api`; its local PostgreSQL adapter stores scrypt verifiers in a private table, never `app_state` or responses.                          | Retains scrypt verification and permits a later KMS adapter without leakage.                        |
| Authorization   | Domain has a closed `ExternalWorkflowOperation` union: `workflow.read`, `workflow.invoke`, `workflow.trigger`, `run.status`, `run.approve`, `run.trace`; metadata combines operations with all/selected workflows. | Route-to-operation mapping is deny-by-default; only read/invoke routes are published.               |
| Consistency     | `PostgresExternalWorkflowCredentialRepository` uses one transaction with row locks/upserts for lifecycle, audit, and fixed-window counters.                                                                        | In-process `saveQueue` and app-state revisions do not protect multiple replicas.                    |
| Audit           | Append-only redacted events retain `credentialId`, actor kind/id, event kind, operation/workflow/result, and timestamp; a scheduled repository purge deletes only rows older than 365 days.                        | Administrators obtain evidence without plaintext, bearer headers, scrypt values, or request bodies. |

## Data Flow

```text
Admin session -> management route -> credential repository + secret store -> metadata/audit
Bearer -> external route -> operation registry -> repository authenticate/authorize/consume -> workflow
                                      \-> PostgreSQL counters and redacted audit
```

Management routes list/create/update/regenerate/revoke/audits are session-admin-only; non-admins receive no credential data. Create/regenerate generate `itx_wf_` plaintext, call `put`, and return it once. Regeneration transactionally replaces the verifier, increments generation, and emits audit before the response, so the old secret fails immediately. External routes read Bearer material, map path to a declared operation, authenticate the verifier, reject revoked/expired/unknown operations, authorize workflow scope, atomically consume the credential's minute bucket (default 60, integer 1--600), update last use, and audit success/failure/throttle.

## File Changes

| File                                                                                            | Action        | Description                                                                                                    |
| ----------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `packages/domain/src/external-api-keys.ts`                                                      | Modify        | Credential metadata, operation/resource scope, expiry, redacted view, and pure authorization/limit validation. |
| `apps/server-api/src/external-api-keys.ts`                                                      | Replace       | Secret-store port, local scrypt adapter, repository contracts, and plaintext generator.                        |
| `apps/server-api/src/postgres-external-workflow-credentials.ts`                                 | Create        | Transactional PostgreSQL metadata, audit, rate-limit, and legacy migration adapter.                            |
| `apps/server-api/migrations/002_external_workflow_credentials.sql`                              | Create        | Credential metadata, verifier, audit, and rate-window tables/indexes.                                          |
| `apps/server-api/src/server.ts`                                                                 | Modify        | Admin/session route boundary, operation registry, injected repository, and external enforcement.               |
| `apps/server-api/src/application-state.ts`                                                      | Modify        | Read legacy records only for one-time cutover; remove persisted verifier hashes.                               |
| `apps/server-api/src/constants.ts`                                                              | Modify        | Credential management/audit route constants and typed errors.                                                  |
| `apps/web-ui/src/shared/settings-client.ts`                                                     | Modify        | Redacted credential, regenerate, expiry, operations, limit, and audit contracts.                               |
| `apps/web-ui/src/screens/Settings.ts`                                                           | Modify        | Admin management, one-time secret display, expiry/operation/limit inputs and audit view.                       |
| `packages/domain/src/external-api-keys.test.ts` and `apps/server-api/src/*credentials*.test.ts` | Modify/Create | RED-first policy, adapter, migration, API, and UI-client coverage.                                             |

## Interfaces / Contracts

```ts
type ExternalWorkflowCredentialSecretStore = {
  put: (input: { credentialId: string; plaintext: string }) => Promise<void>;
  verify: (plaintext: string) => Promise<{ credentialId: string } | undefined>;
  replace: (input: {
    credentialId: string;
    plaintext: string;
  }) => Promise<void>;
  importLegacyVerifier: (input: {
    credentialId: string;
    scryptHash: string;
  }) => Promise<void>;
};

type ConsumeExternalCredential = {
  credentialId: string;
  operation: ExternalWorkflowOperation;
  workflowId: string;
  now: string;
};
```

`consumeAuthorized` returns `authorized | unauthorized | forbidden | throttled`; it commits counter, `lastUsedAt`, and a redacted audit event in the same PostgreSQL transaction. `expiresAt?: string` means never-expire. Public responses expose metadata only; plaintext is `plaintextCredential` only on create/regenerate.

## Testing Strategy

| Layer            | RED-first test                                                                               | Approach                                                    |
| ---------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Domain           | Operation/resource/expiry/revocation and 1--600 validation                                   | Vitest pure fixtures, including unknown operation denial.   |
| PostgreSQL       | Concurrent 60th/61st requests, rotation/revoke atomicity, 365-day purge, legacy import       | Real PostgreSQL integration tests and transaction fixtures. |
| Server/UI client | Admin-only management, one-time secret, existing bearer migration, 401/403/429 and redaction | HTTP tests plus Settings client/screen tests.               |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. HTTP dispatch only changes credential authorization.

## Migration / Rollout

`002` creates tables. Startup invokes an idempotent local migration transaction: `SELECT ... FOR UPDATE` the `app_state` application row, import each legacy `secretHash` as a `legacy-scrypt` verifier, create never-expiring credentials with current route operations, 60 RPM, and current workflow scope, append migration audit, then rewrite `externalApiKeys` empty. A failed transaction preserves the old state; a successful one keeps old bearer secrets valid. Rollback keeps the local verifier table readable and restores legacy route policy only after retaining metadata/audits; revoke newly issued credentials if verifier integrity is uncertain.

## Open Questions

- [ ] None; KMS remains out of scope.
