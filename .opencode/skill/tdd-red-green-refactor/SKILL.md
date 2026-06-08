---
name: tdd-red-green-refactor
description: Write changes using strict TDD with tests as the source of truth
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: tdd
---

## What I do

- Follow **Red → Green → Refactor** with small, reversible steps
- Start by writing a failing test that matches the requested behavior
- Implement the minimum code to pass
- Refactor only once tests are green

## When to use me

Use this when you want the AI to stop “inventing features” and instead ship only what is requested.

## Execution rules

- Do **not** write production code before a failing test exists (unless explicitly asked)
- Keep diffs small (one behavior at a time)
- If requirements are unclear, pick the simplest interpretation and encode it in a test
- Never skip tests “because it seems obvious”

## Completion rules

- All new behavior is covered by tests
- Test suite is green after refactor
- No unrelated changes
