# Tasks: Secret-backed external workflow credentials

## Review Workload Forecast

| Field                   | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| Estimated changed lines | 950–1,300                                            |
| 400-line budget risk    | High                                                 |
| Chained PRs recommended | Yes                                                  |
| Suggested split         | One current-branch PR with three internal work units |
| Delivery strategy       | exception-ok                                         |
| Chain strategy          | size-exception                                       |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                  | Likely PR          | Focused test command                                                                                                                    | Runtime harness                                               | Rollback boundary                                             |
| ---- | ------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| 1    | Policy, secrets, PostgreSQL migration | Single PR / Unit 1 | `pnpm exec vitest run packages/domain/src/external-api-keys.test.ts apps/server-api/src/postgres-external-workflow-credentials.test.ts` | `pnpm test:db` migration/import fixture                       | Delete `002_external_workflow_credentials.sql` and repository |
| 2    | Admin/external server enforcement     | Single PR / Unit 2 | `pnpm exec vitest run apps/server-api/src/external-api-keys.test.ts apps/server-api/src/settings-api.test.ts`                           | HTTP fixture: create, rotate, legacy Bearer, 429              | Revert server routes/constants; keep migrated data            |
| 3    | Redacted Settings management          | Single PR / Unit 3 | `pnpm exec vitest run apps/web-ui/src/shared/settings-client.test.ts apps/web-ui/src/screens/settings-api-access-state.test.ts`         | N/A: deterministic client/state tests exercise HTTP contracts | Revert Settings/client UI independently                       |

## Phase 1: Credential foundation

- [x] 1.1 RED: extend `packages/domain/src/external-api-keys.test.ts` for closed operations, workflow scope, expiry/revocation, unknown-operation denial, and 1–600 limit validation.
- [x] 1.2 GREEN: update `packages/domain/src/external-api-keys.ts` with credential metadata, redacted views, and pure validity/authorization functions.
- [x] 1.3 REFACTOR: centralize operation/limit constants in `packages/domain/src/external-api-keys.ts`; retain strict public types.
- [x] 1.4 RED: create `apps/server-api/src/postgres-external-workflow-credentials.test.ts` for atomic rotate/revoke, 60th/61st shared bucket, audits, purge, and legacy verifier import.
- [x] 1.5 GREEN: add `apps/server-api/migrations/002_external_workflow_credentials.sql`, `apps/server-api/src/postgres-external-workflow-credentials.ts`, and secret-store support in `apps/server-api/src/external-api-keys.ts`.
- [x] 1.6 REFACTOR: make `apps/server-api/src/application-state.ts` perform idempotent locked legacy cutover and remove persisted hashes.

## Phase 2: Server authorization

- [x] 2.1 RED: extend `apps/server-api/src/external-api-keys.test.ts` and `apps/server-api/src/settings-api.test.ts` for admin-only lifecycle, one-time plaintext, 401/403/429, redaction, and audit retention.
- [x] 2.2 GREEN: update `apps/server-api/src/server.ts` with declared read/invoke registry, repository enforcement, and admin management/audit routes.
- [x] 2.3 GREEN: update `apps/server-api/src/constants.ts` with typed credential routes/errors.
- [x] 2.4 REFACTOR: share route-operation and response-redaction helpers; run `pnpm test:db`.

## Phase 3: Settings integration

- [x] 3.1 RED: extend `apps/web-ui/src/shared/settings-client.test.ts` and `apps/web-ui/src/screens/settings-api-access-state.test.ts` for redacted lifecycle/audit contracts and secret-once state.
- [x] 3.2 GREEN: update `apps/web-ui/src/shared/settings-client.ts` and `apps/web-ui/src/screens/Settings.ts` for admin create/rotate/revoke, scopes, expiry, limits, and audits.
- [x] 3.3 REFACTOR: centralize Settings credential state; confirm no client verifier/plaintext persistence.

## Phase 4: Verification

- [x] 4.1 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`; record failures before remediation.
- [x] 4.2 Run `pnpm test:db` and focused server/UI suites; verify legacy Bearer continuity and cross-replica throttling.
