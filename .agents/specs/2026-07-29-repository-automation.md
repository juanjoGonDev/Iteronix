# Repository automation standardization

## Request

Audit the active workflows against `fastypest`, correct Dependabot branch handling, add cache and merge automation, and open one PR without merging or releasing.

## Evidence

- Default branch: `master`.
- Stack: pnpm monorepo, Node.js, and TypeScript.
- Existing workflows cover CI and project bootstrap.
- Existing Dependabot targeted `main`, while CI and the repository default use `master`.
- Dependabot-triggered `pull_request_target` workflows receive a read-only token and no secrets, so privileged Dependabot automation must not depend on repository secrets.

## Decision

- Remove the hard-coded target branch and group weekly npm and GitHub Actions updates after a seven-day cooldown.
- Use `pull_request` plus the repository-scoped `GITHUB_TOKEN` for Dependabot approval, labels, and auto-merge; no PR code is checked out.
- Require a current write-permission maintainer approval for production majors, bound to the current head SHA.
- Use the scheduled default-branch workflow and `GITHUB_TOKEN` for required-QA branch updates and auto-merge.
- Add cache-key-independent cleanup through the repository cache API with manual dry-run by default.
- Do not add release automation because the monorepo has no current versioned GitHub artifact contract.

## Acceptance

- [x] Dependabot correctly follows `master`.
- [x] No privileged workflow checks out pull-request-controlled code.
- [x] External or stale approvals cannot unlock production majors.
- [x] Cache cleanup is global and empty-safe.
- [x] No new repository secret or variable is required.
- [x] Existing CI/bootstrap behavior is preserved.

## Validation

The proposed YAML parsed successfully. Existing package scripts, default branch, and workflows were inspected. Pull-request CI remains the runtime gate.

## Repository settings

Enable repository auto-merge and `Allow GitHub Actions to create and approve pull requests`. Required status checks must remain enforced on `master`.

## Risks and rollback

The workflows cannot approve or queue pull requests if the repository settings above are disabled. Existing mutable Action tags remain separate debt. Revert this PR to roll back.

## Delivery

- Branch: `agent/chore-repository-automation`
- Base: `master`
- Merge/release/deploy/publish: not authorized

## Status

Implemented on the task branch; pull-request checks and repository settings remain to be verified.
