# Changelog

## Unreleased

### Added

- Assets screens now share one workbench layer (`AssetWorkbench`): consistent intro headers,
  status-badged rows, editor dialogs, empty states with primary actions, and explained
  disabled controls for Prompts, Skills, Memory & RAG, MCP, and Server plugins.
- Server plugins screen gained a full manifest form (trusted registry key, capabilities,
  permissions, execution limit, timeout, live-validated input/output JSON contracts),
  per-row enable/disable, audit history, deletion with confirmation, and retryable error states.
- `ITERONIX_TRUSTED_PLUGIN_IDS` extends the server-owned plugin allowlist; the API's
  `/assets/list` response now exposes `pluginRegistry.trustedKeys` so the UI never offers a
  key the server would reject.
- CI runs a real `postgres:16-alpine` service container: forward-only migrations are applied
  and verified (`pnpm db:migrate`, `pnpm db:verify`), and the PostgreSQL migration integration
  suite no longer self-skips.
- Deterministic Playwright coverage for the trusted plugin journey (register, invalid-contract
  blocking, toggle, edit, confirm-and-delete, persisted reload) plus unit suites for the
  plugin screen, workbench primitives, and the plugin client.

### Changed

- Settings-style reusable form primitives gained `SettingsTextareaField` and
  `SettingsJsonField` (monospace editor with live contract validation) reused across asset forms.

### Fixed

- Legacy credential-audit migration test no longer applies migration 004 without 003; 004's
  anonymous failure index depends on the `actor_kind` column introduced by 003.
- `EmptyStatePanel` accepts a primary action so empty asset lists are not dead ends.
