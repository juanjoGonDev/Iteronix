# PLAN.md

## Scope guardrails

- One UI only: responsive PWA reused across browser + Electron + optional server-hosted.
- API-first: UI always talks to server API (local or remote).
- Provider-agnostic from day 1: Codex is only one provider.
- Incremental milestones; each milestone must produce a runnable artifact.
- No extra features outside this plan. If needed, add a checkbox first.

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

## Milestone 1 — Core foundation (provider-agnostic)

- [x] Define `LLMProviderPort` + provider capabilities in `packages/domain`
- [x] Define run session model + event model (stream-friendly)
- [x] Define ports: history store, logs store, policy/permissions, filesystem, secrets (interfaces only)
- [x] Implement provider registry + settings (typed + validated via JSON schema)
- [x] Implement one provider adapter: `codex-cli` (spawn) in `packages/adapters`

Acceptance:

- Core can run a prompt via `codex-cli` provider and emit events.

### Provider usage & balance (best-effort)

- [ ] Extend provider capabilities to optionally support:
  - [ ] token usage reporting (per request/response)
  - [ ] cost estimation (optional)
  - [ ] balance/credits retrieval (optional; provider-dependent)
- [ ] Define `UsageReport` and `BalanceInfo` types where fields are optional and validated.

Acceptance:

- Providers that support usage can report it; others return "not available" without breaking flows.

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
  - [ ] submit-to-review (AI can create tasks directly in REVIEW)
  - [ ] approve (moves REVIEW → TODO)
  - [ ] request-changes (stores reviewer comment and moves back to IN_PROGRESS or stays in REVIEW)
  - [ ] close / reopen
  - [ ] delete (soft-delete preferred; keep audit trail)
- [ ] Persist reviewer comments/history per task (audit-friendly)
- [ ] Ensure permissions/policy checks for destructive actions (delete/close)

Acceptance:

- Tasks can be created in REVIEW, approved into TODO, or returned with comments.
- Close/reopen/delete actions work and are persisted.

### Per-project configuration (server)

- [ ] Add per-project config storage and API:
  - [ ] `maxLoops` (number | null). null = infinite loops allowed (must be explicitly enabled).
  - [ ] `onRunComplete` hooks (optional):
    - [ ] play sound (boolean, shell-dependent)
    - [ ] call webhook/API (url + method + headers + template payload)
- [ ] Validate config with JSON schema; reject unsafe configs.
- [ ] Ensure webhook calls are policy-checked (allowlist domains optional; at minimum: explicit opt-in per project).

Acceptance:

- Config is persisted per project and can be updated via API with validation.

## Milestone 3 - Web UI (single responsive PWA)

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

  - [ ] Header + Sidebar + Main + optional Right Panel
  - [ ] No per-screen shell variants

- [ ] Interaction completeness gate (per screen):

  - [ ] Every clickable element must either:
    - [ ] work end-to-end, OR
    - [ ] be visibly disabled + explain "Not available yet"
  - [ ] No broken menus, no dead buttons, no fake dropdowns, no placeholder navigation

- [ ] Add a “UI consistency checklist” (docs/UI_CHECKLIST.md):
  - [ ] menu order/icons unchanged across screens
  - [ ] header consistent
  - [ ] all navigation routes valid
  - [ ] interactive controls open/close correctly
  - [ ] disabled states have explanations
  - [ ] no regressions after changes

Acceptance:

- All screens share identical navigation order and header layout.
- All interactive elements are either functional or explicitly disabled with explanation.
- No screen introduces a new icon style or ad-hoc layout.

### Kanban: REVIEW column UX (web-ui)

- [ ] Add a `REVIEW` column view with:
  - [ ] Approve button (moves to TODO)
  - [ ] Request changes: comment input + action (moves back accordingly)
  - [ ] Close / Reopen actions
  - [ ] Delete action (with confirmation)
