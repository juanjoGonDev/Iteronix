# Changelog

## Unreleased

### Added

- Workflow canvas: node palette entries can now be **dragged onto the canvas** and land at the
  drop point (previously the browser cancelled every drag because the `dragover` gate relied on
  payload data the spec only exposes at drop time). Clicking a palette entry still works as before.
- Web UI rendering coalesces `setState` into **one re-render per frame**. Previously a single
  user interaction that fired both `input` and `change` (native value setters, automation)
  produced two replacement renders per event, which raced with text insertion and dragged
  nodes; now the whole editor, canvas drags included, commits once per frame.
- Workflow canvas: a **Tidy up** toolbar button re-lays the whole graph into n8n-style left-to-right
  layers (longest-path layering, cycle-safe, columns centered), then fits the viewport; the layout
  is saved with the workflow, so nodes stay organized after a reload.

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

- The Nodes palette panel drops its explanatory intro card; the draggable node list is what the
  panel shows from now on (the existing canvas hint already teaches the gesture).

- Settings-style reusable form primitives gained `SettingsTextareaField` and
  `SettingsJsonField` (monospace editor with live contract validation) reused across asset forms.
- The workflow editor's activity rail is flattened to a single column of tiles sharing the
  sidebar's hover/active semantics (soft fill, inset ring, `aria-pressed`), replacing nested
  bordered containers, so both rails read as one system.

### Fixed

- The Nodes palette entries are `button`-role divs instead of `<button>` elements because Blink
  ignores `draggable` on buttons, so palette drags never started in Chrome/Edge. Dragging now
  works in every engine, and the click/keyboard paths are unchanged.

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
