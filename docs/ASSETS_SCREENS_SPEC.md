# Assets screens specification — plugins parity, consistency, and CI database gates

Status: active
Owner: Workflows/assets product surface (this spec supersedes the orphaned "06." Notion
breakdown for the assets screens; see "Backlog reconciliation" below).

## Why this spec exists

The user report driving this change: `/assets/plugins` renders a dead screen — no usable
list, a registration form whose server-side contract rejects almost every submission, no
delete/enable controls, and an asset family that does not reuse the shared UI primitives
the rest of the app uses. Additionally, CI never runs the PostgreSQL migration
integration tests, which allowed a real migration-ordering bug to go unnoticed.

## Backlog reconciliation (abandoned PR triage)

| Notion item (06.x)                                             | Disposition | Evidence in this repo                                                                                       |
| -------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| Execution/history rail, deletable history, node details        | Done        | `Workflows.ts` + `workflows-debug-state.ts`, `/workflows/executions/{list,delete,run,stream}` server routes |
| Tokens/runtime/EUR cost + total accumulated EUR                | Done        | `estimatedCostSourceCurrency` (USD/EUR) in persisted run records; EUR rendering in `Workflows.ts`            |
| Reusable prompt/guardrail/asset model + usage + delete protection | Done      | `/assets/*` API, `prompt-asset-usage.ts`, usage-confirmed tombstone deletion                                 |
| Projects / History / Explorer screens                          | Discarded   | Explicitly retired by `PLAN.md` charter; enforced by `workflow-only-source-inventory.test.ts`               |
| `docs/WORKFLOWS_EDITOR_MVP.md` contract doc                    | Never landed | The abandoned PR referenced it; it does not exist. This document plus `PLAN.md` are the contract of record. |
| Triggers/schedule/webhook breadth (06.7)                       | Deferred    | Unchanged from the abandoned PR: out of MVP scope; `PLAN.md` Phase 6/7 owns graph evolution.                |

## Locked decisions

1. **Server-owned trust model stays.** Plugin registration remains an allowlist the server
   owns. We make the allowlist explicit to the UI instead of pretending the browser can
   choose freely: the trusted keys are listed in the assets list response and the form
   presents them as the only selectable registry keys. Operators extend the allowlist with
   `ITERONIX_TRUSTED_PLUGIN_IDS` (comma-separated); `reference.echo` is always included.
2. **One shared asset-workbench layer.** Every asset screen (Prompts, Skills, Memory &
   RAG, MCP, Plugins) renders through the same components: `PageIntro` header, `PageTabs`-
   style status summary, `AssetRowList`/`AssetRow`, `AssetEditorDialog`, `EmptyStatePanel`
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

- [ ] **Docs / contracts**
  - [ ] This spec lands first as the main commit of the change set.
  - [ ] `.env.example` documents `ITERONIX_TRUSTED_PLUGIN_IDS`.
  - [ ] CHANGELOG "Unreleased" lists the user-visible fixes.
- [ ] **Server**
  - [ ] `config.ts`: parse `ITERONIX_TRUSTED_PLUGIN_IDS` (validated, trimmed, deduped).
  - [ ] `TrustedPluginRegistry.trustedKeys()` enumeration; include the keys in the
        `/assets/list` response as `pluginRegistry.trustedKeys`.
  - [ ] Keep upsert rejection for non-allowlisted plugin keys (400, typed message).
  - [ ] Fix the migration-ordering defect exposed by the integration test: the
        "legacy audit rows" stage must stop at migration 002 (004 hard-depends on the
        `actor_kind` column introduced by 003).
  - [ ] Server tests: allowlist behavior, trusted-keys listing, env parsing.
- [ ] **Web UI shared layer**
  - [ ] `components/AssetWorkbench.ts`: `AssetRowList`, `AssetRow` (title/meta/badges/
        actions), `AssetEditorDialog` (overlay, header, form slot, footer with optional
        destructive action), `AssetStatusBadge` mapping (`enabled/disabled/error` → tokens).
  - [ ] `EmptyStatePanel` accepts an optional primary `action`.
  - [ ] `SettingsFields`: add `SettingsTextareaField` and `SettingsJsonField` (monospace,
        live parse + structural validation, visible state line) reusable by all screens.
- [ ] **Plugins screen**
  - [ ] List rows: status badge, key, runtime/isolation, limits, permissions summary,
        audit count + last event.
  - [ ] Create: trusted-key select (with helper text and empty-allowlist warning),
        display name, status toggle, capabilities, permissions, execution limit, timeout,
        input/output JSON schema fields with live validation.
  - [ ] Edit: prefill from persisted record; save updates and appends audit event
        (server-owned); cancel returns to catalog and restores URL state.
  - [ ] Enable/disable per row without opening the editor.
  - [ ] Delete with confirmation dialog (shared dialog footer), refresh + toast.
  - [ ] Empty state CTA opens the create form; error state offers Retry.
  - [ ] Preserve `plugin-assets-*` testids and `?mode=&plugin=` deep links.
- [ ] **Other asset screens adopt the shared layer (visual/structural only)**
  - [ ] Skills: row/dialog/fields via shared components; keep delete confirmation.
  - [ ] Memory & RAG: same.
  - [ ] MCP: same.
  - [ ] Prompts: same chrome; keep version history, usage links, and impact-confirmed
        deletion behavior exactly as-is.
- [ ] **Verification**
  - [ ] New web unit tests: plugin screen renders the full workbench, registration payload
        mapping, toggle/delete flows, error retry, invalid schema blocks Save.
  - [ ] Updated/new shared-client tests for the `pluginRegistry.trustedKeys` response.
  - [ ] Playwright: authenticated plugin CRUD journey (register → toggle → edit → delete)
        against the real server, run by the existing Docker CI step.
  - [ ] `pnpm lint`, `pnpm typecheck`, `pnpm deadcode`, `pnpm test`, `pnpm build` green.
  - [ ] CI (with the new Postgres service) green: `db:migrate`, `db:verify`,
        `test:db`, unit suites, Puppeteer validators, Playwright matrix.

## Out of scope

- New plugin runtime capabilities (execution stays server-side, process-isolated,
  `reference.echo` remains the only built-in plugin).
- Trigger/schedule/webhook breadth (PLAN Phase 6+), provider chain changes, and any
  editing of the mature Workflows screen behavior beyond shared-primitive compatibility.
- Kanban/Projects/History/Explorer surfaces (charter exclusions).