- [ ] Task detail panel shows:
  - [ ] reviewer comments (chronological)
  - [ ] status transitions history (timestamps)

Acceptance:

- User can fully manage REVIEW tasks from the UI similar to Jira.

### Per-project settings UX (web-ui)

- [ ] Add project settings section with:
  - [ ] Loop limit: infinite toggle + numeric max loops
  - [ ] On complete: sound toggle (if supported by current shell) (optional)
  - [ ] Optional webhook config (URL + payload preview + test button)
- [ ] Clear warnings for infinite loops and external webhooks.

Acceptance:

- User can configure project behavior safely and it persists.

### Conversation UX (web-ui)

- [ ] Show conversation list per run session:
  - [ ] createdAt / closedAt
  - [ ] preview of summary
- [ ] Allow user to open a specific conversation and view events/messages.

Acceptance:

- User can navigate conversation history easily and see summaries.

### Usage / balance display (web-ui)

- [ ] Add a usage panel showing:
  - [ ] tokens used (if available)
  - [ ] estimated cost (if available)
  - [ ] balance/credits (if available)
  - [ ] clear "Not available for this provider" states

Acceptance:

- UI displays usage/balance when supported and degrades gracefully otherwise.

## Milestone 4 — Electron wrapper (reuses the same web UI)

- [ ] Implement `apps/desktop-main` to:
  - [x] Run local server OR connect remote
  - [x] Dev: load web UI dev URL; Prod: load built assets
  - [x] Store secrets via OS keychain adapter (optional token)
- [x] Desktop UX: connect/disconnect server URL; remember endpoints

Acceptance:

- Desktop runs and uses the same web UI without duplicating UI code.

## Milestone 4.5 — Dev/Prod commands

Goal:

- Provide consistent commands to run everything in dev/watch and production.

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

Suggested behavior:

- `pnpm dev`:
  - starts `apps/server-api` in watch mode (SSE enabled)
  - starts `apps/web-ui` via Vite dev server
- `pnpm dev:desktop`:
  - starts Electron main and points to the web-ui dev server URL
- `pnpm build`:
  - builds packages (domain/shared/adapters)
  - builds server
  - builds web-ui (PWA)
  - optionally packages desktop (separate step if preferred)

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
  - [ ] Optional later: `pnpm package` (installer/binary)

## Milestone 5 — Auto-loop with strict JSON schema (provider-agnostic)

- [ ] Define strict agent step JSON schema (Ajv)
- [ ] Implement loop: validate → schema-error feedback → retry
- [ ] Context compaction: AGENTS.md + PLAN.md + latest AGENTS_LOGS.md entries
- [ ] Append AGENTS_LOGS.md entry per iteration

Acceptance:

- Auto-loop runs multiple steps and always outputs valid JSON.

### Conversation rotation (auto-summary)

- [ ] Introduce a session conversation model:
  - [ ] Each run session has one or more "conversations" with:
    - [ ] id, createdAt (Europe/Madrid), closedAt
    - [ ] messages (or event references)
    - [ ] rolling summary (string)
- [ ] Add auto-rotation policy:
  - [ ] When conversation size crosses a threshold (tokens estimate or message count), generate/update a compact summary and start a new conversation automatically.
  - [ ] The new conversation must include only: summary + essential pointers (files, decisions, next step).
- [ ] Persist conversation summaries and timestamps.

Acceptance:

- Long sessions stay responsive by rotating to new conversations automatically.
- Each conversation is timestamped and searchable in history.

## Milestone 6 — Quality gates + Git integration (server-first)

- [ ] Implement Git adapter (native `git` spawn)
- [ ] Expose git status/diff/commit endpoints
- [ ] Quality gates runnable by server; UI displays results
- [ ] Optional: auto-commit with Conventional Commits

Acceptance:

- Server can apply changes, run gates, and commit.

## Milestone 7 — Workflow graph editor (n8n-like)

