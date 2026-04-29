# PLAN.md

## Scope guardrails

- One UI only: responsive PWA reused across browser + Electron + optional server-hosted.
- API-first: UI always talks to server API (local or remote).
- Provider-agnostic from day 1: Codex is only one provider (never hardcode to one provider).
- Incremental milestones; each milestone must produce a runnable artifact.
- No extra features outside this plan. If needed, add a checkbox first.
- Provider defaults:
  - Default provider MUST be `opencode-cli` once implemented.
  - `codex-cli` remains optional to install/configure.

---

## Milestone 0 — Repo bootstrap (empty folder → healthy monorepo)

- [x] Initialize git repository
  - [x] Create `.gitignore` with rules for:
    - Node.js
    - PNPM
    - Vite
    - Electron
    - OS-specific files (macOS, Windows, Linux)
    - Build artifacts
    - Environment files
    - (Include that you consider necessary)
- [x] Create PNPM workspace
- [x] Setup TS strict across all apps/packages
- [x] Setup ESLint strict (no any, no unsafe patterns)
- [x] Setup Vitest minimal harness
- [x] Create base folder structure:
  - [x] apps/server-api
  - [x] apps/web-ui
  - [x] apps/desktop-main
  - [x] packages/domain
  - [x] packages/adapters
  - [x] packages/shared
  - [x] docs
- [x] Root scripts: lint, typecheck, test, build
- [x] Add AGENTS.md and AGENTS_LOGS.md
- [x] Establish test structure for domain and shared packages (TDD-ready)

