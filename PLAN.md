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
  - [ ] Projects: create/open (workspace root)
  - [ ] Files: tree + read/write (restricted to project root)
  - [ ] Sessions: start/stop + streaming events (SSE)
  - [ ] History/logs retrieval
  - [ ] Providers: list/select + settings update
  - [ ] Kanban: board/columns/tasks CRUD (minimal)
- [ ] Auth: static token via env var `AUTH_TOKEN` (Bearer header)
- [ ] Workspace sandbox: path allowlist + command policy checks
- [ ] Dockerfile + minimal run docs

Acceptance:

- Server runs in Docker on Raspberry Pi and can execute sessions with SSE streaming.

## Milestone 3 — Web UI (single responsive PWA)

- [ ] Implement `apps/web-ui` as responsive, mobile-first
- [ ] PWA: manifest + service worker
- [ ] Server connection: configurable base URL + token
- [ ] Screens (minimal):
  - [ ] Projects (create/open/recent)
  - [ ] Repo explorer + Monaco editor
  - [ ] Runs: start, live stream logs, history
  - [ ] Settings: provider/model/precision, per project/profile
  - [ ] Kanban board: create/move tasks; show task details
- [ ] No Electron-specific code in UI

Acceptance:

- UI runs in browser/PWA and fully operates a remote server.

## Milestone 4 — Electron wrapper (reuses the same web UI)

- [ ] Implement `apps/desktop-main` to:
  - [ ] Run local server OR connect remote
  - [ ] Dev: load web UI dev URL; Prod: load built assets
  - [ ] Store secrets via OS keychain adapter (optional token)
- [ ] Desktop UX: connect/disconnect server URL; remember endpoints

Acceptance:

- Desktop runs and uses the same web UI without duplicating UI code.

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

## Deferred (explicitly out of scope)

- OAuth login flows (GitHub/Google)
- Multi-user collaboration
- Cloud sync / hosted SaaS
- Full plugin marketplace
