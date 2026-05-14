import {
  ProviderKind
} from "./settings-state.js";

export const WorkflowNodeKind = {
  TriggerManual: "trigger.manual",
  AssetPrompt: "asset.prompt",
  AssetInstruction: "asset.instruction",
  AssetGuardrail: "asset.guardrail",
  AiAgent: "ai.agent",
  AiProviderRun: "ai.provider-run",
  LogicCondition: "logic.condition",
  LogicMerge: "logic.merge",
  HumanReview: "human.review",
  TerminalResponse: "terminal.response"
} as const;

export type WorkflowNodeKind = typeof WorkflowNodeKind[keyof typeof WorkflowNodeKind];

export const WorkflowTriggerKind = {
  Manual: "manual"
} as const;

export type WorkflowTriggerKind = typeof WorkflowTriggerKind[keyof typeof WorkflowTriggerKind];

export const WorkflowRecordStatus = {
  Draft: "draft",
  Published: "published",
  Archived: "archived"
} as const;

export type WorkflowRecordStatus = typeof WorkflowRecordStatus[keyof typeof WorkflowRecordStatus];

export const WorkflowAssetKind = {
  Prompt: "prompt",
  Instruction: "instruction",
  Guardrail: "guardrail"
} as const;

export type WorkflowAssetKind = typeof WorkflowAssetKind[keyof typeof WorkflowAssetKind];

export const WorkflowAssetScope = {
  Workspace: "workspace",
  Project: "project"
} as const;

export type WorkflowAssetScope = typeof WorkflowAssetScope[keyof typeof WorkflowAssetScope];

export const WorkflowNodeRole = {
  Planner: "planner",
  Retriever: "retriever",
  Executor: "executor",
  Reviewer: "reviewer"
} as const;

export type WorkflowNodeRole = typeof WorkflowNodeRole[keyof typeof WorkflowNodeRole];

export const WorkflowReasoningLevel = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Max: "max"
} as const;

export type WorkflowReasoningLevel = typeof WorkflowReasoningLevel[keyof typeof WorkflowReasoningLevel];

export const WorkflowVerbosity = {
  Low: "low",
  Medium: "medium",
  High: "high"
} as const;

export type WorkflowVerbosity = typeof WorkflowVerbosity[keyof typeof WorkflowVerbosity];

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
  reviewPolicy?: {
    requireHumanDecision: boolean;
  };
};

export type WorkflowPortRecord = {
  id: string;
  name: string;
  acceptsMany: boolean;
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

export const WorkflowGuardrailSeverity = {
  Warn: "warn",
  Error: "error",
  Success: "success"
} as const;

export type WorkflowGuardrailSeverity =
  typeof WorkflowGuardrailSeverity[keyof typeof WorkflowGuardrailSeverity];

export const WorkflowGuardrailOperator = {
  All: "all",
  Any: "any"
} as const;

export type WorkflowGuardrailOperator =
  typeof WorkflowGuardrailOperator[keyof typeof WorkflowGuardrailOperator];

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
    kind: "node_output" | "context_value" | "literal";
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
  allowManualCheckpointResume: boolean;
};

export type WorkflowContextPolicyRecord = {
  language: string;
  carryMessagesLimit: number;
  carryArtifactLimit: number;
};

export type WorkflowDefinitionRecord = {
  id: string;
  workspaceId: string;
  projectId: string;
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
  defaultContextPolicy: WorkflowContextPolicyRecord;
  tags: ReadonlyArray<string>;
};

export type WorkflowAssetRecord = {
  id: string;
  workspaceId: string;
  projectId?: string;
  kind: WorkflowAssetKind;
  scope: WorkflowAssetScope;
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
  outputSnapshot?: unknown;
};

