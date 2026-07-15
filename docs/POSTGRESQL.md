# PostgreSQL workflow persistence

Iteronix stores workflow definitions, executions, provider Settings, and external workflow API-key metadata exclusively in PostgreSQL. Secrets are never persisted in plaintext: provider credentials are environment-variable references and external API keys are stored as hashes.

Set `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `DATABASE_URL`, then run:

```bash
docker compose up --build
```

A fresh database has an empty workflow catalog. Configure a provider in Settings before running a workflow. Reset local development state with `docker compose down --volumes` followed by `docker compose up --build`.
