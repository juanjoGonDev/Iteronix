# Iteronix product plan

Iteronix is an n8n-like, cross-platform AI workflow product: users compose, execute, govern, and expose reusable AI workflows without building a repository workbench. This plan supersedes the previous workflow-only closure plan while preserving its verified implementation as a migration baseline.

## Product charter

Iteronix SHALL provide:

- An AI workflow editor with typed nodes, edges, execution history, and observable run state.
- Schema output validators, guardrails, and bounded auto-repair for workflow results.
- Agent and workflow composition, including parallel fan-out/fan-in merge and nested/reusable workflows.
- External invocation through secret-backed, scoped API credentials.
- Extensibility through plugins, skills, memory, RAG, MCP, evaluations, and orchestration.
- One responsive web/PWA experience, Docker/Linux server deployment, and Windows/macOS desktop delivery.

## Explicit exclusions

The following product surfaces are out of scope and MUST NOT be reintroduced as part of this plan:

- Kanban, task-management, project-management, or Jira-style boards.
- Repository workbench features: workspace/repository browsing, Monaco editing, Git operations, file management, or coding-agent task surfaces.

## Current verified baseline

The repository currently implements a deliberately narrowed PostgreSQL-backed workflow application. Source structure and tests show a workflow catalog, single-workflow editor routes, provider settings, scoped/revocable external workflow API keys, workflow runtime/stream persistence, and server-hosted static UI delivery. The existing browser validators use **Puppeteer**; they are not Playwright coverage.

The active OpenSpec change `fix-workflow-live-execution-refresh` records completed implementation and a passed historical verification report for live execution persistence, refresh behavior, double-click handling, and SSE disconnect tolerance. It is still unarchived. Existing uncommitted changes in `apps/web-ui/scripts/validate-workflows.ts` and `apps/web-ui/src/screens/Workflows.ts`, plus the user-owned `.atl/skill-registry.md`, were intentionally not inspected, changed, or validated by this planning task.

Not yet verified or implemented by this plan: React Flow/n8n-grade graph semantics, nested/reusable workflows, fan-out/fan-in merging, schema validators/guardrails/auto-repair, finite governance lifecycle, skills/memory/RAG/MCP/evaluations/plugins, Playwright, Electron desktop delivery, and the full cross-platform product contract.

## Delivery principles

- Preserve working workflow-only data, routes, external API credentials, and execution history through explicit compatibility migrations; do not silently discard or retain conflicting artifacts.
- Build domain contracts and test fixtures before adapters and UI. Core orchestration and policy logic follow strict RED → GREEN → REFACTOR TDD.
- Treat every workflow run, repair, evaluation, review, and user decision as auditable persisted data.
- Maintain the existing TypeScript strictness, clean architecture, credential-redaction, and Docker-first deployment constraints.
- Every PostgreSQL schema change MUST ship as an immutable forward-only migration with a ledger checksum, transactional advisory locking, and clean-database verification. Runtime application code MUST NOT perform schema DDL.
- Database integration and backup/restore tests MUST use a dedicated `TEST_DATABASE_URL` that differs from `DATABASE_URL`.

## Ordered roadmap

### Phase 0 — Charter reconciliation and migration inventory

- [x] Create a compatibility inventory for current workflow-only routes, PostgreSQL records, external API keys, runtime policies, and execution history.
- [x] Classify every current workflow-only artifact as retain, migrate, replace, or retire against this charter; include the unarchived live-execution OpenSpec change.
- [x] Define versioned import/export and database migration rules before changing workflow schemas.
- [x] Implement a versioned PostgreSQL migration ledger, forward-only SQL executor, startup verification, and isolated clean-database backup/restore test contract.
- [x] Update product documentation and OpenSpec artifacts to remove obsolete workflow-only closure assumptions without restoring excluded workbench surfaces.
- [x] Record the resolution of the `AGENTS.md` scope conflict in a separately approved governance update; this plan does not modify `AGENTS.md`.

**Acceptance / verification**

- A migration matrix maps every persisted workflow-era entity and route to its destination and rollback behavior.
- A fixture database upgrades to the new schema without losing workflows, credentials metadata, or execution history.
- Documentation names the exclusions and the preserved compatibility surface.

