# Iteronix

Iteronix is a PNPM monorepo for a server-first AI Engineering Workbench. The current repository ships a typed headless server API, a reusable web UI, an Electron wrapper, and an extensible AI stack covering hierarchical memory, skills, MCP interoperability, RAG/CAG, multi-agent orchestration, guardrails, observability, and evaluation.

## Architecture

- `apps/server-api`: headless HTTP API, SSE streams, project/files/history/kanban endpoints, and AI workbench routes.
- `apps/web-ui`: responsive PWA shell reused by browser and desktop.
- `apps/desktop-main`: Electron-style desktop launcher for local or remote server usage.
- `packages/domain`: stable provider and port contracts.
- `packages/adapters`: CLI/provider and log adapters.
- `packages/ai-core`: shared AI runtime types, serializable schemas, env config.
- `packages/memory`: working, episodic, and semantic memory management with local file persistence.
- `packages/skills`: on-disk skill registry and skill execution pipeline.
- `packages/rag`: ingestion, chunking, retrieval, cache-augmented generation, credibility scoring, file/Qdrant/pgvector vector stores.
- `packages/mcp`: MCP server exposure plus external client connection helpers.
- `packages/guardrails`: prompt/tool/output guardrails and least-privilege policy checks.
- `packages/observability`: OpenTelemetry runtime and evidence report persistence.
- `packages/eval`: JSONL evaluation harness and CI smoke suite.
- `packages/agents`: planner-retriever-executor-reviewer workflow orchestration.

## AI Workbench Vertical Slice

The repository now includes an end-to-end backend slice:

- `POST /ai/skills/run`
- `POST /ai/workflows/run`
- `POST /ai/evals/run`
- `POST /ai/memory/query`

The default skill is loaded from `skills/example-skill/skill.json`. Runs use file-backed memory, repository ingestion, retrieval gating, citations, confidence scoring, evidence reports, and deterministic evaluation so CI can execute without external model access.

## Quickstart

### Prerequisites

- Node.js 20+
- PNPM 10+

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev
pnpm dev:server
pnpm dev:web
pnpm dev:desktop
```

### Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm eval:min
```

### Browser validation for source linking

| Command | Use case |
| --- | --- |
| `pnpm -C apps/web-ui validate:source-linking` | Normal clean run with only the latest screenshots kept |
| `pnpm -C apps/web-ui validate:source-linking:preserve` | Manual debugging when older screenshots must remain available for comparison |

The canonical operational reference, including screenshot-retention behavior, lives in [`docs/RUNNING.md`](docs/RUNNING.md#browser-validation).

### Run the AI evaluation slice

```bash
pnpm eval:min
```

### Example AI skill request

```bash
curl -X POST http://localhost:4000/ai/skills/run \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "skillName": "example-skill",
    "sessionId": "demo-session",
    "input": { "question": "What is Iteronix?" }
  }'
```

## Storage and infra

- Local/dev persistence is file-based under `.iteronix/`.
- Optional vector backends are available for Qdrant and pgvector.
- `compose.yaml` starts Qdrant for production-like retrieval experiments.

## Documentation

- `docs/RUNNING.md`: developer commands.
- `docs/DEPLOYMENT.md`: deployment and infrastructure notes.
- `docs/AI_WORKBENCH.md`: workbench architecture and API details.
- `CHANGELOG.md`: release notes template.
