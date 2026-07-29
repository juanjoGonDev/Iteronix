# Repository automation standardization

## Request

Audit the active workflows against `fastypest`, correct Dependabot branch handling, add cache and merge automation, and open one PR without merging or releasing.

## Evidence

- Default branch: `master`.
- Stack: pnpm monorepo, Node.js, and TypeScript.
- Existing workflows: CI and project bootstrap.
- Existing Dependabot targets `main`, while CI and the repository default use `master`.
- Existing workflows contain mutable Action tags; that broader pinning migration remains separate.

## Decision

- Remove the hard-coded target branch and group weekly npm and GitHub Actions updates after a seven-day cooldown.
- Add cache-key-independent cleanup through the repository cache API with manual dry-run by default.
- Auto-approve patch/minor updates and development-only majors without checking out PR code. Production majors require a current approval from a reviewer with write permission.
- Resolve the default branch dynamically, pin introduced Actions by immutable SHA, and use read-only defaults.
- Do not add release automation because the monorepo has no current versioned GitHub artifact contract.

## Acceptance

- [x] Dependabot correctly follows `master`.
- [x] No privileged workflow executes pull-request-controlled code.
- [x] External or stale approvals cannot unlock production majors.
- [x] Cache cleanup is global and empty-safe.
- [x] Existing CI/bootstrap behavior is preserved.

## Validation

The proposed YAML parsed successfully. Existing package scripts, default branch, and workflows were inspected. Pull-request CI remains the runtime gate.

## Risks and rollback

Auto-merge, branch protection, and an appropriately scoped token are required for writes. Existing mutable Action tags remain separate debt. Revert this PR to roll back.

## Delivery

- Branch: `agent/chore-repository-automation`
- Base: `master`
- Merge/release/deploy/publish: not authorized

## Status

Implemented on the task branch; pull-request checks and repository settings remain to be verified.
