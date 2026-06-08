---
name: command-discovery
description: Identify and use the repository’s real test/lint/typecheck commands
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: tooling
---

## What I do

- Find the correct commands from:
  - `package.json` scripts
  - `Makefile`
  - `pyproject.toml`
  - `go.mod` + CI config
  - `justfile` / `taskfile.yml`
- Avoid inventing commands that don’t exist

## When to use me

Use this when the AI keeps running the wrong commands or skips checks.

## Execution rules

- Prefer project-defined scripts over global defaults
- If multiple commands exist (fast vs full), choose **fast** during iteration and **full** at the end
- Mirror CI as the final step

## Completion rules

- List the discovered commands and which ones were used
- CI-equivalent check executed before “done”
