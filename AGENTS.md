# AGENTS.md

## 1) Project

**Name (working):** Iteronix (see "Naming" below)  
**Goal:** Build a single tool to orchestrate coding agents and workflows against a repository, with strict quality gates, strong auditability, and a modular LLM/provider system.

The system must support:

- Provider-agnostic AI execution (Codex CLI first; future Gemini/others via providers).
- A single responsive **PWA-first UI** reused across:
  1. Browser/PWA (primary UI)
  2. Electron desktop wrapper (same UI)
  3. Server-hosted UI (optional)
- A **Headless server** (Docker-ready, Raspberry Pi friendly) exposing a typed HTTP API used by the UI in all modes.
- Repo browsing/editing (Monaco) and git operations.
- Kanban board (Jira-style panels): IDEAS → TODO → IN_PROGRESS → QA → DONE
- Workflow graph editor (n8n-like) using React Flow.
- Plugin system (server-side) with permissions (e.g., n8n webhook, Telegram).

## 2) Non-negotiables

- TypeScript 100% strict everywhere. No `any`, no unsafe casts.
- No comments in code.
- Clean architecture / hexagonal:
  - Domain = pure logic + ports (interfaces)
  - Adapters = side effects (FS, git, process spawn, HTTP, secrets)
  - Shells = server / web UI / desktop wrapper
- SOLID + clean code. Small cohesive modules.
- Prefer pure functions; isolate side effects behind ports/adapters.
- Deterministic builds; minimal dependencies.
- Always pass quality gates for merged changes.

## 3) Code conventions

- Function order (top-down call order): if `a()` calls `c()` and `c()` calls `b()`, declare `a`, then `c`, then `b`.
- Avoid giant files; prefer composition and clear boundaries.
- No magic strings; use enums/unions/constants.
- Use `unknown` + runtime validation for untrusted inputs (HTTP, provider outputs, plugin payloads).
- Error handling: use a consistent approach (typed Result or typed exceptions) per package; prefer typed Results in domain.

## 4) Architecture (mandatory)

### 4.1 Monorepo layout (target)

- `apps/server-api/` — Headless API server (Node.js)
- `apps/web-ui/` — Single UI (responsive PWA)
- `apps/desktop-main/` — Electron main wrapper (loads web-ui)
- `packages/domain/` — Use-cases, entities, ports, policies (no side effects)
- `packages/adapters/` — Implementations of ports (fs, git, providers, plugins, secrets)
- `packages/shared/` — Shared types, schemas, utilities
- `docs/` — design notes, API docs if needed
- `AGENTS_LOGS.md` — append-only context log

### 4.2 “Single UI” strategy (mandatory)

- The UI is implemented once as a responsive web app (PWA-first) in `apps/web-ui`.
- Electron must NOT have a separate UI:
  - Dev: load web UI dev server URL.
  - Prod: load built static assets.
- The UI must not rely on Electron-only APIs.
- The UI talks to the **server API** in all modes:
  - Local mode: server runs locally; UI calls localhost.
  - Remote mode: UI calls configured server URL (behind VPN/Nginx).

### 4.3 Headless server (mandatory)

- Docker-friendly, Raspberry Pi friendly.
- Provides typed HTTP API (prefer OpenAPI generation or a strongly-typed contract).
- Streaming support when providers stream:
  - Prefer **SSE** (Server-Sent Events); WebSocket optional later.
- Enforce workspace sandbox:
  - Restrict filesystem access to a configured project root.
  - Command execution must be policy-checked (allowlist + approvals).

### 4.4 Provider-agnostic AI execution (mandatory)

Codex is only one provider implementation.

Define a stable contract in domain:

- `LLMProviderPort` with:
  - `listModels()`
  - `run(request)` returning either:
    - `AsyncIterable<LLMEvent>` (streaming)
    - or `LLMResponse` (buffered)
  - `capabilities` (streaming, jsonSchemaEnforcement, maxContext, tokenUsage, tool/function calling, etc.)
  - `estimateUsage()` if available

