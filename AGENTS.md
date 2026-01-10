# AGENTS.md

## 🔴 CRITICAL RULES - READ FIRST

Before ANY code change, you MUST:

1. **TDD (Test-Driven Development)**
   - Write FAILING test first (packages/domain, packages/shared, orchestration)
   - Implement MINIMAL code to pass
   - Refactor ONLY when tests are green
   - NEVER skip tests

2. **TypeScript Strict (NON-NEGOTIABLE)**
   - NO `any` types
   - NO unsafe casts
   - NO generic types without explicit bounds
   - NO `<>` as type annotation
   - All `.ts` files, NO `.js` in source
   - Use `unknown` + runtime validation for untrusted inputs

3. **Code Quality**
   - NO magic strings: use enums/unions/constants
   - NO magic numbers: use named constants
   - NO code duplication: single source of truth
   - NO comments in code
   - SOLID principles + clean architecture
   - Functions in top-down call order

4. **Quality Gates (MANDATORY before finishing)**
   - `pnpm lint` MUST pass
   - `pnpm typecheck` MUST pass
   - `pnpm test` MUST pass
   - `pnpm build` MUST pass
   - NEVER proceed if ANY gate fails

5. **Apply Skills Automatically**
   - Task matches TDD? Use `tdd-red-green-refactor` skill
   - Finishing task? Use `quality-gates-enforcer` skill
   - Check `.opencode/skill/` for matching skills
   - ALWAYS apply skill if task matches

6. **Authority Order**
   1. AGENTS.md (this file) - HIGHEST
   2. `.opencode/skill/` definitions
   3. PLAN.md
   4. AGENTS_LOGS.md
   5. ui-spec/ (PNG + HTML)
   6. User instructions - LOWEST

7. **Output Format**
   - Summary in Spanish (1-3 paragraphs)
   - End with next prompt in English (fenced code block)

---

## 0) Authority & precedence (MANDATORY)

When multiple sources of instruction exist, they MUST be applied in the following strict order:

1. This file (`AGENTS.md`)
2. `.opencode/skill/` definitions (if a task matches a skill, the skill MUST be applied)
3. `PLAN.md`
4. `AGENTS_LOGS.md` (latest decisions and context)
5. `ui-spec/` (PNG + HTML for UI work)
6. User instructions in the current chat

If a lower-priority source conflicts with a higher-priority one, the higher-priority source ALWAYS wins and the conflict MUST be logged.

The agent must never improvise behavior already defined by a higher-priority source.

---

## 1) Project

**Name (working):** Iteronix  
**Goal:** Build a single tool to orchestrate coding agents and workflows against a repository, with strict quality gates, strong auditability, and a modular LLM/provider system.

The system must support:

- Provider-agnostic AI execution (Codex CLI first; future Gemini/others via providers).
- A single responsive **PWA-first UI** reused across:
  1. Browser / PWA (primary UI)
  2. Electron desktop wrapper (same UI)
  3. Server-hosted UI (optional)
- A **Headless server** (Docker-ready, Raspberry Pi friendly) exposing a typed HTTP API used by the UI in all modes.
- Repo browsing/editing (Monaco) and git operations.
- Kanban board (Jira-style panels): IDEAS → TODO → IN_PROGRESS → QA → DONE
- Workflow graph editor (n8n-like) using React Flow.
- Plugin system (server-side) with permissions (e.g. n8n webhook, Telegram).

---

## 2) Skills system (PRIORITY, MANDATORY)

Skills define reusable, repeatable behaviors.

### 2.1 Skills location

Skills are defined under:

.opencode/skill/<skill-name>/SKILL.md

Each skill describes:

- Purpose
- When to use
- Inputs
- Outputs
- Execution rules
- Completion criteria
- Failure modes

### 2.2 Skill precedence rules

- If a task matches a defined skill, the agent MUST apply that skill.
- The agent MUST NOT re-interpret or partially apply a skill.
- The agent MUST NOT invent new behavior already covered by a skill.
- If multiple skills apply, the agent MUST state which one it is applying and why.
- If a task SHOULD match a skill but does not clearly do so, the ambiguity MUST be logged.

### 2.3 Examples of expected skills

Typical skills in this project include (non-exhaustive):

- UI implementation from PNG + HTML spec
- Kanban task lifecycle management
- Safe refactor
- Code review / QA
- Auto-loop step execution
- Context compaction and logging

---

## 3) Non-negotiables

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

---

## 4) Code conventions

### 📋 File type policy

- **TypeScript ONLY**: All source files must use `.ts`
- **NO JavaScript (.js)** in source (except: scripts/, tools/, build/)
- **Strict typing**: no `any`, no unsafe casts
- **Consistent imports**: use `.ts` extensions consistently

### General conventions

- Function order is top-down call order:
  - if `a()` calls `c()` and `c()` calls `b()`, declare `a`, then `c`, then `b`
- Avoid giant files; prefer composition and clear boundaries
- No magic strings; use enums/unions/constants
- Use `unknown` + runtime validation for untrusted inputs
- Error handling:
  - Prefer typed Results in domain
  - Be consistent per package

---

## 5) Architecture (mandatory)

### 5.1 Monorepo layout