**Risks**: migrating active workflow state without a versioned contract could cause data loss or leave duplicate execution semantics.

### Phase 1 — Canonical workflow graph and execution contracts

- [x] Define strict domain schemas for workflow graphs, node inputs/outputs, typed ports, edges, run context, execution events, and persisted run snapshots.
- [x] Implement deterministic graph validation: missing references, illegal cycles, unreachable nodes, incompatible ports, and invalid terminal paths.
- [x] Introduce node contracts for agent invocation, workflow invocation, schema validation, guardrails, merge, and external trigger boundaries.
- [x] Add deterministic fan-out/fan-in semantics, explicit merge policies, cancellation behavior, concurrency limits, and retry classification.
- [x] Add reusable workflow references with immutable version pinning, recursion detection, input/output mapping, and compatibility checks.
- [x] Migrate the existing editor/runtime representation through adapters rather than duplicating execution engines.

**Acceptance / verification**

- Unit tests cover valid and invalid graph construction, merge policies, cycle/recursion rejection, cancellation, and deterministic execution ordering.
- [x] Integration tests persist, reload, and execute a graph containing parallel branches and a version-pinned nested workflow.
- [x] Legacy workflow fixtures import through the Phase 0 migration contract.

**Dependencies**: Phase 0.

### Phase 2 — Finite AI execution and governance lifecycle (high priority)

- [x] Model a persisted finite state machine: `Draft` → `Planning` → `Executing` → `Verifying` → `Reviewing` → `AwaitingUserApproval`, with explicit `Failed`, `Cancelled`, `Rejected`, and `Approved` terminal outcomes.
- [x] Persist a scope/content fingerprint and test/evidence fingerprint at each transition; record actor, timestamps, budget consumption, and immutable transition reason.
- [x] Define configurable, persisted maximum execution, repair, and review budgets; reject transitions that would exceed a budget.
- [x] Allow automatic repair only for classified retryable failures, only while budget remains, and only when its before/after evidence is recorded.
- [x] Make `AwaitingUserApproval` a blocking terminal checkpoint for autonomous execution. Expose only explicit user controls: **Approve**, **Continue**, and **Reject with feedback**.
- [x] Define **Continue** as a user-authorized, single next bounded pass with a new transition record; define **Reject with feedback** as a revision request linked to the feedback; define **Approve** as an immutable approval of the recorded fingerprints.
- [x] Prevent any rerun after approval unless a changed scope or changed evidence produces a new fingerprint and a new user-authorized lifecycle.
- [ ] Surface lifecycle state, remaining budgets, fingerprints, decision history, and disabled/available controls in the UI and external API.
  - [x] Expose authenticated typed server endpoints to read lifecycle state and perform audited Approve, Continue, and Reject-with-feedback controls.
  - [ ] Surface the lifecycle state and available controls in the UI.

**Acceptance / verification**

- Unit tests exhaust transition tables and reject illegal transitions, exhausted budgets, duplicate automatic retries, and reruns of an approved fingerprint.
- System tests simulate retryable/non-retryable failures and prove that automated activity stops at `AwaitingUserApproval` without spending tokens indefinitely.
- API/UI tests prove Approve, Continue, and Reject-with-feedback are auditable; a changed scope or evidence is required before an approved run can execute again.
- A test fixture asserts no execution/review loop can exceed its persisted budget, including after process restart.

**Dependencies**: Phase 1. **Risk**: a non-persisted budget or fingerprint would permit restart-driven loops and destroy auditability.

### Phase 3 — Validation, guardrails, and bounded repair

- [x] Implement JSON Schema-based input/output validation with versioned schemas and structured validation errors.
- [x] Add policy-driven guardrails for tools, data handling, model/provider capabilities, and workflow-level runtime limits.
- [x] Implement repair proposals that are bounded by the Phase 2 lifecycle, preserve the failing evidence, and never overwrite an approved result.
- [x] Support human-readable run traces showing validation decisions, policy decisions, repair attempts, and terminal outcomes.
- [x] Add evaluation contracts and repeatable datasets for workflow quality, safety, latency, and cost measurements.

