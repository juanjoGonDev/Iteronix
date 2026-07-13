# PostgreSQL baseline

Iteronix stores its durable server state exclusively in PostgreSQL. The database starts empty and no legacy workspace file is imported.

Set the required Compose variables with local-development values. Use distinct secrets outside local development:

```bash
export POSTGRES_DB=iteronix
export POSTGRES_USER=iteronix
export POSTGRES_PASSWORD=replace-with-a-local-development-password
export AUTH_TOKEN=replace-with-a-local-development-token
export DATABASE_URL=postgresql://iteronix:replace-with-a-local-development-password@postgres:5432/iteronix
```

Start the full local stack:

```bash
docker compose up --build
```

For the host server or watcher, start only PostgreSQL first. Compose publishes it on `127.0.0.1:5432`; override the Compose-only hostname for that process:

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://iteronix:replace-with-a-local-development-password@127.0.0.1:5432/iteronix pnpm dev:server
```

PowerShell:

```powershell
docker compose up -d postgres
$env:DATABASE_URL = "postgresql://iteronix:replace-with-a-local-development-password@127.0.0.1:5432/iteronix"
pnpm dev:server
```

Reset the development database:

```bash
docker compose down --volumes
docker compose up --build
```

For a local server process, `AUTH_TOKEN` and `DATABASE_URL` are required. `DATABASE_URL` must point to PostgreSQL. Use `docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"` for local inspection.

## Provider configuration

A fresh workflow-only stack has no provider profile. Configure a runnable provider in Settings before testing or running an AI node. CLI profiles must name an executable available in the server container. API profiles must use an endpoint and an environment-variable reference for their credential; do not persist API keys in PostgreSQL.
