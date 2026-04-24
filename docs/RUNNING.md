# Running Iteronix

## Prerequisites

- Node.js (LTS)
- PNPM (`corepack enable` if needed)

## Development

- `pnpm dev` - start server API (watch) and web UI (watch)
- `pnpm dev:server` - watch server API only
- `pnpm dev:web` - watch web UI only
- `pnpm dev:desktop` - watch desktop main and start the web UI dev server

Notes:

- Web UI dev server serves `apps/web-ui` and reloads when `apps/web-ui/dist` changes.
- Desktop dev mode defaults to `http://localhost:5173`.

## Production

- `pnpm build` - build all packages and apps
- `pnpm start` - run server API from built output
- `pnpm preview:web` - serve the built web UI locally

## Evaluation

- `pnpm eval:min` - run the minimal AI evaluation suite backed by `packages/eval/fixtures/minimal-suite.jsonl`

## Browser validation

| Command | Use case | Screenshot behavior |
| --- | --- | --- |
| `pnpm -C apps/web-ui validate:source-linking` | Deterministic browser validation for normal verification | Deletes older `apps/web-ui/screenshots/*.png` files before capturing the latest run |
| `pnpm -C apps/web-ui validate:quality-gates` | Deterministic browser validation for the `Projects` quality-gates flow | Deletes older `apps/web-ui/screenshots/*.png` files before capturing the latest run |
| `pnpm -C apps/web-ui validate:source-linking:preserve` | Manual debugging and visual comparison across runs | Keeps existing screenshots and appends the new captures from the latest run |

CI coverage:

- GitHub Actions runs `pnpm -C apps/web-ui validate:source-linking` and `pnpm -C apps/web-ui validate:quality-gates` after `pnpm build`.
- `apps/web-ui/screenshots/` is uploaded as an artifact only when the CI job fails.

## Cleanup

- `pnpm clean` - remove build artifacts
