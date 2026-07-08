# URL-addressable UI state

Iteronix stores only small, intentional navigation state in `location.search`. This keeps browser refresh, new tabs and browser history useful without leaking payloads or secrets.

## Rules

- Query params only; no hash state.
- Use typed helpers in `apps/web-ui/src/shared/url-state.ts` and route policies in `apps/web-ui/src/shared/url-state-registry.ts`.
- Use `pushState` for opening/closing entities that users expect to navigate with back/forward.
- Use `replaceState` for tabs, filters and search refinements that should not create noisy history.
- If an ID from the URL no longer exists, fall back to the closest valid parent route and rewrite the URL.
- Never store secrets, API keys, tokens, passwords, credentials, bearer values, absolute paths, file contents, diff payloads, commit messages, drafts, hover, drag, focus or toast state.
- Shared URL writes and app startup sanitize sensitive query parameter names defensively.

## Route matrix

| Route        | Status  | Params                                                                                                                                                                 | Restore target                                                         |
| ------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/`          | none    | none                                                                                                                                                                   | Static overview has no reload-useful deep state yet.                   |
| `/projects`  | mixed   | `run`, `gates`, `diff`, `path`                                                                                                                                         | Selected quality run, gate filters, diff scope and relative diff path. |
| `/explorer`  | mixed   | `section`, `file`, `q`, `regex`, `case`, `word`                                                                                                                        | Sidebar section, relative file path and search flags.                  |
| `/kanban`    | push    | `task`                                                                                                                                                                 | Selected task modal.                                                   |
| `/workflows` | mixed   | `panel`, `modal`, `node`, `execution`, `version`, `inputTab`, `outputTab`, `inputSource`, `editor`, `deepTab`, `deepOutputTab`, `regexPattern`, `regexFlags`, `action` | Workflow panels, modals and useful debug/editor state.                 |
| `/history`   | mixed   | `kind`, `id`, `source`                                                                                                                                                 | Selected run/evaluation and valid evidence source.                     |
| `/settings`  | replace | `tab`, `profile`                                                                                                                                                       | Active settings tab and selected provider profile.                     |

## Validation checklist

- Unit tests cover each parser with valid, invalid and cleanup cases.
- Browser validators cover reload restoration for Settings, Projects, Explorer, Kanban, History and Workflows.
- Kanban and History also cover invalid URL fallback plus back/forward restoration.
- Screenshots are captured under `apps/web-ui/screenshots/` during browser validations and remain gitignored.
- `pnpm format:check`, `pnpm quality`, `pnpm build` and route-specific validate scripts must pass before shipping URL-state changes.