export type WorkflowExecutionRecord = {
  id: string;
  workflowId: string;
  projectId: string;
  triggerKind: WorkflowTriggerKind;
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

export type WorkflowDefinitionUpsertInput = Omit<
  WorkflowDefinitionRecord,
  "id" | "projectId" | "version" | "createdAt" | "updatedAt"
> & {
  id?: string;
};

export type WorkflowAssetUpsertInput = Omit<
  WorkflowAssetRecord,
  "id" | "projectId" | "version" | "createdAt" | "updatedAt"
> & {
  id?: string;
  projectId?: string;
};

const DefaultNodeWidth = 264;
const DefaultWorkflowViewport = {
  x: 96,
  y: 96,
  zoom: 1
} as const;

const DefaultNodeGridColumnWidth = 312;
const DefaultNodeGridRowHeight = 168;
const DefaultWorkflowLanguage = "en";
const DefaultWorkspaceId = "iteronix-workspace";
const DefaultReasoningLevel = WorkflowReasoningLevel.Medium;
const DefaultVerbosity = WorkflowVerbosity.Medium;
const DefaultTemperature = 0.2;
const GuardrailValidationLimit = 4;

export const readDefaultWorkflowWorkspaceId = (): string => DefaultWorkspaceId;

export const createEmptyWorkflowDefinition = (input: {
  workspaceId?: string;
  projectId: string;
  name: string;
}): WorkflowDefinitionUpsertInput => ({
  workspaceId: input.workspaceId ?? DefaultWorkspaceId,
  name: input.name.trim().length > 0 ? input.name.trim() : "Untitled workflow",
  description: "",
  status: WorkflowRecordStatus.Draft,
  trigger: {
    kind: WorkflowTriggerKind.Manual,
    enabled: true,
    config: {}
  },
  viewport: { ...DefaultWorkflowViewport },
  nodes: [
    createWorkflowNodeRecord(WorkflowNodeKind.TriggerManual, 0),
    createWorkflowNodeRecord(WorkflowNodeKind.TerminalResponse, 1)
  ],
  edges: [],
  executionPolicy: {
    maxNodeRetries: 1,
    allowManualCheckpointResume: true
  },
  defaultContextPolicy: {
    language: DefaultWorkflowLanguage,
    carryMessagesLimit: 8,
    carryArtifactLimit: 8
  },
  tags: []
});

export const createWorkflowAssetDraft = (input: {
  kind: WorkflowAssetKind;
  projectId: string;
  workspaceId?: string;
  name?: string;
  idFactory?: () => string;
  now?: () => string;
}): WorkflowAssetUpsertInput => {
  const now = input.now ?? (() => new Date().toISOString());
  const idFactory = input.idFactory ?? (() => crypto.randomUUID());
  const baseName = input.name?.trim() || readDefaultAssetName(input.kind);
  const timestamp = now();

  const draft: WorkflowAssetUpsertInput = {
    id: idFactory(),
    workspaceId: input.workspaceId ?? DefaultWorkspaceId,
    ...(input.kind === WorkflowAssetKind.Guardrail
      ? { projectId: input.projectId }
      : { projectId: input.projectId }),
    kind: input.kind,
    scope: WorkflowAssetScope.Project,
    name: baseName,
    slug: toSlug(baseName),
    description: "",
    body: readDefaultAssetBody(input.kind),
    language: DefaultWorkflowLanguage,
    tags: []
  };

  if (input.kind === WorkflowAssetKind.Prompt || input.kind === WorkflowAssetKind.Instruction) {
    draft.outputContract = createDefaultOutputContract(`${baseName} output`, idFactory);
  }

  if (input.kind === WorkflowAssetKind.Guardrail) {
    draft.guardrail = {
      id: idFactory(),
      severity: WorkflowGuardrailSeverity.Error,
      operator: WorkflowGuardrailOperator.All,
      validations: [
        {
          id: idFactory(),
          kind: "field_exists",
          target: "output",
          path: "$.result",
          message: "Expected $.result to be present."
        }
      ]
    };
  }

  void timestamp;
  return draft;
};

export const createWorkflowNodeRecord = (
  kind: WorkflowNodeKind,
  index: number,
  idFactory: () => string = () => crypto.randomUUID()
): WorkflowNodeRecord => {
  const template = readNodeTemplate(kind);

  return {
    id: idFactory(),
    kind,
    label: template.label,
    position: {
      x: 64 + (index % 3) * DefaultNodeGridColumnWidth,
      y: 64 + Math.floor(index / 3) * DefaultNodeGridRowHeight
    },
    width: DefaultNodeWidth,
    collapsed: false,
    config: template.config,
    inputPorts: template.inputPorts,
    outputPorts: template.outputPorts,
    attachedGuardrails: [],
    ...(template.outputContract ? { outputContract: template.outputContract } : {})
  };
};

export const addWorkflowNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  kind: WorkflowNodeKind,
  idFactory: () => string = () => crypto.randomUUID()
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: [
    ...definition.nodes,
    createWorkflowNodeRecord(kind, definition.nodes.length, idFactory)
  ]
});

