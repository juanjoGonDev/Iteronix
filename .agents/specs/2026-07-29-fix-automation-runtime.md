# Fix repository automation runtime

## Request

Audit the merged repository automation after real Dependabot executions, correct common failures and preserve the required actor separation used by `fastypest`.

## Evidence

- Dependabot run `30449377010` in the reference rollout failed while creating `requires-manual-qa` because `gh label create` had no repository context and the job intentionally performs no checkout.
- The original workflow approved Dependabot pull requests with `github-actions[bot]`; the repository contract requires the repository owner token to approve Dependabot and the repository-scoped `GITHUB_TOKEN` to enable auto-merge.
- Review feedback identified missing fork guards and an unnecessary `contents: read` permission in cache maintenance.
- `fastypest` uses `requires-manual-qa` with color `E99695` and the description `Needs manual quality assurance testing before merging`.

## Decision

- Keep `pull_request` as the Dependabot event and never check out dependency pull-request code.
- Require `PAT_FINE` as a **Dependabot repository secret** for eligible dependency approvals. The token must be fine-grained, repository-scoped and grant Pull requests read/write.
- Validate the credential inside the shell step because GitHub Actions does not allow direct secret references in `if:` conditions.
- Continue using `github.token` for labels and enabling squash auto-merge.
- Pass `--repo "$GITHUB_REPOSITORY"` to repository-level `gh` commands.
- Create or normalize the manual-QA label from the scheduled/manual QA workflow.
- Block privileged jobs in forked repositories and remove unused cache permissions.
- Retain exact-head approval validation for manually reviewed production majors.

## Acceptance criteria

- Eligible Dependabot updates are approved by `juanjoGonDev`, not by a bot.
- Auto-merge remains performed by GitHub Actions and stays bound to the expected head SHA.
- Production majors receive a correctly configured `requires-manual-qa` label without requiring a checkout.
- Required-QA approvals apply only to the current head and only from non-bot maintainers with write permission.
- Cache cleanup cannot run in forks and has only `actions: write`.
- Missing `PAT_FINE` fails with a precise configuration error instead of silently weakening review policy.

## Validation

- Workflow YAML parsed with a non-coercing loader.
- Actions remain pinned by immutable SHA.
- Pull-request CI validates repository-owned formatting, workflow contracts and application checks.
- Full actor-identity validation requires the configured Dependabot secret and a subsequent Dependabot event.

## Rollback

Revert the corrective pull request. Existing dependency pull requests and caches are not mutated by the branch itself.

## Delivery status

Implementation complete on `agent/fix-automation-runtime`; pull request and CI validation pending.
