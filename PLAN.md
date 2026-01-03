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
Provide reproducible commands and automation to bootstrap infrastructure, run the system in production, and support self-hosting (e.g. Raspberry Pi, Docker, reverse proxy).

This section MUST NOT be started until all core milestones are completed.

### Unified commands (required)

- [ ] Ensure all services can be run using documented commands:
  - [ ] Development / watch mode
  - [ ] Production build
  - [ ] Production run

Root-level commands (final state):

- `pnpm dev` → run server + web UI in watch mode
- `pnpm dev:server`
- `pnpm dev:web`
- `pnpm dev:desktop`
- `pnpm build` → build all artifacts
- `pnpm start` → run production server
- `pnpm preview:web` → serve built web UI locally

Acceptance:

- All commands work consistently across environments.
- No undocumented startup paths exist.

### Setup automation (final stage)

- [ ] Provide a single setup entrypoint:
  - [ ] `pnpm setup` (preferred for cross-platform)
- [ ] Setup must:
  - [ ] Pull required Docker images
  - [ ] Start infrastructure services (e.g. MySQL)
  - [ ] Create required volumes/networks
  - [ ] Print connection details and next steps

### Docker & infrastructure

- [ ] Add `docker-compose.yml` (or `compose.yaml`) for local/self-hosted infra:
  - [ ] MySQL service with persistent volume
  - [ ] Explicit environment configuration
- [ ] Add `Dockerfile` for server API
- [ ] Add commands:
  - [ ] `pnpm docker:build:server`
  - [ ] `pnpm docker:run:server`
- [ ] Containers must be suitable for Raspberry Pi (ARM64).

### Optional publishing (explicitly optional)

- [ ] Image tagging and pushing:
  - [ ] `pnpm docker:tag`
  - [ ] `pnpm docker:push`
- [ ] These steps MUST require explicit configuration and confirmation.

### Documentation (required)

- [ ] Add `docs/DEPLOYMENT.md` covering:
  - [ ] Local dev
  - [ ] Production run
  - [ ] Docker setup
  - [ ] Raspberry Pi notes
  - [ ] Nginx reverse proxy example
  - [ ] Required environment variables (AUTH_TOKEN, ports, workspace root)

Acceptance:

- A new machine can be fully set up using only documented commands.
- No manual steps beyond environment variables are required.

## Deferred (explicitly out of scope)

- OAuth login flows (GitHub/Google)
- Multi-user collaboration
- Cloud sync / hosted SaaS
- Full plugin marketplace
