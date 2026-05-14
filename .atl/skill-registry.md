# Iteronix Skill Registry

Generated: 2026-05-14
Project: iteronix
Root: D:\projects\Iteronix
Resolution: project skills in `.opencode/skill` take precedence over user skills in `C:\Users\juanj\.codex\skills`. Skipped `sdd-*`, `_shared`, and `skill-registry`.

## Compact Rules

### change-scope-guard
Source: `D:\projects\Iteronix\.opencode\skill\change-scope-guard\SKILL.md`
Trigger: Prevent scope creep and unrelated refactors during live coding.
- State the goal in one sentence before editing.
- List up to three non-goals and expected files to touch.
- Reject drive-by refactors unless they are necessary for the stated goal.
- Justify every touched file outside the expected scope.
- Prefer additive, small, reviewable changes over rewrites.

### ci-parity-finalizer
Source: `D:\projects\Iteronix\.opencode\skill\ci-parity-finalizer\SKILL.md`
Trigger: Run the same checks as CI before finishing.
- Read CI config and mirror its local checks.
- Use the project-pinned Node/pnpm versions where applicable.
- Do not claim completion until CI-equivalent commands are green.
- Summarize pass/fail for each command.
- Explain any local deviation from CI explicitly.

### command-discovery
Source: `D:\projects\Iteronix\.opencode\skill\command-discovery\SKILL.md`
Trigger: Identify and use repository test/lint/typecheck commands.
- Prefer scripts from `package.json` and CI over invented commands.
- Use fast/narrow checks during iteration when available.
- Use full CI-equivalent checks before finishing.
- Report the exact commands discovered and used.
- If multiple commands exist, explain why the chosen one fits the phase.

### dev-server-watchmode-port-aware
Source: `D:\projects\Iteronix\.opencode\skill\dev-server-watchmode-port-aware\SKILL.md`
Trigger: Start or reuse dev servers safely in watch mode.
- Never kill processes by default.
- Never change ports by default.
- Detect canonical host/port from repo config or scripts, not guesses.
- Preflight the expected endpoint before starting a server.
- Reuse a healthy existing server; report unknown port conflicts instead of mutating them.

### failing-tests-first
Source: `D:\projects\Iteronix\.opencode\skill\failing-tests-first\SKILL.md`
Trigger: Reproduce a bug with a failing test before fixing it.
- Add the smallest deterministic regression test before production fixes.
- Confirm the test fails for the intended reason.
- Stabilize flaky repros before changing implementation.
- Implement only enough to make the regression pass.
- Finish with the relevant suite green and root cause explained.

### live-coding-narrator
Source: `D:\projects\Iteronix\.opencode\skill\live-coding-narrator\SKILL.md`
Trigger: Keep live coding aligned with checkpoints.
- Maintain Plan → smallest step → verify → next step.
- Keep plans to five steps or fewer.
- Verify after each meaningful step, at least with fast relevant checks.
- Stop and fix verification failures before moving forward.
- End with completed checkpoints and final full gates.

### minimal-diff-mode
Source: `D:\projects\Iteronix\.opencode\skill\minimal-diff-mode\SKILL.md`
Trigger: Implement with the smallest safe diff.
- Touch as few files as possible.
- Avoid renames and formatting churn.
- Keep public APIs stable unless explicitly required.
- Split unavoidable refactors from behavior changes.
- Let tests prove the requested behavior without incidental changes.

### patch-reviewer
Source: `D:\projects\Iteronix\.opencode\skill\patch-reviewer\SKILL.md`
Trigger: Self-review a diff before merge/end.
- Check the diff against the stated goal and acceptance criteria.
- Verify new behavior has tests where required.
- Look for missed error paths, dead code, breaking API changes, TODOs, and console logs.
- Propose the smallest correction for any finding.
- Return top risks and final commit message suggestion only after gates are green.

