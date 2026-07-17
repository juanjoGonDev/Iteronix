export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };
export type JsonRecord = Record<string, JsonValue>;

export const WorkflowNodeKind = {
  TriggerManual: "trigger.manual",
  AssetPrompt: "asset.prompt",
  AssetInstruction: "asset.instruction",
  AssetGuardrail: "asset.guardrail",
  AiAgent: "ai.agent",
  AiProviderRun: "ai.provider-run",
  LogicCondition: "logic.condition",
  LogicMerge: "logic.merge",
  WorkflowInvocation: "workflow.invocation",
  HumanReview: "human.review",
  TerminalResponse: "terminal.response",
} as const;

export type WorkflowNodeKind =
  (typeof WorkflowNodeKind)[keyof typeof WorkflowNodeKind];

export const WorkflowTriggerKind = {
  Manual: "manual",
  Schedule: "schedule",
  Webhook: "webhook",
  Event: "event",
  Init: "init",
} as const;

export type WorkflowTriggerKind =
  (typeof WorkflowTriggerKind)[keyof typeof WorkflowTriggerKind];

export const WorkflowRecordStatus = {
  Draft: "draft",
  Published: "published",
  Archived: "archived",
} as const;

export type WorkflowRecordStatus =
  (typeof WorkflowRecordStatus)[keyof typeof WorkflowRecordStatus];

export const WorkflowAssetKind = {
  Prompt: "prompt",
  Instruction: "instruction",
  Guardrail: "guardrail",
} as const;

export type WorkflowAssetKind =
  (typeof WorkflowAssetKind)[keyof typeof WorkflowAssetKind];

export const WorkflowAssetScope = {
  Global: "global",
} as const;

export type WorkflowAssetScope =
  (typeof WorkflowAssetScope)[keyof typeof WorkflowAssetScope];

export const WorkflowExecutionStatus = {
  Queued: "queued",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  AwaitingReview: "awaiting_review",
  Canceled: "canceled",
} as const;

export type WorkflowExecutionStatus =
  (typeof WorkflowExecutionStatus)[keyof typeof WorkflowExecutionStatus];

export const WorkflowNodeExecutionInputSourceKind = {
  LastUpstream: "last-upstream",
  NodeOutput: "node-output",
  AllPrevious: "all-previous",
} as const;

export type WorkflowNodeExecutionInputSourceKind =
  (typeof WorkflowNodeExecutionInputSourceKind)[keyof typeof WorkflowNodeExecutionInputSourceKind];

export type WorkflowNodeExecutionInputSourceRecord =
  | {
      kind: typeof WorkflowNodeExecutionInputSourceKind.LastUpstream;
    }
  | {
      kind: typeof WorkflowNodeExecutionInputSourceKind.NodeOutput;
      nodeId: string;
    }
  | {
      kind: typeof WorkflowNodeExecutionInputSourceKind.AllPrevious;
    };

