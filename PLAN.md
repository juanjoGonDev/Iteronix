# Workflow-only product plan

## Product scope

- [x] PostgreSQL-backed workflow catalog, one-workflow editor routes, provider Settings, and external scoped workflow API keys.
- [x] Remove every remaining repository, project, workspace, desktop, AI-workbench, Git, file, history, log, Kanban, quality-gate, session, evaluation, RAG, memory, and MCP subsystem.
- [x] Keep only workflow/provider/settings documentation and workflow UI specifications.
- [x] Ensure the colocated browser client never sends, displays, or persists the internal backend bearer token.
- [x] Support PostgreSQL-backed global runtime defaults plus persisted per-workflow overrides for limits and notifications.
- [x] Migrate persisted legacy workflow asset scopes to the global catalog during PostgreSQL state loading.
- [x] Serve the workflow UI from the colocated server container and validate deep links in CI.

## Acceptance

- The browser registers only `/`, `/workflows`, `/workflows/:workflowId`, and `/settings`.
- The server accepts only Settings/provider, workflow, and external workflow API-key routes.
- PostgreSQL holds workflow and provider/settings state with credential redaction.
- Source-inventory and browser regressions prevent removed product surfaces from returning.
- Docker runtime validation proves a workflow deep link returns the colocated UI entry point.
