---
name: ui-implementation-from-spec
description: Implement a UI screen from a PNG + HTML spec without breaking global UI invariants
license: MIT
compatibility: opencode
metadata:
  audience: frontend
  workflow: ui
---

## What I do

- Turn `reference.png` (visual truth) + `spec.html` (structure hint) into production UI code
- Keep the app’s global UI baseline consistent (shell, nav, tokens, icons)
- Build reusable components instead of page-sized HTML blobs
- Ensure every interactive control works, or is explicitly disabled with a clear reason

## When to use me

Use this when you are implementing or rebuilding a UI screen based on:

- `ui-spec/screens/<screen>/reference.png`
- `ui-spec/screens/<screen>/spec.html`

Especially useful when you need to replace buggy/inconsistent UI while preserving the existing design system.

## Inputs

- `reference.png` as the source of visual truth
- `spec.html` as a structural/layout reference (not copy-paste source)
- Existing global UI baseline:
  - layout shell
  - sidebar menu order
  - header structure
  - icon system
  - design tokens

## Outputs

- A fully functional screen, or intentionally disabled controls with an explanation
- Reusable components and shared patterns (no giant one-off markup)
- No new UI inconsistencies introduced into the global experience

## Execution rules

- Do **NOT** copy-paste full HTML from `spec.html`
- Preserve global invariants:
  - layout shell
  - sidebar menu order
  - header structure
  - icon system
  - design tokens
- If the spec conflicts with global invariants, **invariants win**
- Be pragmatic: omit purely decorative or unnecessary elements
- Prefer shared components over screen-specific hacks

## Completion rules

- No dead UI: everything clickable must work **or** be disabled with explanation
- The screen visually matches the PNG and broadly aligns with the HTML structure
- Reuse existing shared components when applicable

## Failure modes (do NOT do this)

- Invent UI elements not present in the spec
- Change navigation or header per screen
- Leave buttons/menus without behavior
- Introduce new tokens/icons/patterns that diverge from the global baseline
