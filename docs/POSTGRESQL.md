# PostgreSQL application-state persistence

Iteronix stores the revisioned workflow application envelope in PostgreSQL. It includes workflow definitions, versions, assets/usages, executions, settings, provider references, and external workflow API-key metadata. Secrets are never persisted in plaintext: provider credentials are environment-variable references and external API keys are stored as hashes.

The canonical row key is `application`; legacy `workspace` rows are read only as a compatibility fallback and are written back as `application` on the next successful save. See [the migration contract](workflow-migration-contract.md) for full import/export and rollback rules.

Set `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `DATABASE_URL`, then run:

```bash
docker compose up --build
```

A fresh database has an empty workflow catalog. Configure a provider in Settings before running a workflow. Reset local development state with `docker compose down --volumes` followed by `docker compose up --build`.