- [ ] Add workflow editor in web UI (React Flow)
- [ ] Persist workflows per project
- [ ] Execute workflows via server API

Acceptance:

- Create and run a simple flow end-to-end.

## Milestone 8 — Plugins (v0, server-side)

- [ ] Plugin manifest + permission model
- [ ] Plugin loader on server
- [ ] Example plugin: webhook notifier for n8n

Acceptance:

- Install a plugin and emit an event.

## Final setup & deployment automation (post-development)

Goal:
Provide reproducible commands and automation to bootstrap infrastructure, build production artifacts, and run the system in a self-hosted environment (e.g. Raspberry Pi, Docker, reverse proxy).

This section MUST NOT be started until all previous milestones are fully completed and accepted.

---

### Unified commands (required)

Goal:
Ensure there is exactly one documented way to run the system in each mode.

- [ ] Ensure all services can be run using documented commands for:
  - [ ] Development / watch mode
  - [ ] Production build
  - [ ] Production run

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

---

### Setup automation (final stage)

Goal:
Provide a single, repeatable entrypoint to prepare a new machine for self-hosting.

- [ ] Provide a single setup command:
  - [ ] `pnpm setup` (preferred for cross-platform consistency)
- [ ] The setup command MUST:
  - [ ] Pull required Docker images
  - [ ] Create required Docker volumes and networks
  - [ ] Start infrastructure services (e.g. MySQL)
  - [ ] Print connection details and next operational steps

Rules:

- Setup automation MUST NOT start application services.
- Setup automation MUST NOT be required for development mode.

Acceptance:

- Running `pnpm setup` on a clean machine prepares all required infrastructure.
- No manual steps beyond environment variables are required.

---

### Docker & infrastructure

Goal:
Provide a minimal, production-ready Docker setup suitable for Raspberry Pi.

- [ ] Add `docker-compose.yml` (or `compose.yaml`) for infrastructure only:
  - [ ] MySQL service with persistent volume
  - [ ] Explicit environment configuration
- [ ] Add a multi-stage `Dockerfile` for the application:
  - [ ] Build stage: build server-api and web-ui
  - [ ] Runtime stage: run server-api and serve built web-ui
- [ ] Add commands:
  - [ ] `pnpm docker:build` (build production image)
  - [ ] `pnpm docker:run` (run production container)

Constraints:

- Containers MUST be suitable for ARM64 (Raspberry Pi).
- Docker is a deployment concern, not a development requirement.

---

### Docker container composition (mandatory)

- [ ] The production Docker image MUST include:
  - [ ] server-api runtime
  - [ ] built web-ui static assets
- [ ] The server MUST:
  - [ ] expose API under `/api`
  - [ ] serve the web UI under `/`
- [ ] A separate frontend container is NOT required for normal operation.

Acceptance:

- A single Docker container exposes both the API and the web UI.
- Accessing the container root URL loads the PWA.
- All `/api/*` endpoints function correctly.

---

### Optional publishing (explicitly optional)

- [ ] Image tagging and publishing:
  - [ ] `pnpm docker:tag`
  - [ ] `pnpm docker:push`
- [ ] Publishing steps MUST:
  - [ ] Require explicit configuration
  - [ ] Require explicit user confirmation

---

### Documentation (required)

- [ ] Add `docs/DEPLOYMENT.md` covering:
  - [ ] Local development (no Docker)
  - [ ] Production build and run
  - [ ] Docker usage
  - [ ] Raspberry Pi notes
  - [ ] Nginx reverse proxy example
  - [ ] Required environment variables (`AUTH_TOKEN`, ports, workspace root)

Acceptance:

- A new machine can be fully set up and running using only documented commands.
- No manual steps beyond environment variables are required.

## Deferred (explicitly out of scope)

- OAuth login flows (GitHub/Google)
- Multi-user collaboration
- Cloud sync / hosted SaaS
- Full plugin marketplace
