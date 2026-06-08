---
name: minimal-diff-mode
description: Implement features with the smallest possible diff and lowest risk
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: maintenance
---

## What I do

- Prefer minimal, local changes over redesigns
- Keep public APIs stable unless explicitly requested
- Avoid refactors unless required to pass tests

## When to use me

Use this when time is short and you need predictable progress on stream.

## Execution rules

- Touch as few files as possible
- Avoid renames and formatting churn
- If a refactor is unavoidable, split into:
  1. refactor (no behavior change)
  2. feature (behavior change) with tests

## Completion rules

- Small, reviewable diff
- Tests prove behavior
- No incidental changes
