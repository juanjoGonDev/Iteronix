# Workflows Editor MVP Contract

## Purpose

This document locks phase `06.1` for the `Workflows` screen before any runtime implementation starts. It replaces ambiguity with one canonical contract for the first integrated editor MVP.

## Current baseline

The current repository only supports a demo workflow runner:

- `apps/web-ui/src/screens/Workflows.ts` is a run form with evidence/history panels, not an editor.
- `apps/server-api/src/ai-workbench.ts` exposes execution endpoints, but no workflow-definition CRUD.
- `packages/agents/src/workflow-orchestrator.ts` is a fixed linear planner -> retriever -> executor -> reviewer sequence.
- Shared workbench types only describe linear runs, not persisted node graphs.

The editor MVP must therefore introduce a new server-first workflow contract instead of stretching the existing demo types.

## MVP boundary

Included in the first runnable MVP:

- Full-height integrated `Workflows` shell in `apps/web-ui`
- Persisted workflow definitions in server workspace state
- One real node graph model with drag/move/connect semantics
- One real reusable asset library for prompts, instructions and guardrails
- One real execution history model with per-run and per-node usage/costs
- Manual trigger only
- Codex CLI-compatible provider execution baseline
- Cross-provider context handoff owned by the server
- JSON output contracts with live validation through a shared schema subset
- Guardrails attachable to nodes with `warn`, `error` and `success` outcomes

Explicitly deferred after the MVP:

- Schedule, webhook, event and init triggers as active runtime features
- Large integration catalog
- Marketplace or subgraph publishing
- Automatic replace-style editor flows
- Arbitrary provider transcript portability without normalization

## MVP node set

The first node set is intentionally small but complete enough to build a real workflow:

| Kind | Purpose | Reusable | Multi-input | Multi-output |
| --- | --- | --- | --- | --- |
| `trigger.manual` | Explicit user-started entrypoint | No | No | Yes |
| `asset.prompt` | Reusable prompt body + output contract | Yes | Yes | Yes |
| `asset.instruction` | Reusable instruction body + output contract | Yes | Yes | Yes |
| `asset.guardrail` | Reusable validation pack attached to nodes | Yes | Yes | Yes |
| `ai.agent` | Role-driven AI step (`planner`, `retriever`, `executor`, `reviewer`) | No | Yes | Yes |
| `ai.provider-run` | Direct model call with explicit provider/model params | No | Yes | Yes |
| `logic.condition` | Route by boolean or contract field | No | Yes | Yes |
| `logic.merge` | Merge multiple upstream payloads into one envelope | No | Yes | Yes |
| `human.review` | Approval/deny checkpoint | No | Yes | Yes |
| `terminal.response` | Final workflow output for history/API consumers | No | Yes | No |

The first runnable reference flow is:

`trigger.manual -> asset.prompt -> ai.agent(planner) -> ai.agent(retriever) -> ai.agent(executor) -> human.review -> terminal.response`

The first direct-provider flow is:

`trigger.manual -> asset.instruction -> ai.provider-run -> asset.guardrail -> terminal.response`

## Persisted workflow schema

The persisted workflow definition is server-first and versioned.

```ts
export type WorkflowNodeKind =
  | "trigger.manual"
  | "asset.prompt"
  | "asset.instruction"
  | "asset.guardrail"
  | "ai.agent"
  | "ai.provider-run"
  | "logic.condition"
  | "logic.merge"
  | "human.review"
  | "terminal.response";

export type WorkflowDefinitionRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  version: number;
  createdAt: string;
  updatedAt: string;
  trigger: WorkflowTriggerRecord;
  viewport: WorkflowViewportRecord;
  nodes: ReadonlyArray<WorkflowNodeRecord>;
  edges: ReadonlyArray<WorkflowEdgeRecord>;
  executionPolicy: WorkflowExecutionPolicyRecord;
  defaultContextPolicy: WorkflowContextPolicyRecord;
  tags: ReadonlyArray<string>;
};

export type WorkflowTriggerRecord = {
  kind: "manual" | "schedule" | "webhook" | "event" | "init";
  enabled: boolean;
  config: Record<string, unknown>;
};

export type WorkflowViewportRecord = {
  x: number;
  y: number;
  zoom: number;
};

export type WorkflowNodeRecord = {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  position: { x: number; y: number };
  width: number;
  collapsed: boolean;
  config: WorkflowNodeConfigRecord;
  inputPorts: ReadonlyArray<WorkflowPortRecord>;
  outputPorts: ReadonlyArray<WorkflowPortRecord>;
  attachedGuardrails: ReadonlyArray<AttachedGuardrailRecord>;
  outputContract?: JsonOutputContractRecord;
};

export type WorkflowPortRecord = {
  id: string;
  name: string;
  acceptsMany: boolean;
};

export type WorkflowEdgeRecord = {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  mapping: EdgeMappingRecord;
};

export type WorkflowExecutionPolicyRecord = {
  maxNodeRetries: number;
  allowManualCheckpointResume: boolean;
};

export type WorkflowContextPolicyRecord = {
  language: string;
  carryMessagesLimit: number;
  carryArtifactLimit: number;
};

export type WorkflowNodeConfigRecord = {
  assetId?: string;
  role?: "planner" | "retriever" | "executor" | "reviewer";
  provider?: WorkflowProviderSelectionRecord;
  reviewPolicy?: {
    requireHumanDecision: boolean;
  };
};
```

