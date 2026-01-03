### 2026-01-03 14:24 (Europe/Madrid) — Bootstrap

- Summary: Bootstrapped the monorepo with PNPM workspace, strict TS/ESLint, and Vitest harness.
- Decisions:
  - Use a single root tsconfig with strict settings and per-package overrides.
  - Keep build script aligned with typecheck until real build pipelines exist.
- Changes:
  - .gitignore, package.json, pnpm-workspace.yaml
  - tsconfig.base.json, tsconfig.json, tsconfig.eslint.json, eslint.config.cjs
  - apps/* and packages/* scaffolding
  - packages/domain LLM port, events, and run model
  - PLAN.md
- Commands:
  - `git init`
  - `pnpm install`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - pnpm install reported ignored build scripts (esbuild) pending approval.
- Next:
  - Define remaining domain ports and provider registry settings schema.
### 2026-01-03 14:33 (Europe/Madrid) - Domain

- Summary: Added domain ports for history, logs, policy, filesystem, and secrets with a shared Result type.
- Decisions:
  - Use a simple Result union for domain port responses.
  - Keep ports minimal and side-effect free with typed error codes.
- Changes:
  - packages/domain/src/ports/*
  - packages/domain/src/result.ts
  - packages/domain/src/index.ts
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement provider registry and provider settings schema in domain.
### 2026-01-03 14:39 (Europe/Madrid) - Domain

- Summary: Added provider registry metadata, settings schema types, and JSON schema validation port with typed settings validation.
- Decisions:
  - Keep provider registry as pure metadata with immutable registration.
  - Delegate JSON schema validation to a validator port returning typed results.
- Changes:
  - packages/domain/src/providers/*
  - packages/domain/src/index.ts
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement codex-cli provider adapter in packages/adapters.
### 2026-01-03 14:54 (Europe/Madrid) - Adapters

- Summary: Added codex-cli provider adapter with settings schema, descriptor metadata, and async event streaming.
- Decisions:
  - Return an AsyncIterable of LLM events backed by a lightweight in-memory queue.
  - Extend root tsconfig files with Node types to support adapter compilation.
- Changes:
  - packages/adapters/src/codex-cli/*
  - packages/adapters/src/index.ts
  - tsconfig.json
  - tsconfig.eslint.json
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Start Milestone 2 with server API scaffolding and auth policy.
### 2026-01-03 15:10 (Europe/Madrid) - Server API

- Summary: Scaffolded a minimal HTTP server with auth guard and project create/open endpoints.
- Decisions:
  - Require AUTH_TOKEN at startup and validate Bearer tokens on every request.
  - Keep an in-memory project store for initial API scaffolding.
- Changes:
  - apps/server-api/src/constants.ts
  - apps/server-api/src/config.ts
  - apps/server-api/src/result.ts
  - apps/server-api/src/projects.ts
  - apps/server-api/src/server.ts
  - apps/server-api/src/index.ts
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Add file tree/read/write endpoints with workspace sandbox checks.
### 2026-01-03 15:44 (Europe/Madrid) - Server API

- Summary: Added file tree/read/write endpoints with sandboxed path resolution and tests for workspace path checks.
- Decisions:
  - Resolve all file targets relative to the project root and reject escapes.
  - Keep file operations in a dedicated module to reuse in HTTP handlers.
- Changes:
  - apps/server-api/src/constants.ts
  - apps/server-api/src/files.ts
  - apps/server-api/src/files.test.ts
  - apps/server-api/src/projects.ts
  - apps/server-api/src/server.ts
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Add sessions start/stop with SSE streaming endpoints.
### 2026-01-03 16:10 (Europe/Madrid) - Server API

- Summary: Added session start/stop and SSE streaming endpoints with in-memory session tracking and SSE helpers.
- Decisions:
  - Use an in-memory session store and event hub for initial SSE wiring.
  - Add unit tests for session store behavior (non-TDD).
- Changes:
  - apps/server-api/src/constants.ts
  - apps/server-api/src/sessions.ts
  - apps/server-api/src/sessions.test.ts
  - apps/server-api/src/sse.ts
  - apps/server-api/src/server.ts
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Add history/logs retrieval endpoints.
### 2026-01-03 16:23 (Europe/Madrid) - Server API

- Summary: Added history/logs store tests and refined request parsing for optional fields.
- Decisions:
  - Add history/logs store tests after implementation (non-TDD).
  - Omit undefined optional fields to align with exact optional property types.
- Changes:
  - apps/server-api/src/server.ts
  - apps/server-api/src/history.ts
  - apps/server-api/src/logs.ts
  - apps/server-api/src/history.test.ts
  - apps/server-api/src/logs.test.ts
  - apps/server-api/src/constants.ts
  - PLAN.md
- Commands:
  - `git status -sb`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement provider list/select and settings update endpoints.
### 2026-01-03 17:58 (Europe/Madrid) - Server API

- Summary: Implemented provider list/select/settings endpoints with an in-memory provider store and tests.
- Decisions:
  - Seed the provider store with the codex-cli descriptor for initial listing.
  - Include selection in list responses when project/profile are provided.
- Changes:
  - apps/server-api/src/constants.ts
  - apps/server-api/src/providers.ts
  - apps/server-api/src/providers.test.ts
  - apps/server-api/src/server.ts
  - PLAN.md
- Commands:
  - `git status -sb`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement Kanban board CRUD endpoints in the server API.
### 2026-01-03 18:22 (Europe/Madrid) - Server API

- Summary: Added in-memory Kanban store and CRUD endpoints for boards, columns, and tasks with validation and tests.
- Decisions:
  - Keep Kanban data in-memory for MVP API wiring.
  - Add Kanban store tests after implementation (non-TDD).
- Changes:
  - apps/server-api/src/constants.ts
  - apps/server-api/src/kanban.ts
  - apps/server-api/src/kanban.test.ts
  - apps/server-api/src/server.ts
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Enforce workspace sandbox path allowlist and command policy checks in the server API.
### 2026-01-03 18:46 (Europe/Madrid) - Server API

- Summary: Added workspace allowlist enforcement and command policy utilities with sandbox tests and server integration.
- Decisions:
  - Require WORKSPACE_ROOTS to start the server and deny roots outside the allowlist.
  - Add sandbox policy tests after implementation (non-TDD).
- Changes:
  - apps/server-api/src/constants.ts
  - apps/server-api/src/config.ts
  - apps/server-api/src/sandbox.ts
  - apps/server-api/src/sandbox.test.ts
  - apps/server-api/src/server.ts
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Add Dockerfile and minimal run docs for the server API.
### 2026-01-03 18:55 (Europe/Madrid) - Server API

- Summary: Added a server API Dockerfile and minimal run documentation with required environment variables.
- Decisions:
  - Use a multi-stage Docker build to compile TypeScript output and run plain Node.js.
  - Document runtime environment variables and Docker invocation in docs.
- Changes:
  - apps/server-api/Dockerfile
  - tsconfig.build.json
  - docs/server-api.md
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement the responsive web UI scaffold in apps/web-ui.
### 2026-01-03 19:01 (Europe/Madrid) - Web UI

- Summary: Added a minimal responsive web UI shell with layout styling and updated the milestone checkbox.
- Decisions:
  - Use a static HTML shell with inline styles for the initial responsive scaffold.
  - Keep the layout mobile-first with a simple kanban preview and hero panel.
- Changes:
  - apps/web-ui/index.html
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Add PWA manifest and service worker in apps/web-ui.
### 2026-01-03 17:22 (Europe/Madrid) - Testing

- Summary: Established domain/shared test scaffolding with provider registry coverage and a shared package smoke test.
- Decisions:
  - Add provider registry tests after existing implementation (non-TDD).
  - Add a shared package smoke test to anchor the test structure.
- Changes:
  - packages/domain/src/providers/registry.test.ts
  - packages/shared/src/index.test.ts
  - PLAN.md
- Commands:
  - `git status -sb`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement provider list/select and settings update endpoints.

### 2026-01-03 19:04 (Europe/Madrid) - Web UI

- Summary: Added the PWA manifest, service worker, and icon assets with registration in the UI shell.
- Decisions:
  - Use a minimal service worker that only installs and claims clients.
  - Ship a single SVG icon referenced by the manifest.
- Changes:
  - apps/web-ui/index.html
  - apps/web-ui/manifest.webmanifest
  - apps/web-ui/sw.js
  - apps/web-ui/icons/icon.svg
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement server connection configuration UI (base URL + token).

### 2026-01-03 19:09 (Europe/Madrid) - Web UI

- Summary: Added UI controls for server base URL and auth token with localStorage persistence and target display.
- Decisions:
  - Store connection settings in localStorage to persist across reloads.
  - Reflect the current target directly in the connection panel.
- Changes:
  - apps/web-ui/index.html
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement the Projects screen (create/open/recent) in apps/web-ui.

### 2026-01-03 19:16 (Europe/Madrid) - Web UI

- Summary: Added a Projects section with create/open inputs, recent list rendering, and local placeholder state.
- Decisions:
  - Persist recent projects in localStorage with a small default seed.
  - Keep project interactions client-side until server wiring exists.
- Changes:
  - apps/web-ui/index.html
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement the Repo explorer and Monaco editor screen in apps/web-ui.

### 2026-01-03 19:20 (Europe/Madrid) - Web UI

- Summary: Added a repo explorer section with a two-pane layout and a Monaco-style editor placeholder driven by client-side state.
- Decisions:
  - Render the repo tree and editor content from in-memory placeholder data.
  - Keep repo interactions client-side until API wiring exists.
- Changes:
  - apps/web-ui/index.html
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement the Runs screen (start, live stream logs, history) in apps/web-ui.

### 2026-01-03 19:45 (Europe/Madrid) - Web UI

- Summary: Added a Runs section with start/stop controls, live log placeholder, and history list backed by client-side state.
- Decisions:
  - Simulate streaming logs with a lightweight interval-driven placeholder.
  - Seed run history with sample entries for UI scaffolding.
- Changes:
  - apps/web-ui/index.html
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement the Settings screen (provider/model/precision, per project/profile) in apps/web-ui.

### 2026-01-03 19:51 (Europe/Madrid) - Web UI

- Summary: Added a Settings section with project/profile selection and provider/model/precision controls backed by client-side state.
- Decisions:
  - Use an in-memory settings catalog to render the selectable options.
  - Render the active selection summary from the current settings state.
- Changes:
  - apps/web-ui/index.html
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Implement the Kanban board screen (create/move tasks; show task details) in apps/web-ui.

### 2026-01-03 20:03 (Europe/Madrid) - Web UI

- Summary: Added a Kanban screen with task creation, move controls, and a detail panel driven by client-side state.
- Decisions:
  - Keep Kanban data in-memory with seeded tasks for the UI scaffold.
  - Use inline move controls plus detail actions for task navigation across columns.
- Changes:
  - apps/web-ui/index.html
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Confirm remaining Milestone 3 UI work and update PLAN.md if needed.

### 2026-01-03 20:09 (Europe/Madrid) - Web UI

- Summary: Confirmed the minimal UI screens are present and marked the parent checklist item complete.
- Decisions:
  - Only update the parent checklist once all child screens were checked.
  - Leave remaining UI refactor tasks untouched.
- Changes:
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Separate each screen into its own component with shared utilities in apps/web-ui.

### 2026-01-03 20:46 (Europe/Madrid) - Web UI

- Summary: Split the web UI into screen modules with shared utilities and moved the runtime script into TypeScript modules, adding unit tests for shared helpers.
- Decisions:
  - Keep the HTML as the static shell while screen modules own rendering and state updates.
  - Add small shared utility tests for formatting and store behavior.
- Changes:
  - apps/web-ui/index.html
  - apps/web-ui/src/index.ts
  - apps/web-ui/src/screens/*
  - apps/web-ui/src/shared/*
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Confirm no Electron-specific code remains in apps/web-ui and update PLAN.md.
### 2026-01-03 20:53 (Europe/Madrid) - Web UI

- Summary: Ensured the module-based web UI emits browser-ready JS and updated the shell to load the built output while keeping screens split by module.
- Decisions:
  - Add a dedicated web UI build tsconfig and wire it into the root build script.
  - Keep the HTML shell static while referencing the compiled module entrypoint.
- Changes:
  - apps/web-ui/index.html
  - apps/web-ui/tsconfig.build.json
  - apps/web-ui/src/screens/kanban.ts
  - package.json
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Complete the shared styles/CSS variables task in apps/web-ui.
### 2026-01-03 21:12 (Europe/Madrid) - Web UI

- Summary: Consolidated web UI styling with shared CSS variables and grouped selectors, and adjusted build configs to keep test artifacts out of dist outputs.
- Decisions:
  - Centralize spacing, typography, and surface tokens in root CSS variables to avoid repeated literals.
  - Exclude test files from build tsconfigs to prevent vitest from executing dist artifacts.
- Changes:
  - apps/web-ui/index.html
  - apps/web-ui/tsconfig.build.json
  - tsconfig.build.json
  - PLAN.md
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- Issues/Risks:
  - None
- Next:
  - Verify apps/web-ui remains free of Electron-specific code and update PLAN.md.
