# Apply Progress: Secret-backed external workflow credentials

## Phase 4 Verification

### 4.1 Full quality gates — complete

All required commands exited `0` on 2026-07-28:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` — 90 files and 470 tests passed; one database migration integration test skipped.
- `pnpm build`

The only repeated output was the existing `pnpm.onlyBuiltDependencies` configuration warning.

### 4.2 Database and focused verification — blocked

- `pnpm test:db` exited `0` with its single test skipped because `TEST_DATABASE_URL` is unset.
- Focused server suites passed: 18 tests in `external-api-keys.test.ts` and `settings-api.test.ts`; 8 additional cutover/repository tests passed in `application-state-cutover.test.ts` and `postgres-external-workflow-credentials.test.ts`.
- Focused UI suites passed: 12 tests in `settings-client.test.ts` and `settings-api-access-state.test.ts`.

The focused tests provide unit/HTTP evidence for legacy verifier cutover, Bearer authorization, and fixed-window limiting. They do not prove legacy Bearer continuity or shared throttling against a real PostgreSQL database and separate replicas. Keep Task 4.2 unchecked until `TEST_DATABASE_URL` points to the dedicated disposable PostgreSQL instance required by `database-migration-integration.test.ts` and the real-database/cross-replica assertions pass.