export const moveWorkflowNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string,
  position: { x: number; y: number }
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: definition.nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          position: {
            x: Math.round(position.x),
            y: Math.round(position.y)
          }
        }
      : node
  )
});

export const updateWorkflowNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string,
  patch: Partial<WorkflowNodeRecord>
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: definition.nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          ...patch
        }
      : node
  )
});

export const removeWorkflowNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: definition.nodes.filter((node) => node.id !== nodeId),
  edges: definition.edges.filter(
    (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId
  )
});

export const removeWorkflowEdge = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  edgeId: string
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  edges: definition.edges.filter((edge) => edge.id !== edgeId)
});

export const attachGuardrailToNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string,
  assetId: string
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: definition.nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }

    if (node.attachedGuardrails.some((guardrail) => guardrail.assetId === assetId)) {
      return node;
    }

    return {
      ...node,
      attachedGuardrails: [
        ...node.attachedGuardrails,
        {
          assetId,
          order: node.attachedGuardrails.length,
          enabled: true
        }
      ]
    };
  })
});

export const detachGuardrailFromNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string,
  assetId: string
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: definition.nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          attachedGuardrails: node.attachedGuardrails
            .filter((guardrail) => guardrail.assetId !== assetId)
            .map((guardrail, index) => ({
              ...guardrail,
              order: index
            }))
        }
        : node
  )
});

export type JsonContractValidationResult = {
  valid: boolean;
  message: string;
};

export type GuardrailValidityResult = {
  valid: boolean;
  blocking: boolean;
  message: string;
};

export const updateWorkflowNodeOutputContract = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string,
  updater: (contract: JsonOutputContractRecord) => JsonOutputContractRecord
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: definition.nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          outputContract: updater(node.outputContract ?? createDefaultOutputContract(`${node.label} output`))
        }
      : node
  )
});

export const createWorkflowOutputContractField = (
  input: {
    name: string;
    type: JsonSchemaNodeRecord["type"];
    required: boolean;
  },
  rootSchema: JsonSchemaNodeRecord
): JsonSchemaNodeRecord => {
  const fieldName = input.name.trim();
  if (fieldName.length === 0) {
    return rootSchema;
  }

  const currentRequired = rootSchema.required ?? [];
  const nextRequired = input.required
    ? [...new Set([...currentRequired, fieldName])]
    : currentRequired.filter((entry) => entry !== fieldName);

  return {
    ...rootSchema,
    type: "object",
    properties: {
      ...(rootSchema.properties ?? {}),
      [fieldName]: {
        type: input.type,
        title: toTitle(fieldName)
      }
    },
    required: nextRequired
  };
};

export const readJsonContractValidation = (
  contract: JsonOutputContractRecord | null
): JsonContractValidationResult => {
  if (!contract) {
    return {
      valid: false,
      message: "No output contract is configured."
    };
  }

  if (contract.rootType !== "object" || contract.schema.type !== "object") {
    return {
      valid: false,
      message: "The contract root must be an object."
    };
  }

  const properties = contract.schema.properties ?? {};
  const missingRequired = (contract.schema.required ?? []).filter((fieldName) => !properties[fieldName]);
  if (missingRequired.length > 0) {
    return {
      valid: false,
      message: `Required fields missing from properties: ${missingRequired.join(", ")}.`
    };
  }

  return {
    valid: true,
    message: "Output contract is valid."
  };
};