Provider registry (plugin-like):

- Provider must declare:
  - `id`, `displayName`, `type` (cli|api|local)
  - capabilities
  - models (or a way to fetch models)
  - auth requirements (none|apiKey|oauth|custom)
  - `configurationSchema` (JSON schema) for provider settings
- Provider settings stored per project + per profile.

MVP provider:

- `codex-cli` provider via spawn adapter.
- Treat schema enforcement as supported only if truly guaranteed; otherwise enforce locally with Ajv + retry.

### 4.5 Git (mandatory, server-first)

- Git adapter uses native `git` CLI spawn by default.
- Expose status/diff/commit via server API.

## 5) Security & secrets (mandatory)

- Never store secrets in plain text.
- Desktop secrets: OS keychain adapter.
- Server secrets: env vars or pluggable secret adapter.
- API auth required when exposed over network:
  - MVP: static token via header (e.g., `Authorization: Bearer <token>`).
- Plugins must declare permissions; the server enforces them.

## 6) Kanban board semantics (mandatory)

Columns: `IDEAS` → `TODO` → `IN_PROGRESS` → `QA` → `DONE`

Rules:

- Only pull from TODO to IN_PROGRESS if acceptance criteria are clear.
- Move to QA only if required quality gates pass.
- QA pass → DONE, QA fail → back to IN_PROGRESS with a concrete failure note.
- Tasks can be assigned to an agent profile:
  - Backend, Frontend, DevOps, Product Manager.

## 7) Workflow graph editor (mandatory, later milestone)

- Use React Flow in web UI.
- Nodes (MVP set): Prompt, Run Provider, Validate JSON, Run Gates, Git Commit, Notify/Webhook.

## 8) Plugins (mandatory, later milestone)

- Server-side plugin system:
  - Manifest + permission model
  - Loader
  - Example plugin: webhook notifier (n8n integration)
- UI may expose plugin configuration but execution is server-side.

## 9) Quality gates (mandatory)

Run the minimum necessary gates per change, but never skip typecheck for TS changes:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Never proceed if gates fail.

## 10) Work protocol (mandatory)

- Always read `AGENTS.md`, `PLAN.md`, and the latest entries in `AGENTS_LOGS.md` before starting.
- Update `PLAN.md` checkboxes as tasks complete.
- Append a new entry to `AGENTS_LOGS.md` after each meaningful step/decision.
- Prefer small, reviewable commits with Conventional Commits:
  - `feat: ...`, `fix: ...`, `chore: ...`, `refactor: ...`, `test: ...`

## 11) Chat reset & context recovery policy (mandatory)

When a new chat/session starts:

- Assume chat memory is empty/unreliable.
- Repository files are the only reliable context.

Mandatory steps at the beginning of every new session:

1. Read `AGENTS.md` entirely.
2. Read `PLAN.md`.
3. Read the latest entries of `AGENTS_LOGS.md` (most recent first).
4. Infer current project progress only from those files.
5. Do not ask the user for context that can be derived from those files.

## 12) AGENTS_LOGS.md format (append-only, mandatory)

Each entry MUST follow:

### YYYY-MM-DD HH:mm (Europe/Madrid) — <Area>

- Summary: <1-3 lines>
- Decisions:
  - <decision 1>
  - <decision 2>
- Changes:
  - <files/areas touched>
- Commands:
  - `<command>`
- Issues/Risks:
  - <risk or blocker>
- Next:
  - <next concrete step>

Keep logs concise. Do not paste large outputs.

## 13) Naming

Working name: **Iteronix**  
Alternatives: ForgeFlow, LoopForge, FlowSmith, RepoPilot, HexaFlow

## Repository hygiene

- `.gitignore` must be created before the first commit.
- No build artifacts, secrets, or local environment files may ever be committed.
