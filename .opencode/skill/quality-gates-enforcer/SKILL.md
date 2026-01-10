---
name: quality-gates-enforcer
description: Enforce tests, lint, typecheck, and formatting before declaring anything done
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: ci
---

## What I do

- Run the project’s quality gates in the right order
- Refuse to claim completion while gates are failing
- Summarize failures and propose the smallest fix that restores green

## When to use me

Use this in live coding when the AI tends to “ship” without running:

- tests
- lint
- typecheck
- formatting

## Execution rules

- Detect the repo’s standard commands (package scripts / make / task runner)
- Default order:
  1. format (if auto-fixable)
  2. lint
  3. typecheck
  4. tests
- If a gate fails, stop and fix **that** before continuing

## Completion rules

- Provide the exact commands run + results summary
- All gates green
- No “it should work” claims
