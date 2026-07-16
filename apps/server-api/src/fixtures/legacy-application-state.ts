import {
  WorkflowAssetKind,
  WorkflowAssetScope,
  WorkflowAssetUsageRole,
  WorkflowExecutionStatus,
  WorkflowGuardrailOperator,
  WorkflowGuardrailSeverity,
  WorkflowNodeKind,
  WorkflowNodeRole,
  WorkflowReasoningLevel,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
  WorkflowVerbosity,
  type GuardrailDefinitionRecord,
  type JsonOutputContractRecord,
  type WorkflowAssetRecord,
  type WorkflowAssetUsageRecord,
  type WorkflowDefinitionRecord,
  type WorkflowDefinitionVersionRecord,
  type WorkflowEdgeRecord,
  type WorkflowExecutionRecord,
  type WorkflowNodeExecutionRecord,
  type WorkflowNodeRecord,
} from "../../../../packages/shared/src/workflows";

const Timestamp = "2026-07-16T10:00:00.000Z";
const WorkflowId = "workflow-1";
const WorkflowAssetId = "asset-1";

const outputContract: JsonOutputContractRecord = {
  id: "contract-1",
  name: "Workflow response",
  schemaVersion: 1,
  rootType: "object",
  schema: {
    type: "object",
    required: ["result"],
    properties: {
      result: { type: "string" },
    },
  },
  sampleOutput: '{"result":"complete"}',
};

const guardrail: GuardrailDefinitionRecord = {
  id: "guardrail-1",
  severity: WorkflowGuardrailSeverity.Warn,
  operator: WorkflowGuardrailOperator.All,
  validations: [
    {
      id: "validation-1",
      kind: "field_exists",
      target: "output",
      path: "$.result",
      message: "A result is required.",
    },
  ],
};

const triggerNode: WorkflowNodeRecord = {
  id: "node-1",
  kind: WorkflowNodeKind.TriggerManual,
  label: "Start",
  position: { x: 0, y: 0 },
  width: 240,
  collapsed: false,
  config: {},
  inputPorts: [],
  outputPorts: [{ id: "output", name: "Output", acceptsMany: false }],
  attachedGuardrails: [],
};

const promptNode: WorkflowNodeRecord = {
  id: "node-2",
  kind: WorkflowNodeKind.AssetPrompt,
  label: "Generate response",
  position: { x: 320, y: 0 },
  width: 240,
  collapsed: false,
  config: {
    assetId: WorkflowAssetId,
    role: WorkflowNodeRole.Executor,
    provider: {
      providerId: "openai",
      modelId: "gpt-5.6-terra",
      reasoningLevel: WorkflowReasoningLevel.Medium,
      temperature: 0,
      verbosity: WorkflowVerbosity.Low,
      testStatus: "passed",
      testedAt: Timestamp,
    },
    prompt: "Return a result.",
    pinnedTestOutput: {
      outputSnapshot: { result: "complete" },
      updatedAt: Timestamp,
    },
    pinnedTestOutputs: [
      {
        id: "pinned-output-1",
        name: "Complete response",
        outputSnapshot: { result: "complete" },
        updatedAt: Timestamp,
      },
    ],
    defaultPinnedTestOutputId: "pinned-output-1",
    reviewPolicy: { requireHumanDecision: false },
  },
  inputPorts: [{ id: "input", name: "Input", acceptsMany: false }],
  outputPorts: [{ id: "output", name: "Output", acceptsMany: false }],
  attachedGuardrails: [{ assetId: WorkflowAssetId, order: 0, enabled: true }],
  outputContract,
};

const edge: WorkflowEdgeRecord = {
  id: "edge-1",
  sourceNodeId: triggerNode.id,
  sourcePortId: "output",
  targetNodeId: promptNode.id,
  targetPortId: "input",
  mapping: {
    mode: "object",
    entries: [
      {
        targetPath: "$.input",
        source: {
          kind: "node_output",
          nodeId: triggerNode.id,
          path: "$.result",
        },
      },
    ],
  },
};

const definition: WorkflowDefinitionRecord = {
  id: WorkflowId,
  name: "Legacy workflow",
  description: "Representative persisted workflow.",
  status: WorkflowRecordStatus.Draft,
  version: 1,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  trigger: {
    kind: WorkflowTriggerKind.Manual,
    enabled: true,
    config: {},
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [triggerNode, promptNode],
  edges: [edge],
  executionPolicy: {
    maxNodeRetries: 1,
    allowManualCheckpointResume: true,
  },
  runtimeSettingsOverride: { maxLoops: 5, soundEnabled: true },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 8,
    carryArtifactLimit: 8,
  },
  tags: ["legacy"],
};

