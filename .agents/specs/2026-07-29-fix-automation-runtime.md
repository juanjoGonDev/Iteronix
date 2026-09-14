# Fix repository automation runtime

## Request

Audit the merged repository automation after real Dependabot executions, correct common failures, create the required labels and preserve the actor separation used by `fastypest`.

## Evidence

- Dependabot run `30449377010` in the reference rollout failed while creating `requires-manual-qa` because `gh label create` had no repository context and the job intentionally performs no checkout.
- The merged workflow approved Dependabot pull requests with `github-actions[bot]`; the required contract is repository-owner approval followed by GitHub Actions auto-merge.
- Automated review identified missing fork guards, an unused cache permission, missing approval-actor verification, dry-run label mutation and a concurrent label-creation race.
- `fastypest` uses `requires-manual-qa` with color `E99695` and description `Needs manual quality assurance testing before merging`.

## Decision

- Keep `pull_request` as the Dependabot event and never check out dependency pull-request code.
- Require `PAT_FINE` as a Dependabot repository secret with Pull requests read/write for this repository.
- Resolve the authenticated PAT login with `gh api user` and fail unless it equals `GITHUB_REPOSITORY_OWNER` (`juanjoGonDev`).
- Use `github.token` only for repository labels and squash auto-merge.
- Pass explicit repository context to `gh` commands.
- Synchronize label metadata only outside dry-run mode and tolerate the specific concurrent `422 already_exists` race.
- Block privileged jobs in forks and retain exact-head approval, branch-update and revalidation protections.
- Keep **Allow auto-merge** enabled. The repository setting **Allow GitHub Actions to create and approve pull requests** is not required here because GitHub Actions never submits a review; the owner PAT does.

## Acceptance criteria

- Eligible Dependabot updates are approved by `juanjoGonDev`, never by a bot or another PAT owner.
- GitHub Actions enables squash auto-merge for the expected head SHA after required checks.
- Production majors receive `requires-manual-qa` and require a current non-bot write maintainer approval.
- Manual dry runs make no repository mutation.
- Concurrent label creation cannot abort QA processing.
- Cache cleanup cannot run in forks and has only `actions: write`.
- Missing or incorrectly owned `PAT_FINE` fails with precise guidance.

## Validation

- Workflow YAML is parsed by repository CI and introduced Actions remain pinned by immutable SHA.
- Pull-request CI is authoritative for formatting, workflow contracts and repository checks.
- Runtime identity validation requires the configured Dependabot secret and a subsequent Dependabot event after merge.

## Rollback

Revert the corrective pull request. Existing dependency pull requests, labels and caches are not destructively changed by this branch.

## Delivery status

Implemented on `agent/fix-automation-runtime` and delivered through a normal corrective pull request. No merge, release or deployment is included.
