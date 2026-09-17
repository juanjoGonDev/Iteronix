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
- The workflow editor's activity rail is flattened to a single column of tiles sharing the
  sidebar's hover/active semantics (soft fill, inset ring, `aria-pressed`), replacing nested
  bordered containers, so both rails read as one system.

### Fixed

- The collapsed application rail no longer squeezes the brand tile and the collapse
  toggle side by side: they stack vertically, every entry becomes a uniform centered
  40px tile with a hover tooltip, and the active state uses an inset ring so highlight
  and geometry never shift (previously the border on active items made boxes change size).
- The top bar no longer renders the same words twice on the workflow editor (bold title
  plus an identical breadcrumb tail); the breadcrumb names the location once, n8n-style.
- Settings-style text fields now commit every keystroke through the `input` event (with `change`
  as a blur fallback) instead of only on blur; validation messages and the save gate update live
  and automation that simulates typing (Playwright `fill`) drives the forms exactly like a user.
- Legacy credential-audit migration test no longer applies migration 004 without 003; 004's
  anonymous failure index depends on the `actor_kind` column introduced by 003.
- `EmptyStatePanel` accepts a primary action so empty asset lists are not dead ends.