export type WorkflowTriggerRecord = {
  kind: WorkflowTriggerKind;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type WorkflowViewportRecord = {
  x: number;
  y: number;
  zoom: number;
};

export type WorkflowExecutionPolicyRecord = {
  maxNodeRetries: number;
  maxConcurrency?: number;
  allowManualCheckpointResume: boolean;
};

export type WorkflowRuntimeSettings = {
  infiniteLoops: boolean;
  maxLoops: number;
  externalCalls: boolean;
  soundEnabled: boolean;
  webhookUrl: string;
};

export type WorkflowRuntimeSettingsOverride = Partial<WorkflowRuntimeSettings>;

export const resolveWorkflowRuntimeSettings = (
  defaults: WorkflowRuntimeSettings,
  override: WorkflowRuntimeSettingsOverride | undefined,
): WorkflowRuntimeSettings => ({
  ...defaults,
  ...override,
});

export type WorkflowAssetExecutionPolicyRecord = {
  maxRetries: number;
  timeoutMs: number;
};

export type WorkflowContextPolicyRecord = {
  language: string;
  carryMessagesLimit: number;
  carryArtifactLimit: number;
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

export const WorkflowNodeRole = {
  Planner: "planner",
  Retriever: "retriever",
  Executor: "executor",
  Reviewer: "reviewer",
} as const;

export type WorkflowNodeRole =
  (typeof WorkflowNodeRole)[keyof typeof WorkflowNodeRole];

export const WorkflowReasoningLevel = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Max: "max",
} as const;

export type WorkflowReasoningLevel =
  (typeof WorkflowReasoningLevel)[keyof typeof WorkflowReasoningLevel];

export const WorkflowVerbosity = {
  Low: "low",
  Medium: "medium",
  High: "high",
} as const;

export type WorkflowVerbosity =
  (typeof WorkflowVerbosity)[keyof typeof WorkflowVerbosity];

export type WorkflowProviderSelectionRecord = {
  providerId: string;
  modelId: string;
  reasoningLevel: WorkflowReasoningLevel;
  temperature: number;
  verbosity: WorkflowVerbosity;
  testStatus?: "unknown" | "passed" | "failed";
  testedAt?: string;
};

export type WorkflowNodeConfigRecord = {
  assetId?: string;
  role?: WorkflowNodeRole;
  provider?: WorkflowProviderSelectionRecord;
  prompt?: string;
  pinnedTestOutput?: {
    outputSnapshot: unknown;
    updatedAt: string;
  };
  pinnedTestOutputs?: ReadonlyArray<{
    id: string;
    name?: string;
    outputSnapshot: unknown;
    updatedAt: string;
  }>;
  defaultPinnedTestOutputId?: string;
  reviewPolicy?: {
    requireHumanDecision: boolean;
  };
  workflowInvocation?: {
    workflowId: string;
    workflowVersion: number;
  };
};

export type WorkflowPortRecord = {
  id: string;
  name: string;
  acceptsMany: boolean;
};

export type GuardrailValidationKind =
  | "json_schema"
  | "regex"
  | "contains"
  | "not_contains"
  | "field_exists"
  | "field_equals"
  | "number_gte"
  | "number_lte";

export type GuardrailValidationTarget =
  | "input"
  | "output"
  | "context"
  | "metadata";

export type GuardrailValidationRecord = {
  id: string;
  kind: GuardrailValidationKind;
  target: GuardrailValidationTarget;
  path?: string;
  value?: string | number | boolean;
  message: string;
};

export const WorkflowGuardrailSeverity = {
  Warn: "warn",
  Error: "error",
  Success: "success",
} as const;

export type WorkflowGuardrailSeverity =
  (typeof WorkflowGuardrailSeverity)[keyof typeof WorkflowGuardrailSeverity];

export const WorkflowGuardrailOperator = {
  All: "all",
  Any: "any",
} as const;

export type WorkflowGuardrailOperator =
  (typeof WorkflowGuardrailOperator)[keyof typeof WorkflowGuardrailOperator];

export type GuardrailDefinitionRecord = {
  id: string;
  severity: WorkflowGuardrailSeverity;
  operator: WorkflowGuardrailOperator;
  validations: ReadonlyArray<GuardrailValidationRecord>;
};

export type AttachedGuardrailRecord = {
  assetId: string;
  order: number;
  enabled: boolean;
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

export type JsonOutputContractRecord = {
  id: string;
  name: string;
  schemaVersion: 1;
  rootType: "object";
  schema: JsonSchemaNodeRecord;
  sampleOutput?: string;
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

export type EdgeMappingEntryRecord = {
  targetPath: string;
  source: {
    kind:
      | "node_output"
      | "last_node_output"
      | "accumulated_outputs"
      | "context_value"
      | "literal";
    nodeId?: string;
    path?: string;
    value?: string | number | boolean;
  };
};

export type EdgeMappingRecord = {
  mode: "passthrough" | "object" | "template";
  entries: ReadonlyArray<EdgeMappingEntryRecord>;
};

export type WorkflowEdgeRecord = {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  mapping: EdgeMappingRecord;
};

export type WorkflowDefinitionRecord = {
  id: string;
  name: string;
  description: string;
  status: WorkflowRecordStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  trigger: WorkflowTriggerRecord;
  viewport: WorkflowViewportRecord;
  nodes: ReadonlyArray<WorkflowNodeRecord>;
  edges: ReadonlyArray<WorkflowEdgeRecord>;
  executionPolicy: WorkflowExecutionPolicyRecord;
  runtimeSettingsOverride?: WorkflowRuntimeSettingsOverride;
  defaultContextPolicy: WorkflowContextPolicyRecord;
  tags: ReadonlyArray<string>;
};

export type WorkflowDefinitionVersionRecord = {
  id: string;
  workflowId: string;
  version: number;
  createdAt: string;
  snapshot: WorkflowDefinitionRecord;
  checksum?: string;
  author?: string;
  note?: string;
  tags?: ReadonlyArray<string>;
  changeType?: "manual" | "autosave" | "restore" | "clone" | "import";
  changeSummary?: string;
};

export type WorkflowAssetRecord = {
  id: string;
  kind: WorkflowAssetKind;
  scope: WorkflowAssetScope;
  name: string;
  slug: string;
  description: string;
  body: string;
  language: string;
  version: number;
  tags: ReadonlyArray<string>;
  executionPolicy?: WorkflowAssetExecutionPolicyRecord;
  outputContract?: JsonOutputContractRecord;
  guardrail?: GuardrailDefinitionRecord;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export const WorkflowAssetUsageRole = {
  Primary: "primary",
  Guardrail: "guardrail",
  Instruction: "instruction",
} as const;

export type WorkflowAssetUsageRole =
  (typeof WorkflowAssetUsageRole)[keyof typeof WorkflowAssetUsageRole];

export type WorkflowAssetUsageRecord = {
  assetId: string;
  workflowId: string;
  nodeId: string;
  nodeKind: WorkflowNodeKind;
  role: WorkflowAssetUsageRole;
  createdAt: string;
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

export type WorkflowAlertRecord = {
  id: string;
  level: "info" | "success" | "warn" | "error";
  source: "system" | "guardrail" | "provider" | "checkpoint";
  message: string;
  createdAt: string;
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
  reasoningLevel?: WorkflowReasoningLevel;
  temperature?: number;
  verbosity?: WorkflowVerbosity;
  usage?: WorkflowUsageTotalsRecord;
  alerts: ReadonlyArray<WorkflowAlertRecord>;
  guardrailFindings: ReadonlyArray<WorkflowGuardrailFindingRecord>;
  outputSnapshot?: unknown;
};

export type WorkflowExecutionRecord = {
  id: string;
  workflowId: string;
  triggerKind: WorkflowTriggerKind;
  status: WorkflowExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  warningsCount: number;
  errorsCount: number;
  totals: WorkflowUsageTotalsRecord;
  contextSessionId: string;
  nodeRuns: ReadonlyArray<WorkflowNodeExecutionRecord>;
};

export type WorkflowCatalogState = {
  definitions: ReadonlyArray<WorkflowDefinitionRecord>;
  definitionVersions?: ReadonlyArray<WorkflowDefinitionVersionRecord>;
  assets: ReadonlyArray<WorkflowAssetRecord>;
  assetUsages: ReadonlyArray<WorkflowAssetUsageRecord>;
  executions: ReadonlyArray<WorkflowExecutionRecord>;
};

export const createDefaultWorkflowCatalogState = (): WorkflowCatalogState => ({
  definitions: [],
  definitionVersions: [],
  assets: [],
  assetUsages: [],
  executions: [],
});

export const isWorkflowTriggerKindSupportedInMvp = (
  value: WorkflowTriggerKind,
): boolean => value === WorkflowTriggerKind.Manual;
