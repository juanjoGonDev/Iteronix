# Skill: Auto-loop Step Execution

## Purpose

Execute one step of an autonomous loop with strict validation and feedback.

## When to use

- Running iterative AI workflows
- Executing PLAN.md tasks automatically

## Input

- Current step definition (JSON)
- Context summary (AGENTS.md + PLAN.md + latest logs)

## Output

- Validated step result (JSON)
- Clear summary
- Next step proposal (or stop)

## Rules

- Output MUST match the defined JSON schema.
- If validation fails, generate corrective feedback and retry.
- Never proceed with invalid output.
- Always append an AGENTS_LOGS.md entry.

## Completion

- Step output is valid.
- Context is compacted if needed.
