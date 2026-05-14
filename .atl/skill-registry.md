# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual `SKILL.md` files.

See `C:\Users\juanj\.codex\skills\_shared\skill-resolver.md` for the full resolution protocol.

Generated: 2026-05-14
Project: iteronix
Root: D:\projects\Iteronix
Resolution: project skills take precedence over user skills; `.opencode/skill` is included because `AGENTS.md` defines it as the project skill location. Skipped `sdd-*`, `_shared`, and `skill-registry`.

## User Skills

| Trigger | Skill | Source | Path |
| --- | --- | --- | --- |
| Prevent scope creep and unrelated refactors during live coding | change-scope-guard | project | `D:\projects\Iteronix\.opencode\skill\change-scope-guard\SKILL.md` |
| Run the same checks as CI before finishing a live coding task | ci-parity-finalizer | project | `D:\projects\Iteronix\.opencode\skill\ci-parity-finalizer\SKILL.md` |
| Identify and use the repository’s real test/lint/typecheck commands | command-discovery | project | `D:\projects\Iteronix\.opencode\skill\command-discovery\SKILL.md` |
| In watchmode, detect an existing dev server and reuse it instead of killing it or changing ports | dev-server-watchmode-port-aware | project | `D:\projects\Iteronix\.opencode\skill\dev-server-watchmode-port-aware\SKILL.md` |
| Reproduce the bug with a failing test before fixing it | failing-tests-first | project | `D:\projects\Iteronix\.opencode\skill\failing-tests-first\SKILL.md` |
| Keep the AI aligned by narrating plan, steps, and checkpoints during live coding | live-coding-narrator | project | `D:\projects\Iteronix\.opencode\skill\live-coding-narrator\SKILL.md` |
| Implement features with the smallest possible diff and lowest risk | minimal-diff-mode | project | `D:\projects\Iteronix\.opencode\skill\minimal-diff-mode\SKILL.md` |
| Self-review the diff against requirements, tests, and quality gates | patch-reviewer | project | `D:\projects\Iteronix\.opencode\skill\patch-reviewer\SKILL.md` |
| Enforce tests, lint, typecheck, and formatting before declaring anything done | quality-gates-enforcer | project | `D:\projects\Iteronix\.opencode\skill\quality-gates-enforcer\SKILL.md` |
| Protect architectural and product invariants while implementing changes | repo-invariants-guardian | project | `D:\projects\Iteronix\.opencode\skill\repo-invariants-guardian\SKILL.md` |
| Convert vague requests into checkable acceptance criteria and tests | strict-acceptance-criteria | project | `D:\projects\Iteronix\.opencode\skill\strict-acceptance-criteria\SKILL.md` |
| Write changes using strict TDD with tests as the source of truth | tdd-red-green-refactor | project | `D:\projects\Iteronix\.opencode\skill\tdd-red-green-refactor\SKILL.md` |
| Implement a UI screen from a PNG + HTML spec without breaking global UI invariants | ui-implementation-from-spec | project | `D:\projects\Iteronix\.opencode\skill\ui-implementations\SKILL.md` |
| creating, opening, or preparing PRs for review. | branch-pr | user | `C:\Users\juanj\.config\opencode\skills\branch-pr\SKILL.md` |
| PRs over 400 lines, stacked PRs, review slices. Split oversized changes into chained PRs that protect review focus. | chained-pr | user | `C:\Users\juanj\.config\opencode\skills\chained-pr\SKILL.md` |
| writing guides, READMEs, RFCs, onboarding, architecture, or review-facing docs. | cognitive-doc-design | user | `C:\Users\juanj\.config\opencode\skills\cognitive-doc-design\SKILL.md` |
| PR feedback, issue replies, reviews, Slack messages, or GitHub comments. | comment-writer | user | `C:\Users\juanj\.config\opencode\skills\comment-writer\SKILL.md` |
| Go tests, go test coverage, Bubbletea teatest, golden files. Apply focused Go testing patterns. | go-testing | user | `C:\Users\juanj\.config\opencode\skills\go-testing\SKILL.md` |
| Generate or edit raster images when the task benefits from AI-created bitmap visuals such as photos, illustrations, textures, sprites, mockups, or transparent-background cutouts. Use when Codex should create a brand-new image, transform an existing image, or derive visual variants from references, and the output should be a bitmap asset rather than repo-native code or vector. Do not use when the task is better handled by editing existing SVG/vector/code-native assets, extending an established icon or logo system, or building the visual directly in HTML/CSS/canvas. | imagegen | user | `C:\Users\juanj\.codex\skills\.system\imagegen\SKILL.md` |
| creating GitHub issues, bug reports, or feature requests. | issue-creation | user | `C:\Users\juanj\.config\opencode\skills\issue-creation\SKILL.md` |
| judgment day, dual review, adversarial review, juzgar. Run blind dual review, fix confirmed issues, then re-judge. | judgment-day | user | `C:\Users\juanj\.config\opencode\skills\judgment-day\SKILL.md` |
| Use when the user asks how to build with OpenAI products or APIs and needs up-to-date official documentation with citations, help choosing the latest model for a use case, or model upgrade and prompt-upgrade guidance; prioritize OpenAI docs MCP tools, use bundled references only as helper context, and restrict any fallback browsing to official OpenAI domains. | openai-docs | user | `C:\Users\juanj\.codex\skills\.system\openai-docs\SKILL.md` |
| Create and scaffold plugin directories for Codex with a required `.codex-plugin/plugin.json`, optional plugin folders/files, and baseline placeholders you can edit before publishing or testing. Use when Codex needs to create a new local plugin, add optional plugin structure, or generate or update repo-root `.agents/plugins/marketplace.json` entries for plugin ordering and availability metadata. | plugin-creator | user | `C:\Users\juanj\.codex\skills\.system\plugin-creator\SKILL.md` |
| new skills, agent instructions, documenting AI usage patterns. Create LLM-first skills with valid frontmatter. | skill-creator | user | `C:\Users\juanj\.config\opencode\skills\skill-creator\SKILL.md` |
| Install Codex skills into $CODEX_HOME/skills from a curated list or a GitHub repo path. Use when a user asks to list installable skills, install a curated skill, or install a skill from another repo (including private repos). | skill-installer | user | `C:\Users\juanj\.codex\skills\.system\skill-installer\SKILL.md` |
| Prevents generic AI/Codex UI patterns when generating frontend code. Use this skill whenever generating HTML, CSS, React, Vue, Svelte, or any frontend UI code to enforce clean, human-designed aesthetics inspired by Linear, Raycast, Stripe, and GitHub instead of typical AI-generated UI. | uncodixfy | user | `C:\Users\juanj\.codex\skills\uncodixfy\SKILL.md` |
| implementation, commit splitting, chained PRs, or keeping tests and docs with code. | work-unit-commits | user | `C:\Users\juanj\.config\opencode\skills\work-unit-commits\SKILL.md` |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### change-scope-guard