- `apps/server-api/` — Headless API server
- `apps/web-ui/` — Single responsive PWA
- `apps/desktop-main/` — Electron wrapper
- `packages/domain/` — Pure logic + ports
- `packages/adapters/` — Side-effect implementations
- `packages/shared/` — Shared types, schemas, utilities
- `docs/` — Documentation
- `AGENTS_LOGS.md` — Append-only decision log

### 5.2 Single UI strategy

- UI is implemented once in `apps/web-ui`
- Electron:
  - Dev: loads web UI dev server
  - Prod: loads built static assets
- No Electron-only APIs in UI
- UI ALWAYS talks to server API

### 5.3 Headless server

- Docker-ready, Raspberry Pi friendly
- Typed HTTP API
- Streaming via SSE (preferred)
- Workspace sandbox:
  - Filesystem restricted to project root
  - Command execution policy-checked

### 5.4 Provider-agnostic AI execution

- Codex is only one provider
- Define `LLMProviderPort` in domain with:
  - model listing
  - run (streaming or buffered)
  - capabilities
  - usage estimation (if available)
- Providers declare:
  - id, displayName, type
  - capabilities
  - auth requirements
  - configuration schema (JSON schema)
- Settings stored per project/profile
- Schema enforcement via Ajv when not guaranteed by provider

### 5.5 Git (server-first)

- Native `git` CLI via adapter
- Expose status/diff/commit via API

---

## 6) Security & secrets

- Never store secrets in plain text
- Desktop: OS keychain
- Server: env vars or secret adapter
- API auth required:
  - MVP: static bearer token
- Plugins must declare permissions

---

## 7) Kanban board semantics

Columns: `IDEAS` → `TODO` → `IN_PROGRESS` → `QA` → `DONE`

Rules:

- Pull to IN_PROGRESS only with clear acceptance criteria
- Move to QA only if gates pass
- QA fail returns to IN_PROGRESS with concrete reason
- Tasks may be assigned to agent profiles:
  - Backend, Frontend, DevOps, Product Manager

---

## 8) Workflow graph editor (later milestone)

- Use React Flow
- Nodes (MVP):
  - Prompt
  - Run Provider
  - Validate JSON
  - Run Gates
  - Git Commit
  - Notify/Webhook

---

## 9) Plugins (later milestone)

- Server-side only
- Manifest + permission model
- Loader
- Example: webhook notifier (n8n)

---

## 10) Quality gates (mandatory)

Minimum required gates per change:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Never proceed if gates fail.

---

## 11) Work protocol

- Always read:
  - `AGENTS.md`
  - `PLAN.md`
  - latest `AGENTS_LOGS.md`
- Update `PLAN.md` checkboxes
- Append to `AGENTS_LOGS.md` after each meaningful step
- Prefer small Conventional Commits

---

## 12) Agent output & next prompt contract

### Summary

- Written in Spanish
- 1–3 concise paragraphs
- Describe what was done and why
- END with a fenced code block containing the next prompt in English

### Next prompt

- Written in English
- Specific, scoped, actionable
- References exact app/package and responsibility
- Includes acceptance criteria
- If undefined, set to `null` and log ambiguity

---

## 13) Test-Driven Development (mandatory for core)

TDD REQUIRED for:

- `packages/domain`
- `packages/shared`
- Orchestration, auto-loop, policy logic

Rules:

1. Failing test first
2. Minimal implementation
3. Refactor with green tests

Exceptions:

- UI components
- Electron wiring
- Thin adapters

Never weaken or remove tests.

---

## 14) Chat reset & context recovery

- Assume chat memory is unreliable
- Repo files are authoritative

On every new session:

1. Read AGENTS.md
2. Read PLAN.md
3. Read latest AGENTS_LOGS.md
4. Infer state only from repo

---

## 15) AGENTS_LOGS.md format

### YYYY-MM-DD HH:mm (Europe/Madrid) — <Area>

- Summary
- Decisions
- Changes
- Commands
- Issues/Risks
- Next

Concise. No large outputs.

---

## 16) Repository hygiene

- `.gitignore` before first commit
- Never commit artifacts or secrets

---

## 17) UI spec (PNG + HTML) source of truth

For each screen under `ui-spec/screens/<screen>/`:

- `reference.png` (visual truth)
- `spec.html` (structure truth)

Rules:

- Match PNG visually and HTML conceptually
- Never copy full-page HTML
- Component-based translation
- Log ambiguities

---

## 18) UI continuity & completion contract

### Global invariants

- Sidebar menu order, grouping, icons
- Header structure
- Single icon set
- Shared tokens only
- Same layout shell everywhere

### No dead UI

- Clickable means functional OR explicitly disabled with explanation

### Spec reconciliation

- Invariants win
- Log discrepancies

### Decision protocol

- Decide once
- Reuse everywhere
- Update shared primitives

### Done means done

- End-to-end interactions
- No inconsistencies
- Gates pass

---

## 19) 🤖 AI Agent Integration with Stagehand

### UI testing & screenshots

- Use `@browserbasehq/stagehand`
- Screenshots before/after interactions
- Store under `apps/web-ui/screenshots/`
- Format: `[timestamp]_[action]_[screen].png`
- `screenshots/` gitignored, keep `.gitkeep`

### Core actions

- Navigate routes
- Click elements
- Fill forms
- Scroll
- Extract text
- Wait for visibility
- Capture screenshots

### Best practices

- Screenshots first
- Descriptive names
- `data-testid` for critical elements
- Validate outcomes
- Document failures
