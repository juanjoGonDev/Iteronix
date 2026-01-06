# Skill: Kanban Task Lifecycle Management

## Purpose

Create, review, approve, reject, or close tasks in a Jira-like Kanban flow.

## When to use

- The user asks to create tasks
- The agent proposes work items
- A task reaches REVIEW or QA stage

## Input

- Task description
- Current column (IDEAS, REVIEW, TODO, IN_PROGRESS, QA, DONE)
- Optional reviewer feedback

## Output

- Task created, moved, updated, or closed
- State transition recorded
- Comments preserved when applicable

## Rules

- Tasks created by the agent must start in REVIEW unless explicitly instructed otherwise.
- REVIEW tasks require an explicit approve or request-changes action.
- Requesting changes must include a concrete comment.
- Closed tasks must remain reopenable.

## Acceptance

- Task state reflects the decision accurately.
- No silent transitions.
- Reviewer intent is preserved.