### quality-gates-enforcer
Source: `D:\projects\Iteronix\.opencode\skill\quality-gates-enforcer\SKILL.md`
Trigger: Enforce lint, typecheck, tests, build before completion.
- Detect real project commands from scripts/CI.
- Run mandatory gates before declaring completion.
- For Iteronix, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` after file changes.
- If a gate fails, stop and report exact command plus failure summary.
- Do not use “should work” language without green evidence.

### repo-invariants-guardian
Source: `D:\projects\Iteronix\.opencode\skill\repo-invariants-guardian\SKILL.md`
Trigger: Protect architecture and product invariants.
- Make relevant invariants explicit before risky changes.
- Preserve clean/hexagonal boundaries: domain pure, adapters side-effecting, shells at app edges.
- Preserve single PWA UI reused by browser/Electron/server-hosted modes.
- Escalate conflicts with tradeoffs and a smallest compliant alternative.
- Do not surprise-change API contracts, tokens, layout shell, or folder boundaries.

### strict-acceptance-criteria
Source: `D:\projects\Iteronix\.opencode\skill\strict-acceptance-criteria\SKILL.md`
Trigger: Convert vague requests into measurable acceptance criteria.
- Produce 3 to 7 checkable criteria when scope is vague.
- Map each criterion to a test or deterministic verification step.
- Avoid creative interpretation beyond the criteria.
- Document unknowns instead of silently assuming complex behavior.
- Use evidence from tests/commands/manual steps to close criteria.

### tdd-red-green-refactor
Source: `D:\projects\Iteronix\.opencode\skill\tdd-red-green-refactor\SKILL.md`
Trigger: Strict TDD for behavior changes.
- Write a failing test before production code unless the change is pure config/docs.
- Keep one behavior per red/green/refactor cycle.
- Implement the minimum code required to pass.
- Refactor only after tests are green.
- Never skip tests because behavior seems obvious.

### ui-implementation-from-spec
Source: `D:\projects\Iteronix\.opencode\skill\ui-implementations\SKILL.md`
Trigger: Implement UI from PNG + HTML spec.
- Use `reference.png` as visual truth and `spec.html` as structure hint only.
- Never copy full-page HTML from the spec.
- Preserve global shell, sidebar order, header, icon system, tokens, and shared layout rhythm.
- Build reusable components instead of page-sized one-off markup.
- Every clickable control must work or be explicitly disabled with explanation.
- If spec conflicts with global invariants, global invariants win and the discrepancy is logged.

### branch-pr
Source: `C:\Users\juanj\.codex\skills\branch-pr\SKILL.md`
Trigger: Creating, opening, or preparing PRs for review.
- Every PR must link an approved issue unless the project explicitly overrides that workflow.
- Use conventional branch names: `feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert/<description>`.
- Run required checks before opening or declaring PR-ready.
- Keep PR body aligned with the repository template.
- Never add AI attribution or `Co-Authored-By` trailers for this project.

### chained-pr
Source: `C:\Users\juanj\.codex\skills\chained-pr\SKILL.md`
Trigger: PRs over 400 changed lines, stacked PRs, review slices.
- Split changes above 400 changed lines unless maintainer accepts `size:exception`.
- Keep each PR as one reviewable work unit with tests/docs included.
- State dependencies, current slice, follow-ups, and out-of-scope items.
- Do not mix chaining strategies mid-change.
- Retarget/rebase polluted diffs until each PR shows only its intended slice.

### cognitive-doc-design
Source: `C:\Users\juanj\.codex\skills\cognitive-doc-design\SKILL.md`
Trigger: Writing guides, READMEs, RFCs, architecture, onboarding, review-facing docs.
- Lead with the answer; put context after the decision/action.
- Use progressive disclosure: happy path first, details later.
- Prefer tables, checklists, and examples over dense prose.
- Group related information into small, scannable sections.
- Design docs so reviewers can verify intent without reconstructing history.

### comment-writer
Source: `C:\Users\juanj\.codex\skills\comment-writer\SKILL.md`
Trigger: PR feedback, issue replies, reviews, Slack messages, GitHub comments.
- Start with the actionable point.
- Be warm, direct, and short.
- Explain the technical reason when requesting changes.
- Match the user/thread language.
- Avoid em dashes and avoid low-value pile-on comments.

### go-testing
Source: `C:\Users\juanj\.codex\skills\go-testing\SKILL.md`
Trigger: Go tests, coverage, Bubbletea teatest, golden files.
- Use only for Go code; Iteronix currently has no Go modules detected.
- Prefer table-driven tests and behavior assertions.
- Use `t.TempDir()` for filesystem tests.
- Keep integration tests skippable under short mode.
- Update golden files only through the repo’s explicit update path.

### issue-creation
Source: `C:\Users\juanj\.codex\skills\issue-creation\SKILL.md`
Trigger: Creating GitHub issues, bug reports, feature requests.
- Search for duplicates before creating a new issue.
- Use repository issue templates and fill required fields.
- Default new issues to review/approval workflow when repo automation supports it.
- Keep bug reports reproducible with expected vs actual behavior.
- Do not open PR work for an issue-first repo until approval requirements are satisfied.

### judgment-day
Source: `C:\Users\juanj\.codex\skills\judgment-day\SKILL.md`
Trigger: Judgment Day, dual review, adversarial review, juzgar.
- Use only when explicitly requested.
- Resolve and inject project standards before judge/fix prompts.
- Run two blind reviewers in parallel against the same target and criteria.
- Treat one-judge findings as suspect, not automatically confirmed.
- After fixes, re-run both judges before terminal approval/escalation.

### skill-creator
Source: `C:\Users\juanj\.codex\skills\skill-creator\SKILL.md`
Trigger: New skills, agent instructions, documenting AI usage patterns.
- Create a skill only for reusable AI execution patterns.
- Keep `SKILL.md` concise with frontmatter, activation, hard rules, gates, steps, output, references.
- Move long examples/schemas/background into local `references/` or `assets/`.
- Preserve trigger words in a one-line quoted description.
- Do not create skills for one-off documentation.

### uncodixfy
Source: `C:\Users\juanj\.codex\skills\uncodixfy\SKILL.md`
Trigger: Generating frontend UI code.
- Avoid generic AI UI: glassmorphism, decorative gradients, oversized radii, pill overload, dramatic shadows.
- Prefer functional, restrained UI inspired by Linear, Raycast, Stripe, and GitHub.
- Use normal sidebars, headers, cards, forms, tables, tabs, badges, and spacing.
- Keep typography simple, hierarchy clear, and iconography monochrome/subtle.
- Do not invent new layout language when an existing app shell/design system exists.

### work-unit-commits
Source: `C:\Users\juanj\.codex\skills\work-unit-commits\SKILL.md`
Trigger: Implementation, commit splitting, chained PRs, tests/docs with code.
- Commit by deliverable work unit, not by file type.
- Keep tests with the behavior they verify.
- Keep docs with the user-visible change they explain.
- Ensure each commit can be reviewed and rolled back reasonably.
- Promote work units into chained PR slices when review budget approaches 400 changed lines.

## User Skills Trigger Table

| Skill | Primary triggers | Source |
| --- | --- | --- |
| change-scope-guard | scope creep, unrelated refactor | project |
| ci-parity-finalizer | CI parity, before push/merge | project |
| command-discovery | find commands, wrong test command | project |
| dev-server-watchmode-port-aware | dev server, watch mode, port conflict | project |
| failing-tests-first | bugfix, reproduce bug | project |
| live-coding-narrator | live coding checkpoints | project |
| minimal-diff-mode | minimal diff, low-risk change | project |
| patch-reviewer | self-review, pre-merge review | project |
| quality-gates-enforcer | finishing task, quality gates | project |
| repo-invariants-guardian | architecture/product invariants | project |
| strict-acceptance-criteria | vague request, acceptance criteria | project |
| tdd-red-green-refactor | TDD, behavior changes | project |
| ui-implementation-from-spec | PNG/HTML UI spec | project |
| branch-pr | PR creation/preparation | user |
| chained-pr | >400-line PR, stacked PRs | user |
| cognitive-doc-design | docs, README, RFC, architecture docs | user |
| comment-writer | PR/issue/review comments | user |
| go-testing | Go tests | user |
| issue-creation | GitHub issue creation | user |
| judgment-day | dual/adversarial review | user |
| skill-creator | create/update skills | user |
| uncodixfy | frontend UI generation | user |
| work-unit-commits | commit planning/splitting | user |

## Project Convention Sources

- `D:\projects\Iteronix\AGENTS.md`: highest-priority repo instructions; mandates strict TypeScript, TDD for core/domain/shared/orchestration, quality gates, Spanish summaries, and English fenced next prompt.
- `D:\projects\Iteronix\PLAN.md`: milestone source of truth and current Workflows/Kanban/UI completion context.
- `D:\projects\Iteronix\AGENTS_LOGS.md`: append-only decision log; latest entries keep Workflows 06.3 open pending explicit user acceptance.
