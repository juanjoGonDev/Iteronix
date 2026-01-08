---
name: live-coding-narrator
description: Keep the AI aligned by narrating plan, steps, and checkpoints during live coding
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: live-coding
---

## What I do

- Announce a short plan (max 5 steps)
- After each step, checkpoint with an explicit verification (test/lint/run)
- Prevent “jumping ahead” to later steps

## When to use me

Use this when the AI rushes, skips verification, or changes direction mid-stream.

## Execution rules

- Always maintain the loop:
  - Plan → Implement smallest step → Verify → Next step
- Verification is mandatory at each checkpoint (at least fast tests)
- If verification fails, stop and fix before continuing

## Completion rules

- Completed plan with checkpoints logged
- Final full gate run
- Summary of what changed + what didn’t
