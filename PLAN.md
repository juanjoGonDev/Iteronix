# Workflow-only product plan

## Product scope

- [x] PostgreSQL-backed workflow catalog, one-workflow editor routes, provider Settings, and external scoped workflow API keys.
- [ ] Remove every remaining repository, project, workspace, desktop, AI-workbench, Git, file, history, log, Kanban, quality-gate, session, evaluation, RAG, memory, and MCP subsystem.
- [ ] Keep only workflow/provider/settings documentation and workflow UI specifications.
- [ ] Ensure the colocated browser client never sends, displays, or persists the internal backend bearer token.

## Acceptance

- The browser registers only `/`, `/workflows`, `/workflows/:workflowId`, and `/settings`.
- The server accepts only Settings/provider, workflow, and external workflow API-key routes.
- PostgreSQL holds workflow and provider/settings state with credential redaction.
- Source-inventory and browser regressions prevent removed product surfaces from returning.