- State the goal in one sentence before editing.
- List up to three non-goals and expected files before the change.
- Reject drive-by refactors unless required for the stated goal.
- Justify every touched file outside the expected scope.
- Prefer additive, small, reviewable changes over broad rewrites.

### ci-parity-finalizer

- Read CI config and mirror its local checks before finishing.
- Use project-pinned Node/pnpm versions where applicable.
- Do not claim completion until CI-equivalent commands are green.
- Summarize pass/fail for each command with exact names.
- Explain every local deviation from CI explicitly.

### command-discovery

- Prefer scripts from `package.json` and CI over invented commands.
- Use fast/narrow checks during iteration when they exist.
- Use full CI-equivalent checks before finishing.
- Report exact commands discovered and used.
- If multiple commands exist, explain why the chosen one fits the phase.

### dev-server-watchmode-port-aware

- Never kill processes by default.
- Never change ports by default.
- Detect canonical host/port from repo config or scripts, not guesses.
- Preflight the expected endpoint before starting a server.
- Reuse a healthy existing server; report unknown port conflicts instead of mutating them.

### failing-tests-first

- Add the smallest deterministic regression test before production fixes.
- Confirm the test fails for the intended reason.
- Stabilize flaky repros before changing implementation.
- Implement only enough to make the regression pass.
- Finish with the relevant suite green and root cause explained.

