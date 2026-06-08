---
name: ci-parity-finalizer
description: Run the same checks as CI before finishing a live coding task
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: ci
---

## What I do

- Identify CI pipeline checks and mirror them locally
- Ensure “works on my machine” equals “passes CI”
- Produce a final verification transcript

## When to use me

Use this before pushing/merging to avoid stream-ending CI failures.

## Execution rules

- Read CI config (GitHub Actions / GitLab CI / etc.) and match steps
- If CI uses multiple versions (node/python), use the project’s default or pinned version
- No completion claim until CI-parity run is green

## Completion rules

- CI-equivalent commands executed
- Output summarized (pass/fail)
- Any deviations from CI explained