**Acceptance / verification**

- [x] Unit tests cover schema pass/fail, guardrail allow/deny, and redacted error reporting.
- [x] System tests prove a repair can resolve a valid classified failure, stops on budget exhaustion, and cannot bypass approval.
- [x] Evaluation fixtures are reproducible and report comparable results for the same workflow/provider/version.

**Dependencies**: Phases 1–2.

### Phase 4 — Agents, skills, memory, RAG, MCP, and plugins

- [x] Work unit 1: persist editable asset records and authenticated CRUD APIs for agents, tools/MCP, skills, memory/RAG sources, and server-side plugins, with safe JSONB compatibility defaults.
- [ ] Implement Prompts as first-class reusable Assets: immutable version history, typed variable schemas, provenance, and independently governed lifecycle state. Workflow nodes MUST reference a version-pinned prompt asset with explicit variable bindings; they MUST NOT own duplicated prompt text.
  - [x] Add persisted usage discovery for version-pinned prompt references, direct workflow/node links, and impact-confirmed deletion that recomputes persisted usage server-side.
  - [x] Resolve pinned prompt versions deterministically at runtime, reject invalid bindings, and persist rendered prompt provenance in governed external workflow runs.
  - [x] Link IDE workflow runs to persisted governance lifecycles and expose governed prompt provenance in the reloadable execution inspector.
- [x] Integrate the persisted assets with governed workflow execution: `buildGovernedService` + `runGovernedWorkflow` with skill registration, plugin tool ID resolution, permission validation, schema validation, provenance tracking, and fallback to provider path for ungoverned nodes (tested: 5 integration tests covering happy path, provenance fingerprints, schema failure, non-governed routing, permission rejection).
- [x] Wire governed workflow runtime into real server API routes and connect approval checkpoints.
- [x] Implement skills as versioned, permissioned reusable execution assets with explicit inputs, outputs, and provenance.
- [ ] Add memory and RAG runtime integration with tenant/workflow boundaries, retrieval provenance, retention rules, and opt-in indexing.
- [ ] Add MCP client/server runtime integration behind permission and capability controls; validate all untrusted tool results at the boundary.
- [ ] Create server-side plugin runtime loading, lifecycle, isolation strategy, and audit events.
- [ ] Provide one end-to-end reference plugin and one reusable skill that execute through the governance lifecycle.

**Acceptance / verification**

- [x] Work unit 1 API tests cover authenticated list/upsert/delete, malformed input rejection, and PostgreSQL JSONB reload compatibility.
- [x] Contract tests run each port against a fake implementation and reject undeclared capability or permission use.
- [x] Integration tests prove retrieval/tool/plugin provenance is visible in a workflow run and secrets are never exposed.
- [x] Permission-denial, plugin failure, and malformed MCP response paths are deterministic and auditable.

**Dependencies**: Phases 1–3.

### Phase 5 — External API, secrets, and production operations

- [ ] Evolve scoped external workflow API keys into secret-backed credentials with rotation, revocation, least-privilege scopes, rate limits, and audit events.
- [ ] Publish typed external trigger, run-status, approval, and trace APIs with idempotency and versioning.
- [ ] Keep browser clients free of internal server credentials; secret resolution stays in server-side adapters or platform keychains.
- [ ] Add production deployment profiles for Docker/Linux, PostgreSQL backup/restore, health/readiness, structured logs, metrics, and safe configuration validation.
- [ ] Define tenancy and authorization boundaries before multi-user or remote plugin deployment.

**Acceptance / verification**

- API integration tests cover authentication, authorization, rotation/revocation, idempotent triggering, and redaction.
- Docker integration tests start the full server/database stack, invoke a workflow externally, approve it, and retrieve a redacted trace.
- Backup/restore tests recover versioned workflows and lifecycle records into a clean database.

**Dependencies**: Phases 2–4.

### Phase 6 — Web/PWA and Windows/macOS desktop product delivery

