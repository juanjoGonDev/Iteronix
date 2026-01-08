---
name: repo-invariants-guardian
description: Protect architectural and product invariants while implementing changes
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: architecture
---

## What I do

- Identify invariants (API contracts, folder boundaries, conventions, tokens)
- Ensure changes don’t violate them
- Escalate conflicts with a clear tradeoff

## When to use me

Use this when the AI “fixes” something by breaking conventions or moving code around.

## Execution rules

- Invariants list must be explicit (3–10 bullets)
- If a request conflicts with an invariant:
  - propose the smallest compliant alternative
  - or isolate the breaking change behind a flag/adaptor

## Completion rules

- Invariants respected (or explicitly documented if changed)
- No surprise behavior changes
- Quality gates green
