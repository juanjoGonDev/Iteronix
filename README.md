# Iteronix

Iteronix is a workflow-only application backed by PostgreSQL.

## Product boundary

- Workflow catalog at `/workflows`
- Single-workflow editor and execution at `/workflows/:workflowId`
- Provider configuration and external workflow API keys in Settings
- External callers use scoped, revocable workflow API keys

The browser connects to its colocated backend automatically. Provider credentials are referenced by environment-variable name and are redacted from persisted state and API responses.

## Run locally

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:4000` and sign in with the administrator account defined by
`ITERONIX_ADMIN_EMAIL` / `ITERONIX_ADMIN_PASSWORD` (`admin@admin` / `admin` by default;
change the password before exposing the app to any network).

The browser talks to its colocated backend with the IDE session cookie, so no bearer token
is required between the UI and the API. `AUTH_TOKEN` is optional and only needed by
programmatic callers that authorize with `Authorization: Bearer <token>`. `IDE_UI_ORIGINS`
lists the browser origins allowed to use a session; add your own host and port there when it
differs from `http://localhost:4000`.

Plugin registration is allowlisted by the server. Besides the built-in `reference.echo`
plugin, operators can trust additional process-isolated plugins with
`ITERONIX_TRUSTED_PLUGIN_IDS` (comma-separated registry keys); the Workflows assets
screen only ever offers keys from that server-owned list.

To run without Docker, set `DATABASE_URL` in `.env` and start PostgreSQL plus `pnpm dev`.
Configure a runnable provider in Settings before executing a workflow.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm -C apps/web-ui validate:settings
pnpm -C apps/web-ui validate:workflows
```
