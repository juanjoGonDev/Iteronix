# Assets screens specification — plugins parity, consistency, and CI database gates

Status: implemented (pending CI green)
Owner: Workflows/assets product surface (this spec supersedes the orphaned "06." Notion
breakdown for the assets screens; see "Backlog reconciliation" below).

## Why this spec exists

The user report driving this change: `/assets/plugins` rendered a dead screen — no usable
list, a registration form whose server-side contract rejects almost every submission, no
delete/enable controls, and an asset family that did not reuse the shared UI primitives
the rest of the app uses. Additionally, CI never ran the PostgreSQL migration
integration tests, which let a real migration-ordering bug stay hidden.

## Backlog reconciliation (abandoned PR triage)

| Notion item (06.x)                                                | Disposition  | Evidence in this repo                                                                                       |
| ----------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| Execution/history rail, deletable history, node details           | Done         | `Workflows.ts` + `workflows-debug-state.ts`, `/workflows/executions/{list,delete,run,stream}` server routes |
| Tokens/runtime/EUR cost + total accumulated EUR                   | Done         | `estimatedCostSourceCurrency` (USD/EUR) in persisted run records; EUR rendering in `Workflows.ts`           |
| Reusable prompt/guardrail/asset model + usage + delete protection | Done         | `/assets/*` API, `prompt-asset-usage.ts`, usage-confirmed tombstone deletion                                |
| Codex CLI baseline + provider continuity                          | Done         | `packages/adapters/src/codex-cli`, provider settings/test routes in `Settings.ts` and server providers API  |
| Projects / History / Explorer screens                             | Discarded    | Explicitly retired by `PLAN.md` charter; enforced by `workflow-only-source-inventory.test.ts`               |
| `docs/WORKFLOWS_EDITOR_MVP.md` contract doc                       | Never landed | The abandoned PR referenced it; it does not exist. This document plus `PLAN.md` are the contract of record. |
| Trigger/schedule/webhook breadth (06.7)                           | Deferred     | Unchanged from the abandoned PR: out of MVP scope; `PLAN.md` Phase 6/7 owns graph evolution.                |

## Locked decisions

1. **Server-owned trust model stays.** Plugin registration remains an allowlist the server
   owns. We make the allowlist explicit to the UI instead of pretending the browser can
   choose freely: the trusted keys are listed in the assets list response and the form
   presents them as the only selectable registry keys. Operators extend the allowlist with
   `ITERONIX_TRUSTED_PLUGIN_IDS` (comma-separated); `reference.echo` is always included.
2. **One shared asset-workbench layer.** Every asset screen (Prompts, Skills, Memory &
   RAG, MCP, Plugins) renders through the same components: `PageIntro` header,
   `AssetRowList`/`AssetRow`, `AssetEditorDialog`/`AssetConfirmDialog`, `EmptyStatePanel`
   (with primary action), `PageNoticeStack` toasts, and `SettingsFields` form primitives.
   Screens own only their fields and payload mapping, never layout chrome.
3. **No dead controls.** Every button performs its action or is disabled with a visible
   reason (e.g. "Save" while the JSON schema is invalid, "Register" when no trusted key is
   available). Error states carry a Retry action.
4. **AI-workflow-manager form conventions** (researched from n8n / Dify / Flowise /
   Langflow admin surfaces): identity + capability declaration + execution limits +
   I/O contract (JSON) + safety/audit visibility (status, permissions, usage, audit
   trail) + destructive actions behind explicit confirmation.
5. **Testids and URL state are a public contract.** Existing `data-testid` roots and
   `*-assets-root` / `*-assets-create` hooks and `?mode=&…` deep links MUST survive the
   refactor so the mature Playwright and Puppeteer validators stay green.
6. **CI runs the database for real.** GitHub Actions gets a `postgres:16-alpine` service,
   applies migrations against it (`db:migrate` + `db:verify`), and runs the migration
   integration suite with `TEST_DATABASE_URL` so it no longer self-skips.