export const addWorkflowEdgeMappingEntry = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  edgeId: string,
  entry: EdgeMappingEntryRecord
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  edges: definition.edges.map((edge) =>
    edge.id === edgeId
      ? {
          ...edge,
          mapping: {
            mode: "object",
            entries: [...edge.mapping.entries, entry]
          }
        }
      : edge
  )
});

export const updateWorkflowAssetGuardrail = (
  asset: WorkflowAssetRecord | WorkflowAssetUpsertInput,
  updater: (definition: GuardrailDefinitionRecord) => GuardrailDefinitionRecord
): WorkflowAssetUpsertInput => ({
  ...stripAssetPersistenceFields(asset),
  guardrail: updater(asset.guardrail ?? createDefaultGuardrailDefinition())
});

export const addWorkflowGuardrailValidation = (
  asset: WorkflowAssetRecord | WorkflowAssetUpsertInput,
  idFactory: () => string = () => crypto.randomUUID()
): WorkflowAssetUpsertInput => {
  const guardrail = asset.guardrail ?? createDefaultGuardrailDefinition(idFactory);
  if (guardrail.validations.length >= GuardrailValidationLimit) {
    return stripAssetPersistenceFields(asset);
  }

  return {
    ...stripAssetPersistenceFields(asset),
    guardrail: {
      ...guardrail,
      validations: [
        ...guardrail.validations,
        createDefaultGuardrailValidation(idFactory)
      ]
    }
  };
};

export const readGuardrailDefinitionValidity = (
  guardrail: GuardrailDefinitionRecord | null
): GuardrailValidityResult => {
  if (!guardrail) {
    return {
      valid: false,
      blocking: false,
      message: "No guardrail definition is configured."
    };
  }

  if (guardrail.validations.length === 0) {
    return {
      valid: false,
      blocking: guardrail.severity === WorkflowGuardrailSeverity.Error,
      message: guardrail.severity === WorkflowGuardrailSeverity.Error
        ? "Error guardrails need at least one validation before the node can be considered valid."
        : "Add at least one validation to make this guardrail actionable."
    };
  }

  if (guardrail.validations.length > GuardrailValidationLimit) {
    return {
      valid: false,
      blocking: guardrail.severity === WorkflowGuardrailSeverity.Error,
      message: `Guardrails support at most ${GuardrailValidationLimit.toString()} validations.`
    };
  }

  return {
    valid: true,
    blocking: false,
    message: guardrail.severity === WorkflowGuardrailSeverity.Error
      ? "Error severity blocks node validity only when a validation triggers."
      : "Warnings and success signals are permissive."
  };
};

export const connectWorkflowNodes = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  input: {
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
  },
  idFactory: () => string = () => crypto.randomUUID()
): WorkflowDefinitionUpsertInput => {
  if (input.sourceNodeId === input.targetNodeId) {
    return stripDefinitionVersionFields(definition);
  }

  if (definition.edges.some((edge) =>
    edge.sourceNodeId === input.sourceNodeId &&
    edge.sourcePortId === input.sourcePortId &&
    edge.targetNodeId === input.targetNodeId &&
    edge.targetPortId === input.targetPortId
  )) {
    return stripDefinitionVersionFields(definition);
  }

  const targetNode = definition.nodes.find((node) => node.id === input.targetNodeId);
  const targetPort = targetNode?.inputPorts.find((port) => port.id === input.targetPortId);
  const shouldReplaceExistingTargetConnection = targetPort?.acceptsMany === false;

  return {
    ...stripDefinitionVersionFields(definition),
    edges: [
      ...definition.edges.filter((edge) => {
        if (!shouldReplaceExistingTargetConnection) {
          return true;
        }

        return !(edge.targetNodeId === input.targetNodeId && edge.targetPortId === input.targetPortId);
      }),
      {
        id: idFactory(),
        sourceNodeId: input.sourceNodeId,
        sourcePortId: input.sourcePortId,
        targetNodeId: input.targetNodeId,
        targetPortId: input.targetPortId,
        mapping: {
          mode: "passthrough",
          entries: []
        }
      }
    ]
  };
};

