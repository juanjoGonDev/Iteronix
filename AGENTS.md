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

### 📋 **File Type Policy**
- **TypeScript ONLY**: All source files must use `.ts` extension
- **NO JavaScript (.js)**: Prohibited in source code (except: scripts/, tools/, build/)
- **Strict Typing**: No `any`, no unsafe casts, explicit typing required
- **Consistent Imports**: Use `.ts` extensions consistently

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

### 4.2 "Single UI" strategy (mandatory)

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

## Agent output & next prompt contract (mandatory)

Each agent iteration MUST end with a structured output that follows these rules.

### Summary

- MUST be written in Spanish.
- MUST be concise (1–3 paragraphs).
- MUST describe what was done and why, not what will be done next.
- At the END of the summary, include a fenced code block containing the next prompt in English.

### Next prompt (`nextPrompt`)

The next prompt is an execution instruction, not a note.

Rules:

- MUST be written in English.
- MUST be specific, scoped, and actionable.
- MUST reference:
  - the exact app or package to modify (e.g. `apps/server-api`)
  - the responsibility (API, domain, adapter, UI, etc.)
- MUST include clear acceptance criteria.
- MUST respect the current scope defined in PLAN.md.
- MUST NOT be vague or generic.

Forbidden examples:

- "Implement provider endpoints"
- "Continue with server API"
- "Add provider settings"

Good examples:

- "Implement provider listing and selection endpoints in apps/server-api, backed by the provider registry in packages/domain, with input validation and tests."

If a precise next step cannot be defined:

- Set the next prompt to `null`
- Mark the iteration as requiring user input
- Log the ambiguity in `AGENTS_LOGS.md`

This contract is non-optional.

## Test-Driven Development (mandatory for core)

TDD is REQUIRED for all core logic:

- Domain layer (`packages/domain`)
- Shared logic (`packages/shared`)
- Orchestration, auto-loop, policies, and decision logic

TDD rules:

1. Write a failing test that describes the expected behavior.
2. Implement the minimal code to make the test pass.
3. Refactor while keeping tests green.

Scope exceptions:

- UI components
- Electron main wiring
- Thin adapters that mostly delegate to external tools (git, fs, process spawn)

Even when TDD is not mandatory, tests MUST be added for non-trivial logic.

The agent must:

- Explicitly indicate in AGENTS_LOGS.md when TDD is applied.
- Never remove or weaken tests to make code pass.

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

## Repository hygiene

- `.gitignore` must be created before the first commit.
- No build artifacts, secrets, or local environment files may ever be committed.

## UI spec (PNG + HTML) is the source of truth (mandatory)

For each UI screen, store under `ui-spec/screens/<screen>/`:

- `reference.png` (visual truth)
- `spec.html` (structure/layout truth)

Rules:

- The implementation MUST match the PNG visually and the HTML structure conceptually.
- The HTML MUST NOT be copied as a full-page blob into production code.
- The agent MUST translate the spec into reusable components (component-based composition).
- If the spec is ambiguous, do not guess: log and request clarification.

## UI continuity & completion contract (mandatory)

The UI must be consistent across screens and must never ship partially working interactions.

### Continuity rules (global invariants)

These must remain consistent across ALL screens unless explicitly changed by an approved UI spec update:

- Navigation:

  - Sidebar menu items, order, grouping, icons, and labels are global invariants.
  - Header layout (left/center/right areas), global actions, and status indicators are global invariants.
  - If a screen spec contradicts these invariants, the invariants win and the mismatch must be logged.

- Visual system:

  - Typography scale, spacing scale, colors/tokens, border radius, shadows, and icon style are global invariants.
  - Do not introduce new icon styles or mixed icon sets. Pick ONE icon set and use it everywhere.
  - No per-screen "creative" styling. Everything must come from shared primitives and tokens.

- Layout structure:
  - All screens must use the same shell: header + sidebar + main content + optional right panel.
  - Do not reorder layout regions per screen.

### Completion rules (no dead UI)

The agent MUST NOT leave any of the following in a broken or misleading state:

- Buttons that do nothing (unless explicitly disabled with a tooltip explaining why).
- Menu items that look clickable but do not navigate.
- Dropdowns/popovers that do not open or do not close properly.
- Tabs that do not switch views.
- Links that are placeholders with no behavior.

If a feature is not implemented yet (out of scope or missing backend):

- The UI MUST present it as disabled with:
  - disabled styling
  - tooltip or inline note: "Not available yet"
- The action must NOT appear functional.

### Spec reconciliation (when Stitch is inconsistent)

The Stitch spec (PNG + HTML) is the per-screen visual reference, but global continuity must be maintained.

When the spec is inconsistent across screens:

1. Prefer global invariants (navigation order, icon set, shell layout).
2. Match screen-specific content within that consistent shell.
3. Log the discrepancy and the chosen resolution in AGENTS_LOGS.md.

### Decision protocol (required)

When choosing between alternatives (e.g., missing behavior, ambiguous component):

- Decide once, document it, and reuse that decision everywhere.
- Add or update a single shared primitive/component rather than per-screen hacks.

### Done means done

A UI change is considered complete only if:

- The screen works end-to-end for its intended interactions (navigation, open/close, submit/cancel).
- No new inconsistencies in menu/header/iconography are introduced.
- All quality gates pass.

## 🤖 AI Agent Integration with Stagehand

### UI Testing & Screenshots Protocol (mandatory)

The AI agent (`@browserbasehq/stagehand` installed) must capture and analyze UI state systematically:

**📸 Screenshots Protocol:**
- Take screenshots before major interactions
- Store in `apps/web-ui/screenshots/` with descriptive names
- Format: `[timestamp]_[action]_[screen].png`
- Document UI state changes visually
- Screenshots are committed to `apps/web-ui/screenshots/` with descriptive names
- `screenshots/` is gitignored for local development but `.gitkeep` maintains directory

**🎯 Core Actions:**
- Navigate to any route (`#dashboard`, `#settings`, etc.)
- Click buttons, links, and interactive elements  
- Fill forms and input fields
- Scroll pages and panels
- Extract text and element information
- Wait for element visibility
- Take screenshots for validation

**🔍 Element Identification:**
- Use `data-testid` attributes for reliable targeting
- Target by semantic HTML elements
- Use CSS selectors for complex elements
- Component-based selection (`Button`, `Input`, `Card` classes)

**🧪 Professional Workflow Integration:**
- Test user flows end-to-end
- Validate form submissions
- Check navigation paths
- Verify state changes
- Document UI behavior with screenshots

### 📋 Interaction Examples

```javascript
// Navigate and take screenshot
await page.goto('http://localhost:3000/#dashboard');
await page.screenshot('./screenshots/0010_initial_dashboard.png');

// Click and capture interaction
await page.click('[data-testid="new-project-button"]');
await page.screenshot('./screenshots/0020_after_new_project_click.png');

// Fill forms with validation
await page.fill('input[name="apiKey"]', 'sk-proj-xxxxxxxx');
await page.screenshot('./screenshots/0030_api_key_filled.png');
await page.click('[data-testid="save-settings"]');
await page.screenshot('./screenshots/0040_settings_saved.png');
```

### 🎨 Best Practices for AI Interaction

1. **Screenshots First**: Always capture before/after states
2. **Descriptive Names**: Use timestamp_action_screen format  
3. **Use data-testid** for test-critical elements
4. **Wait for states** before proceeding
5. **Validate expected outcomes** after each interaction
6. **Document failures** with screenshots and context

The AI agent can now fully automate UI testing, user flow validation, and integration testing with professional-grade visual documentation.