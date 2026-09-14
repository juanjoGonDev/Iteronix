# Iteronix agent instructions

## Scope and autonomy
- The user defines the outcome; choose the smallest safe implementation path.
- Preserve unrelated work. Never use force-push, merge, release, deploy, publish, change secrets, or perform destructive data operations without explicit approval.
- Read the active spec or plan only when it applies to the request. Historical logs and specs are evidence, not mandatory startup context.

## Engineering
- TypeScript source is strict: avoid `any` and unsafe casts; validate untrusted input at boundaries.
- Keep domain logic pure where practical; isolate filesystem, process, HTTP, and provider effects behind adapters.
- Prefer one owner for each business rule and avoid duplicated logic.
- Use clear names, small cohesive modules, and named constants for meaningful values.
- Add or update tests for changed behavior when practical. Core domain, orchestration, and policy changes should follow red-green-refactor.

## Validation
- Run the narrowest meaningful checks first. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before delivery when the change affects code broadly, CI, packages, or production behavior.
- Do not stop independent work while CI runs; inspect CI only when it blocks the next action.

## Project boundaries
- The web UI lives in `apps/web-ui`; the desktop wrapper must reuse it.
- `packages/domain` contains pure logic and ports; adapters contain side effects; server and UI are shells.
- Keep secrets out of source control and declare plugin permissions explicitly.

## Delivery
- Keep commits atomic when commits are requested or required by repository policy. Never stage unrelated files.
- Report concisely: change, validation, and any real blocker.