export const setWorkflowViewport = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  viewport: WorkflowViewportRecord
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  viewport: {
    x: Math.round(viewport.x),
    y: Math.round(viewport.y),
    zoom: Math.max(0.35, Math.min(1.8, Number(viewport.zoom.toFixed(2))))
  }
});

export const updateWorkflowMetadata = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  patch: Partial<Pick<WorkflowDefinitionUpsertInput, "name" | "description" | "status" | "tags">>
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  ...(patch.name !== undefined ? { name: patch.name } : {}),
  ...(patch.description !== undefined ? { description: patch.description } : {}),
  ...(patch.status !== undefined ? { status: patch.status } : {}),
  ...(patch.tags !== undefined ? { tags: patch.tags } : {})
});

export const stripDefinitionVersionFields = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput
): WorkflowDefinitionUpsertInput => ({
  ...(definition.id ? { id: definition.id } : {}),
  workspaceId: definition.workspaceId,
  name: definition.name,
  description: definition.description,
  status: definition.status,
  trigger: definition.trigger,
  viewport: definition.viewport,
  nodes: definition.nodes,
  edges: definition.edges,
  executionPolicy: definition.executionPolicy,
  defaultContextPolicy: definition.defaultContextPolicy,
  tags: definition.tags
});

export const stripAssetPersistenceFields = (
  asset: WorkflowAssetRecord | WorkflowAssetUpsertInput
): WorkflowAssetUpsertInput => ({
  ...(asset.id ? { id: asset.id } : {}),
  workspaceId: asset.workspaceId,
  ...(asset.projectId ? { projectId: asset.projectId } : {}),
  kind: asset.kind,
  scope: asset.scope,
  name: asset.name,
  slug: asset.slug,
  description: asset.description,
  body: asset.body,
  language: asset.language,
  tags: asset.tags,
  ...(asset.outputContract ? { outputContract: asset.outputContract } : {}),
  ...(asset.guardrail ? { guardrail: asset.guardrail } : {}),
  ...(asset.archivedAt ? { archivedAt: asset.archivedAt } : {})
});

