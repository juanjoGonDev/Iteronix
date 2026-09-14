# Actions runtime hardening

## Request

Correct the shared required-QA Dependabot merge automation after the real clean-state failure while preserving exact-head manual QA and downstream workflow execution.

## Evidence

- Run `31248923187`, job `93082017918`, validated the current approval and then failed because `enablePullRequestAutoMerge` returned `UNPROCESSABLE: Pull request is in clean status`.
- GitHub CLI implements `--auto` as an immediate merge when a PR is already mergeable, but an immediate merge authenticated with `GITHUB_TOKEN` would suppress most downstream workflow events.
- Behind Dependabot PRs that modify `.github/workflows/*` can require the sensitive Workflows permission to refresh automatically.

## Decision

- Revalidate current-head, non-bot, write-maintainer approval immediately before mutation.
- Use the protected `admin` Actions secret `PAT_FINE`, validated as the repository owner, for live branch and merge transitions so generated push events remain eligible to trigger workflows.
- Squash-merge an exact approved head when GitHub reports `clean`; otherwise enable repository auto-merge when available.
- Handle a clean-state race by re-fetching head, merge state and current approval before merging.
- Never grant Workflows permission. Behind PRs that change workflows are reported as `manual-branch-update-required`; a trusted manual branch update invalidates the old approval and requires a new one.
- Keep dry-run non-mutating.

## Acceptance

- The observed clean-state GraphQL failure is eliminated.
- Workflow-changing behind PRs do not cause permission escalation.
- Stale/bot approvals, change requests, changed heads, conflicts and unknown merge states cannot merge.
- Downstream workflows are not intentionally suppressed by `GITHUB_TOKEN` merge operations.

## Checks

Parse workflow YAML, syntax-check shell and `github-script` programs, verify immutable Action SHAs, then rely on pull-request CI as authority.

## Rollback

Revert the corrective pull request. No merge, release, publish or deployment is performed by this branch.

## Delivery status

Implemented on `agent/fix-actions-runtime-20260808`; pending pull-request CI and explicit owner merge approval.
