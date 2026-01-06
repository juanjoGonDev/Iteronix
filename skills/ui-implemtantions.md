# Skill: UI Implementation from Spec (PNG + HTML)

## Purpose

Translate a UI specification (Google Stitch) into production UI code
while preserving global invariants and avoiding dead or inconsistent UI.

## When to use

- Implementing or rebuilding a UI screen
- Working with `ui-spec/screens/<screen>/reference.png` and `spec.html`
- Replacing buggy or inconsistent UI

## Input

- `reference.png` (visual truth)
- `spec.html` (structure/layout reference)
- Existing global UI baseline (shell, navigation, tokens)

## Output

- A fully functional screen OR explicitly disabled controls
- Reusable components (no page-sized HTML blobs)
- No UI inconsistencies introduced

## Execution rules

- Do NOT copy-paste full HTML from the spec.
- Preserve global invariants:
  - layout shell
  - sidebar menu order
  - header structure
  - icon system
  - design tokens
- If spec conflicts with invariants, invariants win.
- Be reasonable: omit decorative or unnecessary elements.

## Completion rules

- No dead UI: everything clickable must work or be disabled with explanation.
- Screen visually matches the PNG and structurally matches the HTML.
- Shared components are reused where applicable.

## Failure modes (do NOT do this)

- Inventing UI elements not present in the spec
- Changing navigation or header per screen
- Leaving buttons or menus without behavior
