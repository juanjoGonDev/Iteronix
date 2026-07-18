# PostgreSQL application-state persistence

Iteronix stores the revisioned workflow application envelope in PostgreSQL. It includes workflow definitions, versions, assets/usages, executions, settings, provider references, and external workflow API-key metadata. Secrets are never persisted in plaintext: provider credentials are environment-variable references and external API keys are stored as hashes.

The canonical row key is `application`; legacy `workspace` rows are read only as a compatibility fallback and are written back as `application` on the next successful save. See [the migration contract](workflow-migration-contract.md) for full import/export and rollback rules.

## Schema migrations

Every PostgreSQL schema change MUST be introduced as a new, immutable, forward-only SQL file in `apps/server-api/migrations/`. Existing migration files MUST NOT be edited after they have been applied. The server verifies the migration ledger at startup and refuses to start when migrations are pending or their checksums no longer match.

Apply and verify the database before starting the server:

```bash
pnpm db:migrate
pnpm db:verify
```

The migrator serializes changes through a PostgreSQL advisory transaction lock and records the immutable migration identifier and SHA-256 checksum in `schema_migrations`. Runtime application-state persistence never creates or changes tables.

## Isolated database tests

Database integration tests MUST use `TEST_DATABASE_URL`, and it MUST differ from `DATABASE_URL`. This keeps migration and backup/restore tests away from development, staging, and production data.

```bash
TEST_DATABASE_URL=postgresql://iteronix_test:password@localhost:5432/iteronix_test pnpm test:db
```

Set `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `DATABASE_URL`, then run:

```bash
docker compose up --build
```

A fresh database has an empty workflow catalog. Configure a provider in Settings before running a workflow. Reset local development state with `docker compose down --volumes` followed by `docker compose up --build`.
