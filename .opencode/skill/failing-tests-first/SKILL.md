---
name: failing-tests-first
description: Reproduce the bug with a failing test before fixing it
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: debugging
---

## What I do

- Convert a reported bug into a deterministic failing test
- Confirm the test fails for the right reason
- Fix the implementation until the test passes

## When to use me

Use this for bugfixes during live coding so the AI doesn’t “guess” a fix.

## Execution rules

- No fix without a failing test (unless the issue is purely configuration)
- Keep the reproduction minimal and isolated
- If flaky, stabilize (time, randomness, I/O) before fixing logic

## Completion rules

- New regression test added
- Full test suite green
- Short explanation of root cause