Acceptance:

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` all pass.

---

## Milestone 1 — Core foundation (provider-agnostic)

- [x] Define `LLMProviderPort` + provider capabilities in `packages/domain`
- [x] Define run session model + event model (stream-friendly)
- [x] Define ports: history store, logs store, policy/permissions, filesystem, secrets (interfaces only)
- [x] Implement logs store adapter: `file-logs-store` in `packages/adapters`
- [x] Implement provider registry + settings (typed + validated via JSON schema)
- [x] Implement one provider adapter: `codex-cli` (spawn) in `packages/adapters`

Acceptance:

- Core can run a prompt via `codex-cli` provider and emit events.

### Provider usage & balance (best-effort)

- [ ] Extend provider capabilities to optionally support:
  - [x] token usage reporting (per request/response)
  - [x] cost estimation (optional)
  - [x] balance/credits retrieval (optional; provider-dependent)
- [ ] Define `UsageReport` and `BalanceInfo` types where fields are optional and validated.

Acceptance:

- Providers that support usage can report it; others return "not available" without breaking flows.

---

## Milestone 1.5 — Add `opencode-cli` provider (default)

Goal:
Add a second CLI provider (`opencode-cli`) and make it the default provider for new projects/profiles. `codex-cli` remains supported but optional.

- [ ] Research and document `opencode` CLI invocation model in `docs/providers/opencode-cli.md`:
  - [x] install instructions
  - [x] required env vars / auth
  - [x] prompt input method
  - [x] output format and streaming behavior (if any)
  - [x] exit codes and error patterns
- [ ] Implement `opencode-cli` provider adapter in `packages/adapters` (spawn-based):
  - [x] conforms to `LLMProviderPort`
  - [x] supports streaming if `opencode` supports it; otherwise buffer + emit events consistently
  - [x] maps CLI failures to typed provider errors
- [ ] Add provider registry entry for `opencode-cli`:
  - [x] `id`, `displayName`, `type=cli`, capabilities, models (or dynamic listing if supported)
  - [x] `configurationSchema` (JSON schema) for settings
- [ ] Set `opencode-cli` as the default selection for:
  - [x] new projects
  - [x] new profiles
- [ ] Keep `codex-cli` optional:
  - [x] do NOT require it at install time
  - [x] UI must clearly show "not installed" / "not configured" states for providers
- [ ] Add tests:
  - [x] domain-level provider registry/selection behavior
  - [x] adapter-level spawn command building (pure, unit-testable)

Acceptance:

- A new project defaults to `opencode-cli`.
- User can switch to `codex-cli` if installed/configured.
- Running a prompt works through `opencode-cli` and emits the same event model.

---

## Milestone 2 — Headless server API (Docker-ready, server-first)

- [ ] Implement `apps/server-api` HTTP API for:
  - [x] Projects: create/open (workspace root)
  - [x] Files: tree + read/write (restricted to project root)
  - [x] Sessions: start/stop + streaming events (SSE)
  - [x] History/logs retrieval
  - [x] Providers: list/select + settings update
  - [x] Kanban: board/columns/tasks CRUD (minimal)
- [x] Auth: static token via env var `AUTH_TOKEN` (Bearer header)
- [x] Workspace sandbox: path allowlist + command policy checks
- [x] Dockerfile + minimal run docs

Acceptance:

- Server runs in Docker on Raspberry Pi and can execute sessions with SSE streaming.

### Kanban: REVIEW workflow (server)

- [ ] Add support for a `REVIEW` column in the Kanban domain model (between IDEAS and TODO, or configurable)
- [ ] Add task lifecycle actions via API:
  - [x] submit-to-review (AI can create tasks directly in REVIEW)
  - [x] approve (moves REVIEW → TODO)
  - [x] request-changes (stores reviewer comment and moves back to IN_PROGRESS or stays in REVIEW)
  - [x] close / reopen
  - [x] delete (soft-delete preferred; keep audit trail)
- [ ] Persist reviewer comments/history per task (audit-friendly)
- [ ] Ensure permissions/policy checks for destructive actions (delete/close)

Acceptance:

- Tasks can be created in REVIEW, approved into TODO, or returned with comments.
- Close/reopen/delete actions work and are persisted.

### Per-project configuration (server)

- [ ] Add per-project config storage and API:
  - [x] `maxLoops` (number | null). null = infinite loops allowed (must be explicitly enabled).
  - [x] `onRunComplete` hooks (optional):
    - [x] play sound (boolean, shell-dependent)
    - [x] call webhook/API (url + method + headers + template payload)
- [ ] Validate config with JSON schema; reject unsafe configs.
- [ ] Ensure webhook calls are policy-checked (allowlist domains optional; at minimum: explicit opt-in per project).

Acceptance:

- Config is persisted per project and can be updated via API with validation.

---

## Milestone 3 — Web UI (single responsive PWA)

- [x] Implement `apps/web-ui` as responsive, mobile-first
- [x] PWA: manifest + service worker
- [x] Server connection: configurable base URL + token
- [x] Screens (minimal):
  - [x] Projects (create/open/recent)
  - [x] Repo explorer + Monaco editor
- [x] Runs: start, live stream logs, history
- [x] Settings: provider/model/precision, per project/profile
- [x] Kanban board: create/move tasks; show task details
- [x] Separate each screen into its own component, dont repeat code, use shared components/utilitiesm but with a single responsibility (apply to all screens)
- [ ] Component-first screen scaffolding:
  - [x] Shared page-level primitives own screen title, intro text, alert stack and tab chrome
  - [x] `Dashboard` and `Settings` use the shared page scaffolding instead of screen-local wrappers
  - [x] Remaining standard screens adopt the shared page scaffolding instead of duplicating page wrappers
  - Component primitive progress on `2026-04-29`: `Projects`, `Workflows` and `History` now use shared page scaffolding and shared workbench field/meta primitives; `Explorer` keeps its full-height workbench shell while reusing shared notice chrome
- [x] Emit browser-ready JS for web UI modules via tsc build output
- [x] Shared styles, fonts, icons, etc. Use glogal variables and CSS custom properties. Dont repeat styles.
- [x] Make sure all screens use always the same layout structure (header, sidebar, main content, footer, styles, etc.)
- [x] No Electron-specific code in UI

Acceptance:

- UI runs in browser/PWA and fully operates a remote server.

### UI continuity & interaction completion (mandatory)

Goal:
Prevent inconsistent navigation/iconography and avoid partially working UI.

- [x] Establish global UI invariants (single source of truth):
  - [x] Sidebar menu: canonical items, order, labels, icons, grouping
  - [x] Header layout: canonical structure and global actions
  - [x] One icon set for the entire app (no mixing)
  - [x] Shared tokens: spacing/typography/colors/radius/shadows
- [x] Implement a single Layout Shell used by all screens:

  - [x] Header + Sidebar + Main + optional Right Panel
  - [x] No per-screen shell variants
- [ ] All screens use shared page scaffolding for page title, notices, tabs and top-level content rhythm:
  - [x] Shared page scaffold extracted for `apps/web-ui`
  - [x] Remove duplicated page wrappers from the remaining standard screens

- [ ] Interaction completeness gate (per screen):

  - [x] Every clickable element must either:
    - [x] work end-to-end, OR
    - [x] be visibly disabled + explain "Not available yet"
  - [x] No broken menus, no dead buttons, no fake dropdowns, no placeholder navigation
  - [x] Main sidebar navigation scrolls independently on short viewports so every route remains reachable

- [x] Add a "UI consistency checklist" (docs/UI_CHECKLIST.md):
  - [x] menu order/icons unchanged across screens
  - [x] header consistent
  - [x] all navigation routes valid
  - [x] interactive controls open/close correctly
  - [x] disabled states have explanations
  - [x] no regressions after changes

Acceptance:

- All screens share identical navigation order and header layout.
- All interactive elements are either functional or explicitly disabled with explanation.
- No screen introduces a new icon style or ad-hoc layout.

### Kanban: REVIEW column UX (web-ui)

- [ ] Add a `REVIEW` column view with:
  - [x] Approve button (moves to TODO)
  - [x] Request changes: comment input + action (moves back accordingly)
  - [x] Close / Reopen actions
  - [x] Delete action (with confirmation)
- [ ] Task detail panel shows:
  - [x] reviewer comments (chronological)
  - [x] status transitions history (timestamps)

Acceptance:

- User can fully manage REVIEW tasks from the UI similar to Jira.

### Per-project settings UX (web-ui)

- [ ] Add project settings section with:
  - [x] Loop limit: infinite toggle + numeric max loops
  - [x] On complete: sound toggle (if supported by current shell) (optional)
  - [x] Optional webhook config (URL + payload preview + test button)
- [ ] Clear warnings for infinite loops and external webhooks.

Acceptance:

- User can configure project behavior safely and it persists.

### Conversation UX (web-ui)

- [ ] Show conversation list per run session:
  - [x] createdAt / closedAt
  - [x] preview of summary
- [ ] Allow user to open a specific conversation and view events/messages.

Acceptance:

- User can navigate conversation history easily and see summaries.

### Usage / balance display (web-ui)

- [ ] Add a usage panel showing:
  - [x] tokens used (if available)
  - [x] estimated cost (if available)
  - [x] balance/credits (if available)
  - [x] clear "Not available for this provider" states

Acceptance:

- UI displays usage/balance when supported and degrades gracefully otherwise.

---

## Milestone 4 — Electron wrapper (reuses the same web UI)

- [ ] Implement `apps/desktop-main` to:
  - [x] Run local server OR connect remote
  - [x] Dev: load web UI dev URL; Prod: load built assets
  - [x] Store secrets via OS keychain adapter (optional token)
- [x] Desktop UX: connect/disconnect server URL; remember endpoints

Acceptance:

- Desktop runs and uses the same web UI without duplicating UI code.

---

## Milestone 4.5 — Dev/Prod commands

Goal:
Provide consistent commands to run everything in dev/watch and production.

### Root scripts (required)

- [x] Add root `package.json` scripts for:
  - [x] `pnpm dev` (runs server + web-ui in watch mode)
  - [x] `pnpm dev:server` (watch mode)
  - [x] `pnpm dev:web` (watch mode)
  - [x] `pnpm dev:desktop` (Electron main + loads web-ui dev server)
  - [x] `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` (workspace-wide)
  - [x] `pnpm clean` (workspace-wide)
  - [x] `pnpm start` (production server)
  - [x] `pnpm preview:web` (serve built web-ui locally)
- [x] Ensure all scripts work on macOS/Linux/Windows where possible.

Acceptance:

- `pnpm dev` starts server + web-ui with hot reload.
- `pnpm dev:desktop` runs the Electron wrapper using the same web UI.
- `pnpm build` produces production artifacts.
- `pnpm start` runs the production server using built output.

### Server-api commands (apps/server-api)

- [x] Provide scripts:
  - [x] `pnpm dev` (watch mode)
  - [x] `pnpm build`
  - [x] `pnpm start` (prod run)
        Implementation hint:
- Use a watch runner suitable for TS (e.g., tsx watch) and ensure typecheck is separate.

### Web-ui commands (apps/web-ui)

- [x] Provide scripts:
  - [x] `pnpm dev` (Vite)
  - [x] `pnpm build`
  - [x] `pnpm preview`
- [x] PWA build must be part of `pnpm build` (root).

### Desktop wrapper commands (apps/desktop-main)

- [x] Provide scripts:
  - [x] `pnpm dev` (runs Electron main in watch mode; loads web-ui dev URL)
  - [x] `pnpm build` (build main process)
  - [x] Optional later: `pnpm package` (installer/binary)

---

## Milestone 5 — Auto-loop with strict JSON schema (provider-agnostic)

- [ ] Define strict agent step JSON schema (Ajv)
- [ ] Implement loop: validate → schema-error feedback → retry
- [ ] Context compaction: AGENTS.md + PLAN.md + latest AGENTS_LOGS.md entries
- [ ] Append AGENTS_LOGS.md entry per iteration

Acceptance:

- Auto-loop runs multiple steps and always outputs valid JSON.

### Conversation rotation (auto-summary)

- [ ] Introduce a session conversation model:
  - [x] Each run session has one or more "conversations" with:
    - [x] id, createdAt (Europe/Madrid), closedAt
    - [x] messages (or event references)
    - [x] rolling summary (string)
- [ ] Add auto-rotation policy:
  - [x] When conversation size crosses a threshold (tokens estimate or message count), generate/update a compact summary and start a new conversation automatically.
  - [x] The new conversation must include only: summary + essential pointers (files, decisions, next step).
- [ ] Persist conversation summaries and timestamps.

Acceptance:

- Long sessions stay responsive by rotating to new conversations automatically.
- Each conversation is timestamped and searchable in history.

---

## Milestone 6 — Quality gates + Git integration (server-first)

- [x] Implement Git adapter (native `git` spawn)
- [x] Expose git status/diff/commit endpoints
- [x] Expose git stage/unstage/revert endpoints inside the workspace sandbox
- [x] Quality gates runnable by server with typed run/list/events/stream endpoints
- [x] UI displays quality gate results
- [x] UI displays Git repository status, staged/unstaged diffs, and Conventional Commit creation in the `Projects` screen
- [x] UI exposes server-first stage/unstage/revert controls with confirmation for destructive revert actions
- [x] UI supports multi-select Git workspace actions and file-focused diff navigation in the `Projects` screen
- [x] Git adapter/API/UI support branch listing, local branch creation, and branch checkout inside the `Projects` workspace
- [x] Git adapter/API/UI support publishing the current branch to `origin` and pushing tracked upstreams from the `Projects` workspace
- [x] Add deterministic Puppeteer validation for the `Projects` Git workspace flow using a stub API server and local browser storage seeding
- [x] Integrate the `Projects` Git workspace browser validation into CI with the same Puppeteer prerequisites and failure-only screenshot artifacts
- [ ] Optional: auto-commit with Conventional Commits

Acceptance:

- Server can apply changes, run gates, and commit.

## Milestone 6.5 — AI Engineering Workbench

- [x] Add shared AI runtime package with typed config, run context, evidence, and usage models
- [x] Add hierarchical memory package with working, episodic, and semantic memories plus TTL and retention policies
- [x] Add skills runtime with on-disk manifests, schema validation, guardrails, memory integration, and evidence capture
- [x] Add RAG package with ingestion, chunking, retrieval, citations, credibility scoring, and cache-aware gating
- [x] Add MCP interoperability package with Iteronix MCP server exposure and external MCP client adapters
- [x] Add multi-agent workflow orchestration with planner, retriever, executor, reviewer, and human checkpoint support
- [x] Add evaluation harness with JSONL datasets, regression checks, and CI smoke coverage
- [x] Expose server API endpoints for skill runs, agent workflows, eval runs, and memory queries
- [x] Add observability bootstrap, OTLP tracing support, README, deployment docs, CI workflow, and example skill assets
- [x] Add Workflows UI for example skill runs, reviewer-gated workflows, citations, confidence, memory, and evidence
- [x] Add History UI for persisted run browsing, evidence inspection, and minimal eval-suite execution/results
- [x] Collapse repeated citations by source in skill/API responses while preserving chunk-level evidence provenance for traces and reports
- [x] Add expandable UI provenance for collapsed citations in Workflows and History without changing the server API
- [x] Add compact per-source provenance summary to the evidence panel using retrieved chunk counts without changing citation expansion
- [x] Add source-aware evidence filtering in the shared evidence panel so summary rows can isolate chunk-level provenance without changing server APIs
- [x] Link collapsed citation selection to the shared evidence panel so choosing a source focuses the matching document provenance in Workflows and History
- [x] Add deterministic Puppeteer validation for collapsed-citation source linking and evidence filter clearing in `apps/web-ui`
- [x] Integrate the browser source-linking validation into CI with Puppeteer prerequisites and failure-only screenshot artifacts
- [x] Retain only the latest local browser-validation screenshots by default, with an explicit preserve flag for manual debugging
- [x] Add a dedicated `validate:source-linking:preserve` script in `apps/web-ui` so manual debugging can keep prior screenshots without pnpm argument forwarding syntax
- [x] Document the browser validation workflows and screenshot-retention behavior in `README.md` and `docs/AI_WORKBENCH.md`
- [x] Document the browser validation commands in `docs/RUNNING.md` so the operational reference stays aligned with the README and AI workbench guides
- [x] Consolidate browser-validation documentation so `docs/RUNNING.md` is the canonical command reference and other docs link back to it
- [x] Add compact browser-validation reference tables to `README.md` and `docs/RUNNING.md` without reintroducing duplicated long-form guidance
- [x] Add deterministic Puppeteer validation for the `Projects` quality-gates flow using a stub API server and local browser storage seeding
- [x] Integrate the `Projects` quality-gates browser validation into CI with the same Puppeteer prerequisites and failure-only screenshot artifacts
- [x] Document in `docs/RUNNING.md` that CI executes both browser validations, with `docs/AI_WORKBENCH.md` linking back to the canonical command reference
- [x] Document the `validate:quality-gates` command in `README.md` as a short summary that links back to `docs/RUNNING.md`

Acceptance:

- Server API can execute a skill run end to end using memory, optional retrieval, citations, confidence, and evidence reporting.
- A multi-agent workflow can execute planner → retriever → executor → reviewer with policy-bound tool access.
- CI runs lint, typecheck, tests, build, the browser source-linking validation, and the minimal eval suite.
- The web UI can run the example skill and reviewer workflow end to end, show citations/confidence/evidence, and browse eval results/history.

---

## Milestone 7 — Workflow graph editor (n8n-like)

- [ ] Add workflow editor in web UI (React Flow)
- [ ] Persist workflows per project
- [ ] Execute workflows via server API

Acceptance:

- Create and run a simple flow end-to-end.

---

## Milestone 8 — Plugins (v0, server-side)

- [ ] Plugin manifest + permission model
- [ ] Plugin loader on server
- [ ] Example plugin: webhook notifier for n8n

Acceptance:

- Install a plugin and emit an event.

---

## Final setup & deployment automation (post-development)

Goal:
Provide reproducible commands and automation to bootstrap infrastructure, build production artifacts, and run the system in a self-hosted environment (e.g. Raspberry Pi, Docker, reverse proxy).

This section MUST NOT be started until all previous milestones are fully completed and accepted.

### Unified commands (required)

Goal:
Ensure there is exactly one documented way to run the system in each mode.

- [ ] Ensure all services can be run using documented commands for:
  - [x] Development / watch mode
  - [x] Production build
  - [x] Production run

#### Root-level commands (final state)

- `pnpm dev` → run server-api + web-ui in watch mode
- `pnpm dev:server`
- `pnpm dev:web`
- `pnpm dev:desktop`
- `pnpm build` → build all production artifacts
- `pnpm start` → run production server using built output
- `pnpm preview:web` → serve built web-ui locally (debug only)

Acceptance:

- All commands behave consistently across environments (macOS/Linux/Windows where applicable).
- There are no undocumented startup paths.
- Dev commands NEVER depend on Docker.

### Setup automation (final stage)

Goal:
Provide a single, repeatable entrypoint to prepare a new machine for self-hosting.

- [ ] Provide a single setup command:
  - [x] `pnpm setup` (preferred for cross-platform consistency)
- [ ] The setup command MUST:
  - [x] Pull required Docker images
  - [x] Create required Docker volumes and networks
  - [x] Start infrastructure services (e.g. MySQL)
  - [x] Print connection details and next operational steps

Rules:

- Setup automation MUST NOT start application services.
- Setup automation MUST NOT be required for development mode.

Acceptance:

- Running `pnpm setup` on a clean machine prepares all required infrastructure.
- No manual steps beyond environment variables are required.

### Docker & infrastructure

Goal:
Provide a minimal, production-ready Docker setup suitable for Raspberry Pi.

- [ ] Add `docker-compose.yml` (or `compose.yaml`) for infrastructure only:
  - [x] MySQL service with persistent volume
  - [x] Explicit environment configuration
- [ ] Add a multi-stage `Dockerfile` for the application:
  - [x] Build stage: build server-api and web-ui
  - [x] Runtime stage: run server-api and serve built web-ui
- [ ] Add commands:
  - [x] `pnpm docker:build` (build production image)
  - [x] `pnpm docker:run` (run production container)

Constraints:

- Containers MUST be suitable for ARM64 (Raspberry Pi).
- Docker is a deployment concern, not a development requirement.

### Docker container composition (mandatory)

- [ ] The production Docker image MUST include:
  - [x] server-api runtime
  - [x] built web-ui static assets
- [ ] The server MUST:
  - [x] expose API under `/api`
  - [x] serve the web UI under `/`
- [ ] A separate frontend container is NOT required for normal operation.

Acceptance:

- A single Docker container exposes both the API and the web UI.
- Accessing the container root URL loads the PWA.
- All `/api/*` endpoints function correctly.

### Optional publishing (explicitly optional)

- [ ] Image tagging and publishing:
  - [x] `pnpm docker:tag`
  - [x] `pnpm docker:push`
- [ ] Publishing steps MUST:
  - [x] Require explicit configuration
  - [x] Require explicit user confirmation

### Documentation (required)

- [ ] Add `docs/DEPLOYMENT.md` covering:
  - [x] Local development (no Docker)
  - [x] Production build and run
  - [x] Docker usage
  - [x] Raspberry Pi notes
  - [x] Nginx reverse proxy example
  - [x] Required environment variables (`AUTH_TOKEN`, ports, workspace root)
  - [x] Align browser-validation wording across `README.md`, `docs/RUNNING.md`, and `docs/AI_WORKBENCH.md`

Acceptance:

- A new machine can be fully set up and running using only documented commands.
- No manual steps beyond environment variables are required.

### Current focus — screen stabilization order

Goal:
Stop cross-screen churn and finish the PWA one screen at a time with browser validation and no dead controls.

- [ ] Browser validation baseline:
  - [ ] Keep one canonical browser-validation path during stabilization
  - [ ] Document whether the repo standard remains Stagehand/Puppeteer or moves to Playwright
- [ ] Explorer:
  - [ ] Replace hardcoded tree/content in `apps/web-ui/src/screens/Explorer.ts`
  - [ ] Connect to `/files/tree` and `/files/read`
  - [ ] Validate the route with a deterministic browser flow
  - Responsive behavior is mandatory for this screen and every remaining screen task; the Notion board was annotated accordingly on `2026-04-28`
  - Implementation completed on `2026-04-27`; keep the Notion card in `En progreso` until explicit user confirmation
  - Dev-runtime fix completed on `2026-04-27`: web UI remains on `http://localhost:4000`, while `pnpm dev` and `pnpm dev:server` now run the backend watcher on `http://localhost:4001` and the client auto-corrects stale self-pointing local server URLs
  - UX refinement completed on `2026-04-27`: global project selector moved to the sidebar, the local `Project session` block was removed, the explorer now renders as a single integrated VS Code-style workspace, search applies with debounce while typing, and preview coloring is language-aware for `txt`, `json`, `ts`, and `js`
  - Search focus fix completed on `2026-04-27`: the Explorer search now keeps focus across debounce-driven filtering, restarts the debounce on new typing, and remains case-insensitive
  - Recursive search discovery fix completed on `2026-04-27`: searching now loads undiscovered nested directories before filtering so matches are not limited to folders already opened manually
  - Responsive shell refinement completed on `2026-04-28`: the shared `Button` now forwards data attributes, the app shell auto-collapses to a compact rail on narrow viewports, and `Explorer` renders an integrated responsive workbench with file/editor toggles validated in browser automation
  - VS Code-like workbench refinement completed on `2026-04-28`: `Explorer` now splits `Explorer` and `Search` into separate activity panels, hides/restores the workbench sidebar, supports expand-all/collapse-all for the file tree, and runs server-backed content search through `/files/search` with debounce, regex, case-match and whole-word toggles; repository search ignores `.git`, `node_modules`, `dist`, `build`, and `coverage` for deterministic performance
  - Editor workflow refinement completed on `2026-04-28`: `Explorer` now supports multiple open tabs, pinning, tab context actions (`close`, `close left`, `close right`, `close all`), persisted open files per workspace, and exact line reveal from search results with temporary visual highlighting
  - Shell decoupling fix completed on `2026-04-28`: collapsing the global app sidebar no longer remounts the active Explorer screen, so the internal Explorer/Search panel state is independent from the main navigation shell
  - Large-file preview refinement completed on `2026-04-28`: `/files/read` now supports bounded line windows, the Explorer opens heavy files through lazy preview slices, and users can page backward, forward, or load the full file without blocking the workbench on first open
  - Lazy preview scroll refinement completed on `2026-04-28`: manual preview paging controls were removed, large files now extend the visible window automatically when the editor scroll nears the top or bottom, and the browser harness validates range expansion instead of fixed single-chunk pagination
  - Lazy preview stability refinement completed on `2026-04-28`: bottom-side lazy loading now preserves the current editor scroll position instead of snapping back to the top, and prefetch starts before the absolute end of the current preview window
  - Preview readability refinement completed on `2026-04-28`: bottom-side lazy loading now starts once the user is past roughly 60% of the preview scroll range, and long lines wrap inside the editor instead of clipping horizontally
  - Tree and tabs stability refinement completed on `2026-04-28`: opening a file from the tree preserves the current tree scroll position, while the editor tab strip now overflows horizontally instead of clipping open files
  - Search results control refinement completed on `2026-04-28`: per-file search result groups can now collapse or hide independently, and those controls reset cleanly on each new search request so the flow stays close to VS Code semantics without adding replace mode
  - Real-app validation completed on `2026-04-28`: the live `localhost` workbench confirms representative tab overflow, tree scroll preservation for visible file clicks, lazy preview paging for `apps/server-api/src/server.ts`, and collapse/hide/reset behavior for grouped search results
  - User acceptance completed on `2026-04-28`: Explorer is now the finished reference screen for the stabilization pass; direct Notion status mutation is still blocked by connector validation, so the board handoff was recorded through comments plus repo logs
- [ ] Settings:
  - [ ] Remove `coming soon` and `console.log` actions from active controls
  - [ ] Persist supported settings through existing server and local storage contracts
  - [ ] Validate load/edit/save/reload with browser automation
  - Active screen task since `2026-04-28`: Settings is now the single focus after Explorer acceptance, and responsive behavior remains mandatory
  - Product clarification recorded on `2026-04-28`: Settings configures multiple provider profiles and models; it does not activate a single global provider because workflows may mix providers and models later
  - Implementation progress on `2026-04-28`: `Settings` now persists provider profiles, workflow limits, notifications and API access through local browser storage, while Codex CLI profiles sync to `/providers/settings` when an active project exists
  - Browser validation progress on `2026-04-28`: deterministic Puppeteer coverage now exercises load -> edit -> save -> reload, including local-only Anthropic profile persistence, Codex CLI backend sync, webhook test, and API connection check
  - Visual refinement progress on `2026-04-28`: contrast and spacing of `Settings` were reworked for the live shell, and Playwright desktop/mobile screenshots now validate the responsive layout before user acceptance
  - UI cleanup progress on `2026-04-28`: residual empty status chips were traced to the shared component renderer, fixed at the helper level, and removed from `Settings` where they added no value
  - Button semantics progress on `2026-04-28`: destructive actions in `Settings` now use the shared rose danger variant, and the shared button token was tightened so destructive intent is visible and consistent across screens
  - Component scaffolding progress on `2026-04-29`: shared `PageScaffold` primitives now own screen intro, notices and tabs, and `Settings` was migrated off its screen-local light wrapper to align with the shared shell model
  - Form component progress on `2026-04-29`: provider, limits, notifications and API field markup now comes from shared `SettingsFields` components instead of screen-local helper functions, keeping existing test ids intact
  - Visual component fix on `2026-04-29`: shared page headers and tabs now use readable light-surface contrast, `Settings` toggles render through reusable switch styling, feedback uses stackable dismissible toasts, and the save action bar is a solid responsive footer instead of a translucent panel
  - Global feedback fix on `2026-04-29`: `PageNoticeStack` now publishes all screen notices as fixed global toasts with auto-dismiss and close controls, and the `Projects` browser validation guards against the legacy inline alert returning
  - Explorer toast gap fix on `2026-04-29`: `Explorer` no longer wraps global notice toasts in a padded inline container, so refreshing/reloading the tree does not leave the old alert space above the editor
- [ ] Kanban:
  - [x] Replace local seed board state with `/kanban/*` persistence
  - [x] Persist create/edit/move/delete flows
  - [ ] Validate the board with a deterministic browser flow
  - Component primitive progress on `2026-04-29`: board columns, task cards and the task detail modal now render through shared `KanbanPrimitives` instead of screen-local shell markup; placeholder menu buttons are disabled with explanatory tooltips
  - Persistence progress on `2026-04-29`: `Kanban` now opens the active project through the server, ensures a canonical board and columns through `/kanban/*`, reloads tasks from the API after load/create/move/edit/delete, and no longer uses seeded local tasks as source of truth
- [ ] Dashboard:
  - [ ] Replace showcase metrics and rows with real overview data
  - [ ] Remove dead quick actions
  - [ ] Validate overview navigation and one real action in browser automation
  - Component primitive progress on `2026-04-29`: metrics, live activity and quick actions now render through shared `OverviewPrimitives` instead of screen-local card and panel shells
- [ ] Regression lock:
  - [ ] Keep `Projects`, `Workflows`, and `History` green while unfinished screens are completed
  - [ ] Avoid reopening mature screens for cosmetic churn during stabilization

---

## Deferred (explicitly out of scope)

- OAuth login flows (GitHub/Google)
- Multi-user collaboration
- Cloud sync / hosted SaaS
- Full plugin marketplace