### live-coding-narrator

- Maintain Plan → smallest step → verify → next step.
- Keep plans to five steps or fewer.
- Verify after each meaningful step, at least with fast relevant checks.
- Stop and fix verification failures before moving forward.
- End with completed checkpoints and final full gates.

### minimal-diff-mode

- Touch as few files as safely possible.
- Avoid renames and formatting churn.
- Keep public APIs stable unless explicitly required.
- Split unavoidable refactors from behavior changes.
- Let tests prove the requested behavior without incidental changes.

### patch-reviewer

- Check the diff against the stated goal and acceptance criteria.
- Verify new behavior has tests where required.
- Look for missed error paths, dead code, breaking API changes, TODOs, and console logs.
- Propose the smallest correction for any finding.
- Return top risks and commit message suggestion only after gates are green.

### quality-gates-enforcer

- Detect real project commands from scripts and CI.
- Run mandatory gates before declaring completion.
- For Iteronix, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` after file changes.
- If a gate fails, stop and report exact command plus failure summary.
- Do not use “should work” language without green evidence.

### repo-invariants-guardian

- Make relevant invariants explicit before risky changes.
- Preserve clean/hexagonal boundaries: domain pure, adapters side-effecting, shells at app edges.
- Preserve the single PWA UI reused by browser, Electron, and server-hosted modes.
- Escalate conflicts with tradeoffs and the smallest compliant alternative.
- Do not surprise-change API contracts, tokens, layout shell, or folder boundaries.

### strict-acceptance-criteria

- Produce 3 to 7 checkable criteria when scope is vague.
- Map each criterion to a test or deterministic verification step.
- Avoid creative interpretation beyond the criteria.
- Document unknowns instead of silently assuming complex behavior.
- Use evidence from tests, commands, or manual steps to close criteria.

### tdd-red-green-refactor

- Write a failing test before production code unless the change is pure config/docs.
- Keep one behavior per red/green/refactor cycle.
- Implement the minimum code required to pass.
- Refactor only after tests are green.
- Never skip tests because behavior seems obvious.

### ui-implementation-from-spec

- Treat `ui-spec/screens/<screen>/reference.png` as visual truth and `spec.html` as structural truth.
- Translate specs into component-based app code; never copy full-page HTML directly.
- Preserve global shell invariants: sidebar order, header structure, icon set, shared tokens.
- Every clickable control must work end-to-end or be visibly disabled with explanation.
- Validate responsive behavior and capture browser evidence for UI work.

### branch-pr

- Check for an approved issue before PR work unless the repo explicitly overrides issue-first flow.
- Use conventional branch names: `feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert/<description>`.
- Run required checks before opening or declaring a PR ready.
- Keep the PR body aligned with the repository template.
- Never add AI attribution or `Co-Authored-By` trailers for this project.

### chained-pr

- Split changes above 400 changed lines unless a maintainer accepts `size:exception`.
- Keep each PR as one reviewable work unit with tests/docs included.
- State dependencies, current slice, follow-ups, and out-of-scope items.
- Do not mix chaining strategies mid-change.
- Retarget/rebase polluted diffs until each PR shows only its intended slice.

### cognitive-doc-design

- Lead with the answer; put context after the decision/action.
- Use progressive disclosure: happy path first, details later.
- Prefer tables, checklists, and examples over dense prose.
- Group related information into small, scannable sections.
- Design docs so reviewers can verify intent without reconstructing history.

### comment-writer

- Start with the actionable point.
- Be warm, direct, and short.
- Explain the technical reason when requesting changes.
- Match the user/thread language.
- Avoid em dashes and low-value pile-on comments.

### go-testing

- Use only for Go code; Iteronix currently has no Go modules detected.
- Prefer table-driven tests and behavior assertions.
- Use `t.TempDir()` for filesystem tests.
- Keep integration tests skippable under short mode.
- Update golden files only through the repo’s explicit update path.

### imagegen

- Use for AI-created or edited raster images: photos, illustrations, textures, sprites, mockups, or cutouts.
- Do not use when SVG/vector/code-native assets or HTML/CSS are the right representation.
- For existing image edits, use the image generation/editing tool unless the user explicitly asks otherwise.
- Keep transformations scoped to the user request and preserve reference constraints.
- After image generation, avoid extra download/summarization/follow-up chatter.

### issue-creation

- Search for duplicates before creating a new issue.
- Use repository issue templates and fill required fields.
- Default new issues to review/approval workflow when repo automation supports it.
- Keep bug reports reproducible with expected vs actual behavior.
- Do not open PR work for an issue-first repo until approval requirements are satisfied.

### judgment-day

- Use only when explicitly requested.
- Resolve and inject project standards before judge/fix prompts.
- Run two blind reviewers in parallel against the same target and criteria.
- Treat one-judge findings as suspect, not automatically confirmed.
- After fixes, re-run both judges before terminal approval/escalation.

### openai-docs

- Use for OpenAI product/API questions, model guidance, and upgrade/prompt-upgrade work.
- Prefer official OpenAI docs tooling; fallback browsing must stay on official OpenAI domains.
- Verify current docs before stating model, API, SDK, or product behavior.
- Cite official sources for current OpenAI guidance.
- Keep docs research separate from repo implementation unless the user asks for code changes.

### plugin-creator

- Use only when creating or updating local Codex plugin structure.
- Always include a valid `.codex-plugin/plugin.json` when scaffolding a plugin.
- Create optional plugin folders/files only when requested or required by the plugin design.
- Update repo-root `.agents/plugins/marketplace.json` only when the user asks for marketplace metadata.
- Keep plugin metadata valid, local, and testable before presenting it.

### skill-creator

- Create a skill only for reusable AI execution patterns.
- Keep `SKILL.md` concise with frontmatter, activation, hard rules, gates, steps, output, and references.
- Move long examples, schemas, and background into local `references/` or `assets/`.
- Preserve trigger words in a one-line quoted description.
- Do not create skills for one-off documentation.

### skill-installer

- Use for listing/installing Codex skills from curated sources or GitHub repos.
- Install skills under `$CODEX_HOME/skills` and verify the resulting `SKILL.md` exists.
- Follow the installer workflow rather than copying partial skill files manually.
- Use available repo/auth mechanisms for private repos; never expose secrets.
- Do not install adjacent plugins/tools when the user asked only for a skill.

### uncodixfy

- Avoid generic AI UI: glassmorphism, decorative gradients, oversized radii, pill overload, and dramatic shadows.
- Prefer restrained UI inspired by Linear, Raycast, Stripe, and GitHub.
- Use normal sidebars, headers, cards, forms, tables, tabs, badges, and spacing.
- Keep typography simple, hierarchy clear, and iconography monochrome/subtle.
- Do not invent new layout language when an existing app shell/design system exists.

### work-unit-commits

- Commit by deliverable work unit, not by file type.
- Keep tests with the behavior they verify.
- Keep docs with the user-visible change they explain.
- Ensure each commit can be reviewed and rolled back reasonably.
- Promote work units into chained PR slices when review budget approaches 400 changed lines.

## Project Conventions

| File | Path | Notes |
| --- | --- | --- |
| AGENTS.md | `D:\projects\Iteronix\AGENTS.md` | Index — highest-priority repo instructions and referenced project conventions. |
| PLAN.md | `D:\projects\Iteronix\PLAN.md` | Referenced by AGENTS.md; milestone source of truth and current focus. |
| AGENTS_LOGS.md | `D:\projects\Iteronix\AGENTS_LOGS.md` | Referenced by AGENTS.md; append-only decision and command log. |
| .opencode/skill/ | `D:\projects\Iteronix\.opencode\skill` | Referenced by AGENTS.md; project skill definitions with precedence over user skills. |
| ui-spec/ | `D:\projects\Iteronix\ui-spec` | Referenced by AGENTS.md; PNG/HTML source of truth for UI work. |
| docs/UI_CHECKLIST.md | `D:\projects\Iteronix\docs\UI_CHECKLIST.md` | Referenced by PLAN.md for UI consistency checks. |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted so sub-agents do not need to read index files just to discover more context.