export const readNodeTemplate = (
  kind: WorkflowNodeKind
): {
  label: string;
  config: WorkflowNodeConfigRecord;
  inputPorts: ReadonlyArray<WorkflowPortRecord>;
  outputPorts: ReadonlyArray<WorkflowPortRecord>;
  outputContract?: JsonOutputContractRecord;
} => {
  if (kind === WorkflowNodeKind.TriggerManual) {
    return {
      label: "Manual trigger",
      config: {},
      inputPorts: [],
      outputPorts: [createPort("output", "Run", true)]
    };
  }

  if (kind === WorkflowNodeKind.AssetPrompt) {
    return {
      label: "Prompt",
      config: {},
      inputPorts: [createPort("input", "Context", true)],
      outputPorts: [createPort("output", "Prompt", true)],
      outputContract: createDefaultOutputContract("Prompt output")
    };
  }

  if (kind === WorkflowNodeKind.AssetInstruction) {
    return {
      label: "Instruction",
      config: {},
      inputPorts: [createPort("input", "Context", true)],
      outputPorts: [createPort("output", "Instruction", true)],
      outputContract: createDefaultOutputContract("Instruction output")
    };
  }

  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return {
      label: "Guardrail",
      config: {},
      inputPorts: [createPort("input", "Subject", true)],
      outputPorts: [createPort("output", "Validated", true)]
    };
  }

  if (kind === WorkflowNodeKind.AiAgent) {
    return {
      label: "Agent step",
      config: {
        role: WorkflowNodeRole.Planner,
        provider: createDefaultProviderSelection(),
        prompt: ""
      },
      inputPorts: [createPort("input", "Input", true)],
      outputPorts: [createPort("output", "Output", true)],
      outputContract: createDefaultOutputContract("Agent output")
    };
  }

  if (kind === WorkflowNodeKind.AiProviderRun) {
    return {
      label: "Provider run",
      config: {
        provider: createDefaultProviderSelection(),
        prompt: ""
      },
      inputPorts: [createPort("input", "Input", true)],
      outputPorts: [createPort("output", "Output", true)],
      outputContract: createDefaultOutputContract("Provider output")
    };
  }

  if (kind === WorkflowNodeKind.LogicCondition) {
    return {
      label: "Condition",
      config: {},
      inputPorts: [createPort("input", "Input", true)],
      outputPorts: [
        createPort("true", "True", true),
        createPort("false", "False", true)
      ]
    };
  }

  if (kind === WorkflowNodeKind.LogicMerge) {
    return {
      label: "Merge",
      config: {},
      inputPorts: [
        createPort("input-a", "Input A", true),
        createPort("input-b", "Input B", true)
      ],
      outputPorts: [createPort("output", "Merged", true)]
    };
  }

  if (kind === WorkflowNodeKind.HumanReview) {
    return {
      label: "Human review",
      config: {
        reviewPolicy: {
          requireHumanDecision: true
        }
      },
      inputPorts: [createPort("input", "Input", true)],
      outputPorts: [
        createPort("approved", "Approved", true),
        createPort("changes", "Changes", true)
      ]
    };
  }

  return {
    label: "Response",
    config: {},
    inputPorts: [createPort("input", "Input", true)],
    outputPorts: []
  };
};

export const readNodeAccentClassName = (kind: WorkflowNodeKind): string => {
  if (kind === WorkflowNodeKind.TriggerManual) {
    return "bg-emerald-500";
  }

  if (kind === WorkflowNodeKind.AssetPrompt || kind === WorkflowNodeKind.AssetInstruction) {
    return "bg-cyan-500";
  }

  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return "bg-amber-500";
  }

  if (kind === WorkflowNodeKind.AiAgent || kind === WorkflowNodeKind.AiProviderRun) {
    return "bg-primary";
  }

  if (kind === WorkflowNodeKind.HumanReview) {
    return "bg-violet-500";
  }

  if (kind === WorkflowNodeKind.TerminalResponse) {
    return "bg-emerald-400";
  }

  return "bg-slate-500";
};

export const readNodeIcon = (kind: WorkflowNodeKind): string => {
  if (kind === WorkflowNodeKind.TriggerManual) {
    return "play_circle";
  }

  if (kind === WorkflowNodeKind.AssetPrompt) {
    return "chat";
  }

  if (kind === WorkflowNodeKind.AssetInstruction) {
    return "article";
  }

  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return "gavel";
  }

  if (kind === WorkflowNodeKind.AiAgent) {
    return "smart_toy";
  }

  if (kind === WorkflowNodeKind.AiProviderRun) {
    return "psychology";
  }

  if (kind === WorkflowNodeKind.LogicCondition) {
    return "alt_route";
  }

  if (kind === WorkflowNodeKind.LogicMerge) {
    return "call_merge";
  }

  if (kind === WorkflowNodeKind.HumanReview) {
    return "fact_check";
  }

  return "output";
};

export const readNodeKindLabel = (kind: WorkflowNodeKind): string => {
  if (kind === WorkflowNodeKind.TriggerManual) {
    return "Manual trigger";
  }

  if (kind === WorkflowNodeKind.AssetPrompt) {
    return "Prompt asset";
  }

  if (kind === WorkflowNodeKind.AssetInstruction) {
    return "Instruction asset";
  }

  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return "Guardrail asset";
  }

  if (kind === WorkflowNodeKind.AiAgent) {
    return "Agent step";
  }

  if (kind === WorkflowNodeKind.AiProviderRun) {
    return "Provider run";
  }

  if (kind === WorkflowNodeKind.LogicCondition) {
    return "Condition";
  }

  if (kind === WorkflowNodeKind.LogicMerge) {
    return "Merge";
  }

  if (kind === WorkflowNodeKind.HumanReview) {
    return "Human review";
  }

  return "Terminal response";
};

