# Deployment

## Development

- `pnpm dev` runs server API and web UI in watch mode.
- Docker is optional in development.
- Local AI workbench state is written to `.iteronix/` and ignored by git.

## Production build

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm eval:min
```

## Production run

```bash
AUTH_TOKEN=change-me \
WORKSPACE_ROOTS=/workspace \
pnpm start
```

## Optional Qdrant

```bash
docker compose up -d qdrant
```

Set `AI_QDRANT_URL=http://localhost:6333` to route retrieval storage through Qdrant.

## Raspberry Pi and ARM64 notes

- Use Node 20+ ARM64 images.
- Keep `.iteronix/` on persistent storage.
- Prefer Qdrant or the file vector store for lightweight deployments.

## Reverse proxy

An Nginx reverse proxy can forward `/api` and `/ai` traffic to the server API while serving static assets from the web UI build output.

## Required environment variables

- `AUTH_TOKEN`
- `WORKSPACE_ROOTS`
- Optional: `PORT`, `HOST`, `LOG_DIR`
- Optional AI settings: `AI_SKILLS_DIR`, `AI_MEMORY_DIR`, `AI_EVIDENCE_DIR`, `AI_VECTOR_DIR`, `AI_QDRANT_URL`, `AI_PGVECTOR_CONNECTION_STRING`, `OTEL_EXPORTER_OTLP_ENDPOINT`
