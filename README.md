# Iteronix

Iteronix is a workflow-only application backed by PostgreSQL.

## Product boundary

- Workflow catalog at `/workflows`
- Single-workflow editor and execution at `/workflows/:workflowId`
- Provider configuration and external workflow API keys in Settings
- External callers use scoped, revocable workflow API keys

The browser connects to its colocated backend automatically. Provider credentials are referenced by environment-variable name and are redacted from persisted state and API responses.

## Run locally

Set `DATABASE_URL` and start PostgreSQL with Docker Compose, then run `pnpm dev`. Configure a runnable provider in Settings before executing a workflow.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm -C apps/web-ui validate:settings
pnpm -C apps/web-ui validate:workflows
```
