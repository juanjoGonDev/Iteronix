# Skill: Safe Refactor

## Purpose

Improve code structure without changing observable behavior.

## When to use

- Cleaning up messy code
- Improving readability or structure
- Reducing duplication

## Input

- Target files
- Existing behavior (implicit or explicit)

## Output

- Cleaner code
- Same behavior
- No API or UI changes

## Rules

- Do NOT change behavior.
- Do NOT change public interfaces unless explicitly requested.
- Prefer small, incremental changes.
- One concern per refactor.

## Validation

- Existing tests must still pass.
- No new failing lint/typecheck errors.
