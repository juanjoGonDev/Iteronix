# Server API

## Environment variables

- `AUTH_TOKEN` (required): Bearer token for API authentication.
- `WORKSPACE_ROOTS` (required): Comma or semicolon-separated list of allowed workspace root paths.
- `COMMAND_ALLOWLIST` (optional): Comma or semicolon-separated list of allowed command names or paths.
- `HOST` (optional): Server bind address. Default `0.0.0.0`.
- `PORT` (optional): Server port. Default `4000`.

## Local run

1) Install dependencies: `pnpm install`
2) Build runtime output: `pnpm exec tsc -p tsconfig.build.json`
3) Start server: `node dist/apps/server-api/src/index.js`

## Docker

Build:

`docker build -f apps/server-api/Dockerfile -t iteronix-server .`

Run (example):

`docker run --rm -p 4000:4000 -e AUTH_TOKEN=dev-token -e WORKSPACE_ROOTS=/workspace -e COMMAND_ALLOWLIST=git -v /host/project:/workspace iteronix-server`