Contract rules:

- `projectId` is required even for workflow-only projects. The project itself may have `rootPath: null` elsewhere.
- `trigger.kind` reserves future trigger families now, but the MVP runtime only enables `manual`.
- `version` increments on every persisted definition change.
- `nodes` and `edges` are the canonical editor source of truth. No client-local shadow format is allowed.
- `attachedGuardrails` stores node usage of guardrail assets separately from the node body to support usage counting and delete protection.

## Reusable asset schema

Reusable assets must work across projects inside the same server workspace.

```ts
export type WorkflowAssetRecord = {
  id: string;
  workspaceId: string;
  projectId?: string;
  kind: "prompt" | "instruction" | "guardrail";
  scope: "workspace" | "project";
  name: string;
  slug: string;
  description: string;
  body: string;
  language: string;
  version: number;
  tags: ReadonlyArray<string>;
  outputContract?: JsonOutputContractRecord;
  guardrail?: GuardrailDefinitionRecord;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export type WorkflowAssetUsageRecord = {
  assetId: string;
  workflowId: string;
  projectId: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  role: "primary" | "guardrail" | "instruction";
  createdAt: string;
};
```

Asset rules:

- `scope: "workspace"` makes the asset reusable across projects.
- `scope: "project"` keeps the asset local to one project.
- Assets cannot be hard-deleted while any `WorkflowAssetUsageRecord` exists.
- The UI must show usage count and exact references before any archive/delete action.
- Prompt and instruction assets may have an inline `outputContract`.
- Guardrail assets store their behavior in `guardrail`.

## Guardrail schema

A guardrail is a reusable pack of one to four validations. Each validation yields a level when it triggers.

```ts
export type GuardrailDefinitionRecord = {
  id: string;
  severity: "warn" | "error" | "success";
  operator: "all" | "any";
  validations: readonly [
    GuardrailValidationRecord,
    ...GuardrailValidationRecord[]
  ];
};

export type GuardrailValidationRecord = {
  id: string;
  kind:
    | "json_schema"
    | "regex"
    | "contains"
    | "not_contains"
    | "field_exists"
    | "field_equals"
    | "number_gte"
    | "number_lte";
  target: "input" | "output" | "context" | "metadata";
  path?: string;
  value?: string | number | boolean;
  message: string;
};

export type AttachedGuardrailRecord = {
  assetId: string;
  order: number;
  enabled: boolean;
};
```

Guardrail rules:

- Each guardrail may contain between 1 and 4 validations.
- Validations are added one by one in the UI.
- `severity: "error"` invalidates the node run when triggered.
- `severity: "warn"` records a warning but does not invalidate the node run.
- `severity: "success"` records a positive passed signal and never invalidates the node run.
- A node run is valid only if zero `error` guardrails trigger.
- The guardrail evaluator must emit deterministic structured results so UI and history can render the same interpretation.

## JSON output contract model

Prompt, instruction, agent and provider-run nodes may declare an expected JSON output contract. The contract is defined through a constrained serializable schema subset shared by server and UI.

```ts
export type JsonOutputContractRecord = {
  id: string;
  name: string;
  schemaVersion: 1;
  rootType: "object";
  schema: JsonSchemaNodeRecord;
  sampleOutput?: string;
};

export type JsonSchemaNodeRecord = {
  type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  title?: string;
  description?: string;
  required?: ReadonlyArray<string>;
  properties?: Readonly<Record<string, JsonSchemaNodeRecord>>;
  items?: JsonSchemaNodeRecord;
  enum?: ReadonlyArray<string>;
  nullable?: boolean;
};
```

Contract rules:

- The visual editor writes this constrained schema, not arbitrary JSON Schema.
- The runtime validator uses the same schema subset on the server.
- `sampleOutput` is optional but recommended for node-to-node mapping previews.
- Edge mapping must reference contract paths from this schema and not raw ad-hoc strings where possible.

## Edge mapping model

Node-to-node data flow is normalized at the edge level.

```ts
export type EdgeMappingRecord = {
  mode: "passthrough" | "object" | "template";
  entries: ReadonlyArray<EdgeMappingEntryRecord>;
};

export type EdgeMappingEntryRecord = {
  targetPath: string;
  source: {
    kind: "node_output" | "context_value" | "literal";
    nodeId?: string;
    path?: string;
    value?: string | number | boolean;
  };
};
```

Mapping rules:

- `passthrough` forwards the whole upstream payload.
- `object` builds a structured object from multiple sources.
- `template` is reserved for later string interpolation support, but can be represented from day one in the contract.
- The UI must expose contract-path pickers where contracts exist.

## Execution and cost data model

Workflow execution must be stored separately from workflow definitions.

