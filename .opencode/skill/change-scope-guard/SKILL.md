---
name: change-scope-guard
description: Prevent scope creep and unrelated refactors during live coding
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: incremental
---

## What I do

- Lock the task to a single goal and a small set of files
- Reject “drive-by improvements” unless explicitly requested
- Keep changes minimal and reviewable

## When to use me

Use this when the AI starts refactoring architecture, renaming everything, or adding extra features.

## Execution rules

- Start by stating:
  - Goal (1 sentence)
  - Non-goals (3 bullets max)
  - Expected files to touch
- Any change outside expected files requires a justification tied to the goal
- Prefer additive changes over rewrites

## Completion rules

- Diff matches the stated goal
- No unrelated renames/reformats
- Clear commit message suggestion