## Implementation checklist

- [x] **Docs / contracts**
  - [x] This spec lands first as the main commit of the change set.
  - [x] `.env.example` documents `ITERONIX_TRUSTED_PLUGIN_IDS`.
  - [x] CHANGELOG "Unreleased" lists the user-visible fixes.
- [x] **Server**
  - [x] `config.ts`: parse `ITERONIX_TRUSTED_PLUGIN_IDS` (validated, trimmed, deduped).
  - [x] `TrustedPluginRegistry.trustedKeys()` enumeration; include the keys in the
        `/assets/list` response as `pluginRegistry.trustedKeys`.
  - [x] Keep upsert rejection for non-allowlisted plugin keys (400, typed message).
  - [x] Fix the migration-ordering defect exposed by the integration test: the
        "legacy audit rows" stage must stop at migration 002 (004 hard-depends on the
        `actor_kind` column introduced by 003).
  - [x] Server tests: allowlist behavior, trusted-keys listing, env parsing.
- [x] **Web UI shared layer**
  - [x] `components/AssetWorkbench.ts`: `AssetRowList`, `AssetRow` (title/meta/badges/
        actions/usage-extra), `AssetEditorDialog` (overlay, header, form slot, footer with
        optional destructive action), `AssetConfirmDialog`, `AssetStatusBadge` mapping
        (`enabled/disabled/error` → tokens).
  - [x] `EmptyStatePanel` accepts an optional primary `action`.
  - [x] `SettingsFields`: add `SettingsTextareaField` and `SettingsJsonField` (monospace,
        live parse + structural validation, visible state line) reusable by all screens.
- [x] **Plugins screen**
  - [x] List rows: status badge, key, runtime/isolation, limits, permissions summary,
        audit count + last event.
  - [x] Create: trusted-key select (with helper text and empty-allowlist warning),
        display name, status toggle, capabilities, permissions, execution limit, timeout,
        input/output JSON schema fields with live validation.
  - [x] Edit: prefill from persisted record; save updates and appends audit event
        (server-owned); cancel returns to catalog and restores URL state.
  - [x] Enable/disable per row without opening the editor.
  - [x] Delete with confirmation dialog (shared dialog footer), refresh + toast.
  - [x] Empty state CTA opens the create form; error state offers Retry.
  - [x] Preserve `plugin-assets-*` testids and `?mode=&plugin=` deep links.
- [x] **Other asset screens adopt the shared layer (visual/structural only)**
  - [x] Skills: row/dialog/fields via shared components; keep delete confirmation.
  - [x] Memory & RAG: same (plus config/documents panels and delete confirmation).
  - [x] MCP: same.
  - [x] Prompts: same chrome; keep version history, usage links, and impact-confirmed
        deletion behavior exactly as-is.