export const readAssetKindLabel = (kind: WorkflowAssetKind): string => {
  if (kind === WorkflowAssetKind.Prompt) {
    return "Prompt";
  }

  if (kind === WorkflowAssetKind.Instruction) {
    return "Instruction";
  }

  return "Guardrail";
};

export const readAssetScopeLabel = (scope: WorkflowAssetScope): string =>
  scope === WorkflowAssetScope.Workspace ? "Workspace" : "Project";

export const readNodeAssetKind = (kind: WorkflowNodeKind): WorkflowAssetKind | null => {
  if (kind === WorkflowNodeKind.AssetPrompt) {
    return WorkflowAssetKind.Prompt;
  }

  if (kind === WorkflowNodeKind.AssetInstruction) {
    return WorkflowAssetKind.Instruction;
  }

  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return WorkflowAssetKind.Guardrail;
  }

  return null;
};

export const readNodeKindsForPalette = (): ReadonlyArray<WorkflowNodeKind> => [
  WorkflowNodeKind.TriggerManual,
  WorkflowNodeKind.AssetPrompt,
  WorkflowNodeKind.AssetInstruction,
  WorkflowNodeKind.AiAgent,
  WorkflowNodeKind.AiProviderRun,
  WorkflowNodeKind.AssetGuardrail,
  WorkflowNodeKind.LogicCondition,
  WorkflowNodeKind.LogicMerge,
  WorkflowNodeKind.HumanReview,
  WorkflowNodeKind.TerminalResponse
];

const createPort = (
  id: string,
  name: string,
  acceptsMany: boolean
): WorkflowPortRecord => ({
  id,
  name,
  acceptsMany
});

const createDefaultOutputContract = (
  name: string,
  idFactory: () => string = () => crypto.randomUUID()
): JsonOutputContractRecord => ({
  id: idFactory(),
  name,
  schemaVersion: 1,
  rootType: "object",
  schema: {
    type: "object",
    required: ["result"],
    properties: {
      result: {
        type: "string",
        title: "Result"
      }
    }
  },
  sampleOutput: "{\n  \"result\": \"\"\n}"
});

const createDefaultGuardrailDefinition = (
  idFactory: () => string = () => crypto.randomUUID()
): GuardrailDefinitionRecord => ({
  id: idFactory(),
  severity: WorkflowGuardrailSeverity.Error,
  operator: WorkflowGuardrailOperator.All,
  validations: []
});

const createDefaultGuardrailValidation = (
  idFactory: () => string = () => crypto.randomUUID()
): GuardrailValidationRecord => ({
  id: idFactory(),
  kind: "field_exists",
  target: "output",
  path: "$.result",
  message: "Expected $.result to be present."
});

const createDefaultProviderSelection = (): WorkflowProviderSelectionRecord => ({
  providerId: ProviderKind.CodexCli,
  modelId: "",
  reasoningLevel: DefaultReasoningLevel,
  temperature: DefaultTemperature,
  verbosity: DefaultVerbosity,
  testStatus: "unknown"
});

const readDefaultAssetName = (kind: WorkflowAssetKind): string => {
  if (kind === WorkflowAssetKind.Prompt) {
    return "Prompt asset";
  }

  if (kind === WorkflowAssetKind.Instruction) {
    return "Instruction asset";
  }

  return "Guardrail asset";
};

const readDefaultAssetBody = (kind: WorkflowAssetKind): string => {
  if (kind === WorkflowAssetKind.Prompt) {
    return "Describe the task and the expected output in English.";
  }

  if (kind === WorkflowAssetKind.Instruction) {
    return "Apply the workflow step instructions and keep the output grounded.";
  }

  return "Validate the node output before continuing.";
};

const toSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toTitle = (value: string): string =>
  value
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