```ts
export type WorkflowExecutionRecord = {
  id: string;
  workflowId: string;
  projectId: string;
  triggerKind: "manual" | "schedule" | "webhook" | "event" | "init";
  status: "running" | "completed" | "failed" | "awaiting_review" | "canceled";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  warningsCount: number;
  errorsCount: number;
  totals: WorkflowUsageTotalsRecord;
  contextSessionId: string;
  nodeRuns: ReadonlyArray<WorkflowNodeExecutionRecord>;
};

export type WorkflowUsageTotalsRecord = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostEur: number;
  estimatedCostSourceCurrency?: "USD" | "EUR";
  estimatedCostSourceValue?: number;
  exchangeRateEur?: number;
  latencyMs: number;
};

export type WorkflowNodeExecutionRecord = {
  id: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  status: "running" | "completed" | "failed" | "skipped" | "awaiting_review";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  providerId?: string;
  modelId?: string;
  reasoningLevel?: "low" | "medium" | "high" | "max";
  temperature?: number;
  verbosity?: "low" | "medium" | "high";
  usage?: WorkflowUsageTotalsRecord;
  alerts: ReadonlyArray<WorkflowAlertRecord>;
  outputSnapshot?: unknown;
};

export type WorkflowAlertRecord = {
  id: string;
  level: "info" | "success" | "warn" | "error";
  source: "system" | "guardrail" | "provider" | "checkpoint";
  message: string;
  createdAt: string;
};
```

Execution rules:

- History is server-backed and deletable by the user.
- Cost is normalized to EUR for UI totals.
- If the provider only exposes USD or no currency, the server records the source amount and normalized EUR fields together.
- Node-level usage is optional but totals must always be present, even if zero-valued.
- `awaiting_review` is the only blocking human state in the MVP.

## Cross-provider context handoff contract

Provider continuity must be owned by the server, not by raw transcript reuse. The canonical handoff unit is a normalized context envelope.

```ts
export type WorkflowContextEnvelope = {
  sessionId: string;
  workflowRunId: string;
  workflowId: string;
  language: string;
  summary: string;
  objectives: ReadonlyArray<string>;
  variables: Readonly<Record<string, unknown>>;
  artifacts: ReadonlyArray<WorkflowArtifactRecord>;
  citations: ReadonlyArray<WorkflowCitationRecord>;
  guardrailFindings: ReadonlyArray<WorkflowGuardrailFindingRecord>;
  messages: ReadonlyArray<WorkflowContextMessageRecord>;
};

export type WorkflowContextMessageRecord = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  sourceNodeId?: string;
};

export type WorkflowArtifactRecord = {
  id: string;
  kind: "json_output" | "text_output" | "retrieval_context" | "tool_result";
  nodeId: string;
  content: unknown;
};

export type WorkflowCitationRecord = {
  sourceId: string;
  chunkId: string;
  uri: string;
  score: number;
};

export type WorkflowGuardrailFindingRecord = {
  guardrailAssetId: string;
  nodeId: string;
  severity: "warn" | "error" | "success";
  message: string;
};
```

Handoff rules:

- The server compacts node outputs into `WorkflowContextEnvelope` between provider/model changes.
- Provider adapters receive a normalized envelope plus node-specific instructions, not raw prior-provider transcripts.
- Structured node outputs validated against `JsonOutputContractRecord` become first-class `artifacts` and `variables` for downstream nodes.
- Retrieval citations and guardrail findings travel with the envelope so provenance survives provider switches.
- `language` defaults to English for improve-with-AI actions and cross-provider summaries unless the workflow or user chooses another target language.
- The first MVP continuity guarantee is semantic continuity through this envelope, not byte-identical transcript portability.

## Provider runtime parameters per runnable node

Both `ai.agent` and `ai.provider-run` nodes share the same runtime parameter contract.

```ts
export type WorkflowProviderSelectionRecord = {
  providerId: string;
  modelId: string;
  reasoningLevel: "low" | "medium" | "high" | "max";
  temperature: number;
  verbosity: "low" | "medium" | "high";
  testStatus?: "unknown" | "passed" | "failed";
  testedAt?: string;
};
```

Rules:

- Codex CLI compatibility is the default baseline and must expose a test action.
- The UI may show unsupported controls as disabled with explanation when a provider lacks the capability.
- Runtime selection is per node, never global to the whole workflow.

## API surface implied by this contract

The next implementation phase must introduce at least these typed server operations:

- workflow definition CRUD
- workflow execution list/get/delete
- reusable asset CRUD + usage query
- guardrail evaluation results in execution history
- provider runtime test for workflow nodes
- manual workflow execution trigger

The web UI must consume these as the only source of truth.

## Decisions resolved by phase 06.1

Resolved now:

- first MVP node set
- persisted workflow graph shape
- reusable asset cross-project scope model
- delete protection model through usage records
- guardrail severity and validation-count rules
- JSON output contract model
- edge mapping model
- EUR-normalized execution and cost model
- server-owned cross-provider context handoff contract

Still deferred until implementation phases:

- exact visual layout of the right inspector panels
- exact provider capability matrix beyond Codex CLI baseline
- schedule/webhook/event trigger runtime behavior
- breadth of integration nodes after the first manual-run MVP