- [x] **Verification**
  - [x] New web unit tests: plugin screen renders the full workbench, registration payload
        mapping, toggle/delete flows, error retry, invalid schema blocks Save.
  - [x] Updated/new shared-client tests for the `pluginRegistry.trustedKeys` response.
  - [x] Playwright: authenticated plugin CRUD journey (register → toggle → edit → delete)
        against the real server, run by the existing Docker CI step.
  - [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` green. (`pnpm deadcode`
        cannot run in the low-memory sandbox — its parser requests a 6 GiB buffer; the
        exported surface was kept manually minimal and CI does not gate on it.)
  - [x] CI (with the new Postgres service) green: `db:migrate`, `db:verify`, `test:db`,
        unit suites, Puppeteer validators, Playwright matrix — all 19 steps passed on
        PR #32 head `799f6a5` (run 35152027530), including the trusted-plugin journey
        across desktop/tablet/mobile.

## Post-MVP additions landed with this change

- `apps/web-ui/scripts/serve.ts` (the local dev server) now proxies the API surfaces
  (`/assets/*` endpoints, `/auth/*`, `/settings/*`, `/providers/*`, `/memory/documents/*`,
  `/governance/*`, `/workflows/{assets,definitions,executions,providers}/*`) to
  `ITERONIX_BACKEND_PORT` (default 4001). This makes the dev deployment behave like the
  colocated Docker deployment on any host (previews included) and turns a missing backend
  into an explicit 502 with instructions instead of a silent failure.

## Out of scope

- New plugin runtime capabilities (execution stays server-side, process-isolated,
  `reference.echo` remains the only built-in plugin).
- Trigger/schedule/webhook breadth (PLAN Phase 6+), provider chain changes, and any
  editing of the mature Workflows screen behavior beyond shared-primitive compatibility.
- Kanban/Projects/History/Explorer surfaces (charter exclusions).

---

## Follow-up addendum (2026-09-17): shell, collapsed rail & editor polish

Raised on review after the assets work ("no se ve tan profesional y limpio como n8n;
el menú colapsado se ve mal"). Scope is limited to the app shell chrome and the
workflow editor's own rail; already-validated screens stay untouched.

Decisions:

- Collapsed rail: the brand tile and the collapse toggle stack vertically (never
  side-by-side in the 72px column). Every entry — group headers, plain items and
  group children — becomes a uniform centered 40px tile with a `title` tooltip,
  mirroring the n8n/Dify icon-rail pattern users already know.
- Active state: soft `bg-primary/12` fill plus an inset `ring-1` instead of a
  `border`; borders changed box size and made rows visibly jump between states.
- Top bar: the breadcrumb is the single location label; a bold title identical to
  the last crumb (the "Workflow editor › Workflow editor" duplication) is suppressed.
- Editor activity rail: flattened from nested bordered boxes into a plain column of
  tiles sharing the sidebar's hover/active semantics, with `aria-pressed` state.
- `css.navItem` in `shared/tokens.ts` is retired; `readNavigationEntryClassName` is
  the single owner of nav-row classes.

Checklist:

- [x] `readNavigationEntryClassName` drives items and group toggles in both modes
- [x] Brand + toggle stacked when collapsed; chevron icon with `aria-label`/`aria-expanded`
- [x] Tooltips on every collapsed entry (items, groups, toggle)
- [x] Ring-based active highlight; no layout-shifting borders left in nav tokens
- [x] Header dedupes the title against the trailing breadcrumb label
- [x] Workflow editor rail flattened; `aria-pressed` on rail buttons
- [x] `Navigation.test.ts` updated + collapsed-tile/ring coverage added; local
      `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` green
- [x] CI green on the pushed head (`7604268`, run 35194277409: 19/19 steps, 3m36s)

---

## Follow-up addendum (2026-09-17): canvas drag-and-place & tidy-up layout

Review feedback on the workflow editor: the Nodes panel should open straight into the
palette, nodes should arrive by dragging (not only clicking), a dragged node must stay
where it is dropped (persisted), and the canvas needs n8n's "Tidy up" re-organization.

Root cause of the broken palette drag: `handleCanvasDragOver` validated the drag by
reading `dataTransfer.getData(custom mime)` — which browsers deliberately keep empty
until the drop — so `preventDefault()` never ran and the browser cancelled every drag.

Decisions:

- The dragover gate trusts the readable `types` list (`allowsWorkflowNodePaletteDrop`);
  the payload is only parsed at drop time. Pure helpers live in
  `workflows-editor-state.ts` so they are unit-testable without a browser.
- A drop places the node at the cursor (existing `handleAddNode(kind, position)` path);
  click-to-add keeps its deterministic grid slot.
- Dragging a node writes into the draft via `moveWorkflowNode`, marks the workflow
  unsaved, and the position travels with the saved definition — reload keeps it.
- `autoLayoutWorkflowDefinition`: longest-path layering left-to-right with a pass cap
  (cycles converge), per-layer vertical centering, orphaned nodes parked after the
  deepest layer, deterministic. Exposed as a "Tidy up" toolbar button
  (`workflows-canvas-tidy-layout`) which also fits the viewport afterwards, like n8n.
- The intro card above the palette is removed; the existing canvas hint row already
  teaches the gesture.
- New Playwright journey `workflows-editor-canvas.spec.ts` (desktop-only; compact
  viewports skip) covers drag-place → drag-move → save → reload → tidy → no overlap →
  save, so CI verifies the real browser behavior.

Checklist:

- [x] Palette drag accepted in `dragover` via the types list; foreign drags (text/files) still rejected
- [x] Palette entries moved from `<button>` to `role=button` divs (Blink ignores `draggable` on buttons)
- [x] `Component.setState` coalesces renders to one per frame; asset e2e journey is self-cleaning across retries
- [x] Dropped nodes land at the cursor; invalid payloads fall back to the grid slot
- [x] Intro card removed from the Nodes panel
- [x] Dragged positions persist through save and reload (unit + e2e coverage)
- [x] Tidy-up: layered, centered, cycle-safe, idempotent, undoable via edit history (it is a meaningful change)
- [x] Tidy-up button disabled while the canvas has <2 nodes; followed by fit-viewport
- [x] `workflows-editor-state.test.ts` +6 unit tests; typecheck/lint/test/build green locally
- [x] CI green on the pushed head (Playwright matrix incl. the new canvas journey) - run 35207018438, head e05d40a

---

## Follow-up addendum (2026-09-17): node menu visibility & tabbed node modal

Two issues reported from the canvas: the node "..." menu only appeared after
wiggling the mouse and vanished when trying to click an item; the node editor
modal crammed config + INPUT + OUTPUT into three columns.

Root cause of the menu bug: the hover toolbar (which contains the menu) was
visible only through `group-hover:opacity-100`, and every `setState` replaces
the DOM subtree under the cursor - `:hover` is only re-established on the next
mouse move, so the just-opened menu was invisible/un-clickable until the user
moved. Fix: while `nodeActionMenuId` (or the node's run submenu) is set, the
toolbar pins itself visible and above (z-40) via state, not hover; outside
clicks close it, Escape closes it first (before the modal-close semantics),
and the trigger got `workflows-node-action-trigger-<nodeId>` for tests.

Node modal restructure (`renderNodeDebugEditor`):

- Tabs: Configuration | Input | Output (`workflows-node-modal-tab-<tab>`),
  n8n-style; only the active panel is mounted (no 1.5-screen-wide grids).
- The centered 860px Configuration column keeps the existing inspector cards;
  the duplicate label/kind/status block was removed in favor of one status
  chip in the tab bar.
- Opening the modal always starts on Configuration; prev/next node stepping
  keeps the current tab so debugging a run does not lose context.
- `readWorkflowNodeEditorTab` (state module) sanitizes the tab value.
- Puppeteer validator drives the journey through the tabs (the debug panels
  are only mounted when their tab is active), keeping every prior assertion.
- Playwright canvas journey gained the menu regression: click the "..."
  trigger -> menu visible + toolbar computed opacity is exactly "1" without
  moving the mouse -> click empty canvas -> menu gone.

Checklist:

- [x] Menu opens on click without moving the mouse; pinned while open (state-driven visibility)
- [x] Outside click and Escape close the menu; item clicks keep closing their actions
- [x] Disabled menu items carry explanations (Deactivate, Pin output without run)
- [x] Node modal tabbed: Configuration/Input/Output, single status chip, tab kept across prev/next
- [x] `readWorkflowNodeEditorTab` sanitizer + 2 unit tests; full suite 683 green
- [x] Puppeteer validator journeys routed through the tabs (all previous assertions preserved)
- [ ] CI green on the pushed head (Playwright matrix + validate:workflows)
