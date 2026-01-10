---
name: strict-acceptance-criteria
description: Convert vague requests into checkable acceptance criteria and tests
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: requirements
---

## What I do

- Rewrite the request as 3–7 bullet acceptance criteria
- Map each criterion to a test or a concrete verification step
- Prevent “creative interpretation”

## When to use me

Use this when prompts are high-level and the AI starts making assumptions.

## Execution rules

- Acceptance criteria must be measurable (“when X, then Y”)
- Every criterion must be verified by:
  - a test, or
  - a deterministic manual check (explicit steps)
- If something is unknown, choose the simplest default and document it

## Completion rules

- Criteria listed + evidence for each (test names / commands / steps)
- No extra features beyond criteria
