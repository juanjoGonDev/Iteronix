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

- `pnpm -C apps/web-ui validate:source-linking` - run the deterministic browser validation for collapsed-citation source linking and evidence filter clearing, removing older `apps/web-ui/screenshots/*.png` files before capturing the latest run
- `pnpm -C apps/web-ui validate:source-linking:preserve` - run the same browser validation while keeping existing screenshots so the new captures can be compared with prior runs during manual debugging

## Cleanup

- `pnpm clean` - remove build artifacts