- [ ] Replace the current editor presentation incrementally with a responsive n8n-like graph experience while preserving valid deep links and migrated workflows.
- [ ] Add accessible graph keyboard navigation, focus management, overlays, inspector panels, approval controls, and observable execution traces.
- [ ] Deliver installable PWA behavior with offline-safe boundaries that never claim execution succeeded without server confirmation.
- [ ] Add a desktop wrapper for Windows and macOS that reuses the web UI and talks only to the typed server API.
- [ ] Implement platform-specific secure credential storage only behind the server/desktop secret adapter boundary.

**Acceptance / verification**

- Deep links restore the catalog, selected workflow, modal/inspector state, and approval context or degrade safely to a valid parent route.
- Accessibility tests and manual keyboard checks cover graph editing, dialogs, menus, and approval controls.
- Windows and macOS packaging smoke tests launch the wrapper, connect to the API, and do not use renderer-side privileged APIs.

**Dependencies**: Phases 1–5.

### Phase 7 — Quality, release, and migration completion

- [ ] Establish release criteria for migration integrity, security review, lifecycle auditability, performance budgets, and production rollback.
- [ ] Archive or replace the current workflow-only OpenSpec artifacts only after their compatibility behavior is represented in the new contracts.
- [ ] Run native bounded review receipts for implementation changes and preserve evidence at commit, push, and PR boundaries.
- [ ] Publish operator and user documentation for deployment, API use, approval workflows, recovery, and plugin/skill permissions.
- [ ] Remove compatibility code only after a documented deprecation window and successful migration telemetry.

**Acceptance / verification**

- A clean environment migrates, deploys, runs a nested parallel workflow, reaches approval, and recovers from a backup.
- All required quality gates and the test strategy below pass on the release candidate.
- Release notes state retained compatibility, removed compatibility, rollback procedure, and known limits.

**Dependencies**: Phases 0–6.

## Test strategy

Testing is a product deliverable, not a final cleanup pass.

| Layer                | Required coverage                                                                                                                                                                      | Verification                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Unit                 | Domain graph rules, lifecycle transitions, budgets/fingerprints, schema validation, guardrails, merge/retry policies, permissions, and redaction.                                      | Fast deterministic Vitest suites; core logic begins RED.                                                                      |
| System / integration | PostgreSQL migrations, runtime streaming, nested/fan-out workflows, providers, secrets, plugins, MCP/RAG boundaries, external API, and Docker/server boundaries.                       | Disposable database and container fixtures with assertions on persisted audit records.                                        |
| Playwright E2E       | UI and API user journeys at desktop, tablet, and mobile viewports; graph editing, overlays, dialogs, layering/z-index, approvals, deep links, external invocation, and failure states. | Run against the real server/UI stack; capture traces and screenshots on failure.                                              |
| Visual regression    | Deterministic catalog/editor/overlay/approval screenshots and comparisons at supported viewports.                                                                                      | Baselines update only through reviewed intentional changes; disable comparisons only for documented nondeterministic regions. |
| Release              | Docker/Linux deployment, Windows/macOS desktop smoke tests, backups, migration, and rollback.                                                                                          | Reproducible CI jobs with published artifacts and logs.                                                                       |

Playwright is the required E2E standard for new coverage. Existing Puppeteer validators remain baseline checks until intentionally migrated or retired; they MUST NOT be represented as Playwright validation. Playwright scenarios SHALL explicitly test interaction paths, hit-testing/layering of menus and overlays, URL reload/deep-link restoration, screenshots where deterministic, and Docker/server boundary behavior.

## Non-goals and constraints

- Do not rebuild Kanban, task-management, repository browsing, Monaco, Git, or coding-agent workbench features.
- Do not expose provider, backend, plugin, or external API secrets to the browser or persisted traces.
- Do not allow autonomous repair/review loops to bypass finite budgets or the `AwaitingUserApproval` checkpoint.
- Do not remove current workflow data or API-key semantics without an approved, tested compatibility migration.

## Governance conflict to resolve

`AGENTS.md` remains unmodified and, by its own precedence rules, still requires the older repository-orchestration vision: repository browsing/editing, Git, Kanban, desktop workbench, and coding-agent surfaces. Those requirements directly conflict with this user-approved product charter and its explicit exclusions. Until an authorized governance update reconciles that file, implementation work must surface the conflict instead of silently treating either scope as authoritative.
