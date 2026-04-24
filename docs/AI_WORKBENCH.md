# AI Workbench

## Core capabilities

- Hierarchical memory with working, episodic, and semantic stores.
- Skill registry with on-disk manifests, schemas, prompt templates, guardrails, traces, and episodic write-back.
- RAG with repository ingestion, retrieval gating, cache-augmented reuse, credibility scoring, citations, and provenance.
- MCP interoperability via an Iteronix MCP server plus external client connectors for stdio and SSE servers.
- Planner -> Retriever -> Executor -> Reviewer orchestration with reviewer checkpoints.
- JSONL evaluation harness with trace IDs and regression-friendly scoring.
- OpenTelemetry runtime plus evidence reports persisted to `.iteronix/evidence`.

## Directory conventions

- `skills/<skill-name>/skill.json`: canonical skill manifest.
- `.iteronix/memory`: local memory storage.
- `.iteronix/vector`: local vector index storage.
- `.iteronix/evidence`: evidence reports and run traces.
- `packages/eval/fixtures/*.jsonl`: evaluation datasets.

## HTTP endpoints

- `POST /ai/skills/run`
  - body: `{ "skillName": string, "sessionId": string, "input": Record<string, unknown> }`
- `POST /ai/workflows/run`
  - body: `{ "skillName": string, "sessionId": string, "question": string, "autoApprove": boolean }`
- `POST /ai/evals/run`
  - body: `{ "datasetPath": string }`
- `POST /ai/memory/query`
  - body: `{ "sessionId": string, "query": string, "limit": number }`

## Retrieval strategy

- Loader supports `.md`, `.txt`, `.ts`, and `.json`.
- Retrieval gate skips trivial greetings.
- Retrieval results are cached by `sessionId + query + topK`.
- Confidence uses top score, score margin, recency, source type, and cross-source agreement.

## Security defaults

- Input guardrails detect prompt injection and simple PII heuristics.
- Tool execution is default-deny and scoped by skill allowlist.
- Grounded outputs require citations when retrieval is active.
- Evidence reports capture decisions, guardrail hits, citations, and usage.

## Browser validation workflows

- `pnpm -C apps/web-ui validate:source-linking`
  - Use this for the normal deterministic browser check of collapsed-citation source linking and evidence filter clearing.
  - The command deletes older `apps/web-ui/screenshots/*.png` files first, then captures the latest run only.
- `pnpm -C apps/web-ui validate:source-linking:preserve`
  - Use this when investigating a flaky or visual regression and you need to compare the new run with previous screenshots.
  - The command keeps existing PNG artifacts and appends the new captures from the latest run.

Both commands exercise the same `apps/web-ui/scripts/validate-workbench-source-linking.ts` flow against the built preview app. The current CI workflow is unchanged: it runs the default cleanup variant after `pnpm build` and uploads `apps/web-ui/screenshots/` only if the job fails.
