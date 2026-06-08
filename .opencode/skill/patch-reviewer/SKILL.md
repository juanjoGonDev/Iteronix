---
name: patch-reviewer
description: Self-review the diff against requirements, tests, and quality gates
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: review
---

## What I do

- Review the patch like a strict teammate would
- Check for missed edge cases, dead code, and broken invariants
- Ensure tests and linting cover the change

## When to use me

Use this right before merging or ending a live coding segment.

## Execution rules

- Review checklist:
  - Does the diff match the stated goal?
  - Are there new tests?
  - Are error paths covered?
  - Any breaking API changes?
  - Any leftover TODOs / console logs?
- If something is missing, propose the smallest correction

## Completion rules

- Written review + top 3 risks (if any)
- All gates green
- Suggested final commit message