const definitionVersion: WorkflowDefinitionVersionRecord = {
  id: "version-1",
  workflowId: WorkflowId,
  version: 1,
  createdAt: Timestamp,
  snapshot: definition,
  checksum: "workflow-version-checksum",
  author: "migration",
  note: "Representative legacy workflow.",
  tags: ["legacy"],
  changeType: "import",
  changeSummary: "Imported legacy workflow.",
};

const asset: WorkflowAssetRecord = {
  id: WorkflowAssetId,
  kind: WorkflowAssetKind.Prompt,
  scope: WorkflowAssetScope.Global,
  name: "Legacy asset",
  slug: "legacy-asset",
  description: "Representative prompt asset.",
  body: "Prompt",
  language: "en",
  version: 1,
  tags: ["legacy"],
  executionPolicy: { maxRetries: 1, timeoutMs: 1000 },
  outputContract,
  guardrail,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  archivedAt: Timestamp,
};

const assetUsage: WorkflowAssetUsageRecord = {
  assetId: WorkflowAssetId,
  workflowId: WorkflowId,
  nodeId: promptNode.id,
  nodeKind: WorkflowNodeKind.AssetPrompt,
  role: WorkflowAssetUsageRole.Primary,
  createdAt: Timestamp,
};

const nodeRun: WorkflowNodeExecutionRecord = {
  id: "node-run-1",
  nodeId: promptNode.id,
  nodeKind: WorkflowNodeKind.AssetPrompt,
  status: "completed",
  startedAt: Timestamp,
  finishedAt: Timestamp,
  durationMs: 10,
  providerId: "openai",
  modelId: "gpt-5.6-terra",
  reasoningLevel: WorkflowReasoningLevel.Medium,
  temperature: 0,
  verbosity: WorkflowVerbosity.Low,
  usage: {
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    estimatedCostEur: 0,
    estimatedCostSourceCurrency: "EUR",
    estimatedCostSourceValue: 0,
    exchangeRateEur: 1,
    latencyMs: 10,
  },
  alerts: [
    {
      id: "alert-1",
      level: "info",
      source: "provider",
      message: "Provider completed.",
      createdAt: Timestamp,
    },
  ],
  guardrailFindings: [
    {
      guardrailAssetId: WorkflowAssetId,
      nodeId: promptNode.id,
      severity: WorkflowGuardrailSeverity.Success,
      message: "Guardrail passed.",
    },
  ],
  outputSnapshot: { result: "complete" },
};

const execution: WorkflowExecutionRecord = {
  id: "execution-1",
  workflowId: WorkflowId,
  triggerKind: WorkflowTriggerKind.Manual,
  status: WorkflowExecutionStatus.Completed,
  startedAt: Timestamp,
  finishedAt: Timestamp,
  durationMs: 10,
  warningsCount: 0,
  errorsCount: 0,
  totals: {
    promptTokens: 1,
    completionTokens: 1,
    totalTokens: 2,
    estimatedCostEur: 0,
    latencyMs: 10,
  },
  contextSessionId: "session-1",
  nodeRuns: [nodeRun],
};

export const legacyApplicationStateFixture: unknown = {
  workspace: {
    version: 1,
    revision: 7,
    createdAt: "2026-07-16T09:00:00.000Z",
    updatedAt: "2026-07-16T11:00:00.000Z",
    settings: {
      profileId: "default",
      providerProfiles: [
        {
          id: "openai",
          providerKind: "openai",
          apiKey: "plaintext-secret",
          apiKeyEnvVar: "OPENAI_API_KEY",
          accessToken: "access-token-secret",
          refreshToken: "refresh-token-secret",
          clientSecret: "client-secret-value",
          webhookToken: "webhook-token-secret",
        },
      ],
      workflowLimits: {
        infiniteLoops: false,
        maxLoops: 5,
        externalCalls: true,
      },
      notifications: {
        soundEnabled: true,
        webhookUrl: "https://example.test/hook",
      },
    },
    providerSelections: [
      { profileId: "default", providerId: "openai", updatedAt: Timestamp },
    ],
    providerSettings: [
      {
        profileId: "default",
        providerId: "openai",
        config: {
          apiKeyEnvVar: "OPENAI_API_KEY",
          token: "plaintext-secret",
          accessToken: "access-token-secret",
          refreshToken: "refresh-token-secret",
          clientSecret: "client-secret-value",
          webhookToken: "webhook-token-secret",
        },
        updatedAt: Timestamp,
      },
    ],
    externalApiKeys: [
      {
        id: "key-1",
        name: "Partner",
        scope: { kind: "selected_workflows", workflowIds: [WorkflowId] },
        secretHash: "hashed-external-api-key",
        createdAt: "2026-07-16T09:00:00.000Z",
        revokedAt: Timestamp,
      },
    ],
    workflows: {
      definitions: [definition],
      definitionVersions: [definitionVersion],
      assets: [{ ...asset, scope: "workspace" }],
      assetUsages: [assetUsage],
      executions: [execution],
    },
  },
};
