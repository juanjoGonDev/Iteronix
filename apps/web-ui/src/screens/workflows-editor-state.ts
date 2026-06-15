import { ProviderKind } from "./settings-state.js";

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
  TerminalResponse: "terminal.response",
} as const;

export type WorkflowNodeKind =
  (typeof WorkflowNodeKind)[keyof typeof WorkflowNodeKind];

const WorkflowTriggerKind = {
  Manual: "manual",
} as const;

type WorkflowTriggerKind =
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
  Workspace: "workspace",
  Project: "project",
} as const;

export type WorkflowAssetScope =
  (typeof WorkflowAssetScope)[keyof typeof WorkflowAssetScope];

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

type WorkflowNodeConfigRecord = {
  assetId?: string;
  role?: WorkflowNodeRole;
  provider?: WorkflowProviderSelectionRecord;
  prompt?: string;
  reviewPolicy?: {
    requireHumanDecision: boolean;
  };
};

type WorkflowPortRecord = {
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

type AttachedGuardrailRecord = {
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
  format?: "email" | "url" | "uuid" | "nif";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
};

export const JsonSchemaItemsSegment = "$items" as const;

export type JsonContractProviderSchemaRecord =
  | {
      t: "o";
      p?: Readonly<
        Record<string, JsonContractProviderSchemaRecord & { r?: 1 }>
      >;
      n?: 1;
    }
  | {
      t: "a";
      i: JsonContractProviderSchemaRecord;
      min?: number;
      max?: number;
      n?: 1;
    }
  | {
      t: "s" | "n" | "i" | "b";
      f?: "email" | "url" | "uuid" | "nif";
      min?: number;
      max?: number;
      re?: string;
      e?: ReadonlyArray<string>;
      n?: 1;
      r?: 1;
    };

export type JsonContractCompiledSchema = {
  zodExpression: string;
  safeParse: (value: unknown) =>
    | {
        success: true;
        data: unknown;
      }
    | {
        success: false;
        error: {
          issues: ReadonlyArray<string>;
        };
      };
};

export type JsonOutputContractRecord = {
  id: string;
  name: string;
  schemaVersion: 1;
  rootType: "object";
  schema: JsonSchemaNodeRecord;
  sampleOutput?: string;
};

export const WorkflowExpressionSegmentKind = {
  Text: "text",
  Variable: "variable",
} as const;

export type WorkflowExpressionSegmentKind =
  (typeof WorkflowExpressionSegmentKind)[keyof typeof WorkflowExpressionSegmentKind];

export const WorkflowExpressionVariableKind = {
  NodeOutput: "node_output",
  CurrentInput: "current_input",
  WorkflowContext: "workflow_context",
  AssetOutput: "asset_output",
} as const;

export type WorkflowExpressionVariableKind =
  (typeof WorkflowExpressionVariableKind)[keyof typeof WorkflowExpressionVariableKind];

export type WorkflowExpressionVariableReference = {
  kind: WorkflowExpressionVariableKind;
  sourceId?: string;
  path: string;
};

export type WorkflowExpressionSegmentRecord =
  | {
      kind: typeof WorkflowExpressionSegmentKind.Text;
      value: string;
    }
  | {
      kind: typeof WorkflowExpressionSegmentKind.Variable;
      reference: WorkflowExpressionVariableReference;
    };

export type WorkflowExpressionRecord = {
  segments: ReadonlyArray<WorkflowExpressionSegmentRecord>;
};

export type WorkflowExpressionInsertionResult = {
  expression: WorkflowExpressionRecord;
  value: string;
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

type EdgeMappingRecord = {
  mode: "passthrough" | "object" | "template";
  entries: ReadonlyArray<EdgeMappingEntryRecord>;
};

type WorkflowEdgeRecord = {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  mapping: EdgeMappingRecord;
};

type WorkflowTriggerRecord = {
  kind: WorkflowTriggerKind;
  enabled: boolean;
  config: Record<string, unknown>;
};

export type WorkflowViewportRecord = {
  x: number;
  y: number;
  zoom: number;
};

type WorkflowExecutionPolicyRecord = {
  maxNodeRetries: number;
  allowManualCheckpointResume: boolean;
};

type WorkflowContextPolicyRecord = {
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

export type WorkflowGuardrailFindingRecord = {
  guardrailAssetId: string;
  nodeId: string;
  severity: "warn" | "error" | "success";
  message: string;
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
  zoom: 1,
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
    config: {},
  },
  viewport: { ...DefaultWorkflowViewport },
  nodes: [
    createWorkflowNodeRecord(WorkflowNodeKind.TriggerManual, 0),
    createWorkflowNodeRecord(WorkflowNodeKind.TerminalResponse, 1),
  ],
  edges: [],
  executionPolicy: {
    maxNodeRetries: 1,
    allowManualCheckpointResume: true,
  },
  defaultContextPolicy: {
    language: DefaultWorkflowLanguage,
    carryMessagesLimit: 8,
    carryArtifactLimit: 8,
  },
  tags: [],
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
    tags: [],
  };

  if (
    input.kind === WorkflowAssetKind.Prompt ||
    input.kind === WorkflowAssetKind.Instruction
  ) {
    draft.outputContract = createDefaultOutputContract(
      `${baseName} output`,
      idFactory,
    );
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
          message: "Expected $.result to be present.",
        },
      ],
    };
  }

  void timestamp;
  return draft;
};

const createWorkflowNodeRecord = (
  kind: WorkflowNodeKind,
  index: number,
  idFactory: () => string = () => crypto.randomUUID(),
): WorkflowNodeRecord => {
  const template = readNodeTemplate(kind);

  return {
    id: idFactory(),
    kind,
    label: template.label,
    position: {
      x: 64 + (index % 3) * DefaultNodeGridColumnWidth,
      y: 64 + Math.floor(index / 3) * DefaultNodeGridRowHeight,
    },
    width: DefaultNodeWidth,
    collapsed: false,
    config: template.config,
    inputPorts: template.inputPorts,
    outputPorts: template.outputPorts,
    attachedGuardrails: [],
    ...(template.outputContract
      ? { outputContract: template.outputContract }
      : {}),
  };
};

export const addWorkflowNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  kind: WorkflowNodeKind,
  idFactory: () => string = () => crypto.randomUUID(),
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: [
    ...definition.nodes,
    createWorkflowNodeRecord(kind, definition.nodes.length, idFactory),
  ],
});

export const moveWorkflowNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string,
  position: { x: number; y: number },
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: definition.nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          position: {
            x: Math.round(position.x),
            y: Math.round(position.y),
          },
        }
      : node,
  ),
});

export const removeWorkflowNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string,
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: definition.nodes.filter((node) => node.id !== nodeId),
  edges: definition.edges.filter(
    (edge) => edge.sourceNodeId !== nodeId && edge.targetNodeId !== nodeId,
  ),
});

export const removeWorkflowEdge = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  edgeId: string,
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  edges: definition.edges.filter((edge) => edge.id !== edgeId),
});

export const attachGuardrailToNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string,
  assetId: string,
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: definition.nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }

    if (
      node.attachedGuardrails.some((guardrail) => guardrail.assetId === assetId)
    ) {
      return node;
    }

    return {
      ...node,
      attachedGuardrails: [
        ...node.attachedGuardrails,
        {
          assetId,
          order: node.attachedGuardrails.length,
          enabled: true,
        },
      ],
    };
  }),
});

export const detachGuardrailFromNode = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string,
  assetId: string,
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
              order: index,
            })),
        }
      : node,
  ),
});

export type JsonContractValidationResult = {
  valid: boolean;
  message: string;
};

export type JsonOutputContractDocumentResult =
  | {
      success: true;
      contract: JsonOutputContractRecord;
    }
  | {
      success: false;
      error: string;
    };

export type GuardrailValidityResult = {
  valid: boolean;
  blocking: boolean;
  message: string;
};

export const updateWorkflowNodeOutputContract = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  nodeId: string,
  updater: (contract: JsonOutputContractRecord) => JsonOutputContractRecord,
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  nodes: definition.nodes.map((node) =>
    node.id === nodeId
      ? {
          ...node,
          outputContract: updater(
            node.outputContract ??
              createDefaultOutputContract(`${node.label} output`),
          ),
        }
      : node,
  ),
});

export const createWorkflowOutputContractField = (
  input: {
    name: string;
    type: JsonSchemaNodeRecord["type"];
    required: boolean;
  },
  rootSchema: JsonSchemaNodeRecord,
): JsonSchemaNodeRecord => {
  const fieldName = input.name.trim();
  if (fieldName.length === 0) {
    return rootSchema;
  }

  return upsertJsonSchemaProperty(rootSchema, [], {
    name: fieldName,
    required: input.required,
    node: {
      ...createJsonSchemaNode(input.type),
      title: toTitle(fieldName),
    },
  });
};

export const readJsonContractValidation = (
  contract: JsonOutputContractRecord | null,
): JsonContractValidationResult => {
  if (!contract) {
    return {
      valid: false,
      message: "No output contract is configured.",
    };
  }

  if (contract.rootType !== "object" || contract.schema.type !== "object") {
    return {
      valid: false,
      message: "The contract root must be an object.",
    };
  }

  const issues = readJsonSchemaIssues(contract.schema, "$");
  if (issues.length > 0) {
    return {
      valid: false,
      message: issues[0] ?? "The JSON contract is invalid.",
    };
  }

  return {
    valid: true,
    message: "Output contract is valid.",
  };
};

export const createJsonSchemaNode = (
  type: JsonSchemaNodeRecord["type"],
): JsonSchemaNodeRecord => {
  if (type === "object") {
    return {
      type,
      properties: {},
      required: [],
    };
  }

  if (type === "array") {
    return {
      type,
      items: createJsonSchemaNode("string"),
    };
  }

  return {
    type,
  };
};

export const upsertJsonSchemaProperty = (
  rootSchema: JsonSchemaNodeRecord,
  parentPath: ReadonlyArray<string>,
  input: {
    name: string;
    node: JsonSchemaNodeRecord;
    required: boolean;
  },
): JsonSchemaNodeRecord => {
  const fieldName = input.name.trim();
  if (fieldName.length === 0) {
    return rootSchema;
  }

  return updateJsonSchemaNode(rootSchema, parentPath, (parentNode) => {
    const normalizedParent =
      parentNode.type === "object"
        ? parentNode
        : createJsonSchemaNode("object");
    const nextRequired = input.required
      ? appendUniqueString(normalizedParent.required, fieldName)
      : removeStringEntry(normalizedParent.required, fieldName);

    return {
      ...normalizedParent,
      properties: {
        ...(normalizedParent.properties ?? {}),
        [fieldName]: cloneJsonSchemaNode(input.node),
      },
      required: nextRequired,
    };
  });
};

export const renameJsonSchemaProperty = (
  rootSchema: JsonSchemaNodeRecord,
  parentPath: ReadonlyArray<string>,
  previousName: string,
  nextName: string,
): JsonSchemaNodeRecord => {
  const previousKey = previousName.trim();
  const nextKey = nextName.trim();
  if (
    previousKey.length === 0 ||
    nextKey.length === 0 ||
    previousKey === nextKey
  ) {
    return rootSchema;
  }

  return updateJsonSchemaNode(rootSchema, parentPath, (parentNode) => {
    if (parentNode.type !== "object") {
      return parentNode;
    }

    const currentProperty = parentNode.properties?.[previousKey];
    if (!currentProperty) {
      return parentNode;
    }

    const nextProperties = { ...(parentNode.properties ?? {}) };
    delete nextProperties[previousKey];
    nextProperties[nextKey] = cloneJsonSchemaNode(currentProperty);

    const required = parentNode.required ?? [];
    const nextRequired = required.includes(previousKey)
      ? appendUniqueString(removeStringEntry(required, previousKey), nextKey)
      : removeStringEntry(required, previousKey);

    return {
      ...parentNode,
      properties: nextProperties,
      required: nextRequired,
    };
  });
};

export const removeJsonSchemaProperty = (
  rootSchema: JsonSchemaNodeRecord,
  parentPath: ReadonlyArray<string>,
  propertyName: string,
): JsonSchemaNodeRecord =>
  updateJsonSchemaNode(rootSchema, parentPath, (parentNode) => {
    if (parentNode.type !== "object") {
      return parentNode;
    }

    const fieldName = propertyName.trim();
    if (!parentNode.properties?.[fieldName]) {
      return parentNode;
    }

    const nextProperties = { ...(parentNode.properties ?? {}) };
    delete nextProperties[fieldName];

    return {
      ...parentNode,
      properties: nextProperties,
      required: removeStringEntry(parentNode.required, fieldName),
    };
  });

export const updateJsonSchemaNode = (
  rootSchema: JsonSchemaNodeRecord,
  path: ReadonlyArray<string>,
  updater: (node: JsonSchemaNodeRecord) => JsonSchemaNodeRecord,
): JsonSchemaNodeRecord =>
  updateJsonSchemaNodeAtPath(rootSchema, path, updater);

export const readJsonSchemaPaths = (
  schema: JsonSchemaNodeRecord,
): ReadonlyArray<string> => {
  const paths = readJsonSchemaNodePaths(schema, "$");
  return paths.length > 0 ? paths : ["$"];
};

export const compileJsonContractSchema = (
  contract: JsonOutputContractRecord,
): JsonContractCompiledSchema => {
  const issues = readJsonSchemaIssues(contract.schema, "$");
  if (issues.length > 0) {
    throw new Error(issues.join(" "));
  }

  return {
    zodExpression: buildJsonSchemaZodExpression(contract.schema),
    safeParse: (value: unknown) => {
      const runtimeIssues = validateJsonSchemaValue(
        contract.schema,
        value,
        "$",
      );
      if (runtimeIssues.length > 0) {
        return {
          success: false,
          error: {
            issues: runtimeIssues,
          },
        };
      }

      return {
        success: true,
        data: value,
      };
    },
  };
};

export const safeParseJsonContractValue = (
  contract: JsonOutputContractRecord,
  value: unknown,
): ReturnType<JsonContractCompiledSchema["safeParse"]> =>
  compileJsonContractSchema(contract).safeParse(value);

export const serializeJsonContractForProvider = (
  contract: JsonOutputContractRecord,
): JsonContractProviderSchemaRecord => serializeJsonSchemaNode(contract.schema);

export const formatJsonOutputContractDocument = (
  contract: JsonOutputContractRecord,
): string =>
  JSON.stringify(
    {
      name: contract.name,
      schemaVersion: contract.schemaVersion,
      rootType: contract.rootType,
      schema: contract.schema,
      ...(contract.sampleOutput !== undefined
        ? { sampleOutput: contract.sampleOutput }
        : {}),
    },
    null,
    2,
  );

export const parseJsonOutputContractDocument = (
  input: string,
  current: JsonOutputContractRecord,
): JsonOutputContractDocumentResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return {
      success: false,
      error: "Raw JSON is not valid JSON.",
    };
  }

  if (!isRecordValue(parsed)) {
    return {
      success: false,
      error: "Raw JSON must describe an object contract document.",
    };
  }

  const name =
    typeof parsed["name"] === "string" && parsed["name"].trim().length > 0
      ? parsed["name"].trim()
      : current.name;
  const schemaVersion =
    parsed["schemaVersion"] === 1 ? 1 : current.schemaVersion;
  const rootType =
    parsed["rootType"] === "object" ? "object" : current.rootType;
  const schemaValue = readJsonSchemaNodeDocument(parsed["schema"]);
  if (!schemaValue) {
    return {
      success: false,
      error: "Raw JSON schema uses unsupported fields or types.",
    };
  }

  const contract = {
    ...current,
    name,
    schemaVersion,
    rootType,
    schema: schemaValue,
    ...(typeof parsed["sampleOutput"] === "string"
      ? { sampleOutput: parsed["sampleOutput"] }
      : current.sampleOutput !== undefined
        ? { sampleOutput: current.sampleOutput }
        : {}),
  } satisfies JsonOutputContractRecord;
  const validation = readJsonContractValidation(contract);

  return validation.valid
    ? {
        success: true,
        contract,
      }
    : {
        success: false,
        error: validation.message,
      };
};

export const serializeWorkflowExpression = (
  expression: WorkflowExpressionRecord,
): string =>
  expression.segments
    .map((segment) =>
      segment.kind === WorkflowExpressionSegmentKind.Text
        ? segment.value
        : buildWorkflowExpressionToken(segment.reference),
    )
    .join("");

export const parseWorkflowExpression = (
  value: string,
): WorkflowExpressionRecord => ({
  segments: splitWorkflowExpressionSegments(value),
});

export const insertWorkflowExpressionVariable = (input: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  reference: WorkflowExpressionVariableReference;
}): WorkflowExpressionInsertionResult => {
  const start = Math.max(0, Math.min(input.selectionStart, input.value.length));
  const end = Math.max(start, Math.min(input.selectionEnd, input.value.length));
  const token = buildWorkflowExpressionToken(input.reference);
  const nextValue = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;

  return {
    expression: parseWorkflowExpression(nextValue),
    value: nextValue,
  };
};

export const addWorkflowEdgeMappingEntry = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  edgeId: string,
  entry: EdgeMappingEntryRecord,
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  edges: definition.edges.map((edge) =>
    edge.id === edgeId
      ? {
          ...edge,
          mapping: {
            mode: "object",
            entries: [...edge.mapping.entries, entry],
          },
        }
      : edge,
  ),
});

export const updateWorkflowAssetGuardrail = (
  asset: WorkflowAssetRecord | WorkflowAssetUpsertInput,
  updater: (definition: GuardrailDefinitionRecord) => GuardrailDefinitionRecord,
): WorkflowAssetUpsertInput => ({
  ...stripAssetPersistenceFields(asset),
  guardrail: updater(asset.guardrail ?? createDefaultGuardrailDefinition()),
});

export const addWorkflowGuardrailValidation = (
  asset: WorkflowAssetRecord | WorkflowAssetUpsertInput,
  idFactory: () => string = () => crypto.randomUUID(),
): WorkflowAssetUpsertInput => {
  const guardrail =
    asset.guardrail ?? createDefaultGuardrailDefinition(idFactory);
  if (guardrail.validations.length >= GuardrailValidationLimit) {
    return stripAssetPersistenceFields(asset);
  }

  return {
    ...stripAssetPersistenceFields(asset),
    guardrail: {
      ...guardrail,
      validations: [
        ...guardrail.validations,
        createDefaultGuardrailValidation(idFactory),
      ],
    },
  };
};

export const readGuardrailDefinitionValidity = (
  guardrail: GuardrailDefinitionRecord | null,
): GuardrailValidityResult => {
  if (!guardrail) {
    return {
      valid: false,
      blocking: false,
      message: "No guardrail definition is configured.",
    };
  }

  if (guardrail.validations.length === 0) {
    return {
      valid: false,
      blocking: guardrail.severity === WorkflowGuardrailSeverity.Error,
      message:
        guardrail.severity === WorkflowGuardrailSeverity.Error
          ? "Error guardrails need at least one validation before the node can be considered valid."
          : "Add at least one validation to make this guardrail actionable.",
    };
  }

  if (guardrail.validations.length > GuardrailValidationLimit) {
    return {
      valid: false,
      blocking: guardrail.severity === WorkflowGuardrailSeverity.Error,
      message: `Guardrails support at most ${GuardrailValidationLimit.toString()} validations.`,
    };
  }

  return {
    valid: true,
    blocking: false,
    message:
      guardrail.severity === WorkflowGuardrailSeverity.Error
        ? "Error severity blocks node validity only when a validation triggers."
        : "Warnings and success signals are permissive.",
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
  idFactory: () => string = () => crypto.randomUUID(),
): WorkflowDefinitionUpsertInput => {
  if (input.sourceNodeId === input.targetNodeId) {
    return stripDefinitionVersionFields(definition);
  }

  if (
    definition.edges.some(
      (edge) =>
        edge.sourceNodeId === input.sourceNodeId &&
        edge.sourcePortId === input.sourcePortId &&
        edge.targetNodeId === input.targetNodeId &&
        edge.targetPortId === input.targetPortId,
    )
  ) {
    return stripDefinitionVersionFields(definition);
  }

  const targetNode = definition.nodes.find(
    (node) => node.id === input.targetNodeId,
  );
  const targetPort = targetNode?.inputPorts.find(
    (port) => port.id === input.targetPortId,
  );
  const shouldReplaceExistingTargetConnection =
    targetPort?.acceptsMany === false;

  return {
    ...stripDefinitionVersionFields(definition),
    edges: [
      ...definition.edges.filter((edge) => {
        if (!shouldReplaceExistingTargetConnection) {
          return true;
        }

        return !(
          edge.targetNodeId === input.targetNodeId &&
          edge.targetPortId === input.targetPortId
        );
      }),
      {
        id: idFactory(),
        sourceNodeId: input.sourceNodeId,
        sourcePortId: input.sourcePortId,
        targetNodeId: input.targetNodeId,
        targetPortId: input.targetPortId,
        mapping: {
          mode: "passthrough",
          entries: [],
        },
      },
    ],
  };
};

export const setWorkflowViewport = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  viewport: WorkflowViewportRecord,
): WorkflowDefinitionUpsertInput => ({
  ...stripDefinitionVersionFields(definition),
  viewport: {
    x: Math.round(viewport.x),
    y: Math.round(viewport.y),
    zoom: Math.max(0.35, Math.min(1.8, Number(viewport.zoom.toFixed(2)))),
  },
});

export const isWorkflowViewportOnlyChange = (
  previous: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
  next: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
): boolean =>
  JSON.stringify({
    ...previous,
    viewport: DefaultWorkflowViewport,
  }) ===
  JSON.stringify({
    ...next,
    viewport: DefaultWorkflowViewport,
  });

export const stripDefinitionVersionFields = (
  definition: WorkflowDefinitionRecord | WorkflowDefinitionUpsertInput,
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
  tags: definition.tags,
});

const stripAssetPersistenceFields = (
  asset: WorkflowAssetRecord | WorkflowAssetUpsertInput,
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
  ...(asset.archivedAt ? { archivedAt: asset.archivedAt } : {}),
});

const readNodeTemplate = (
  kind: WorkflowNodeKind,
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
      outputPorts: [createPort("output", "Run", true)],
    };
  }

  if (kind === WorkflowNodeKind.AssetPrompt) {
    return {
      label: "Prompt",
      config: {},
      inputPorts: [createPort("input", "Context", true)],
      outputPorts: [createPort("output", "Prompt", true)],
      outputContract: createDefaultOutputContract("Prompt output"),
    };
  }

  if (kind === WorkflowNodeKind.AssetInstruction) {
    return {
      label: "Instruction",
      config: {},
      inputPorts: [createPort("input", "Context", true)],
      outputPorts: [createPort("output", "Instruction", true)],
      outputContract: createDefaultOutputContract("Instruction output"),
    };
  }

  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return {
      label: "Guardrail",
      config: {},
      inputPorts: [createPort("input", "Subject", true)],
      outputPorts: [createPort("output", "Validated", true)],
    };
  }

  if (kind === WorkflowNodeKind.AiAgent) {
    return {
      label: "Agent step",
      config: {
        role: WorkflowNodeRole.Planner,
        provider: createDefaultProviderSelection(),
        prompt: "",
      },
      inputPorts: [createPort("input", "Input", true)],
      outputPorts: [createPort("output", "Output", true)],
      outputContract: createDefaultOutputContract("Agent output"),
    };
  }

  if (kind === WorkflowNodeKind.AiProviderRun) {
    return {
      label: "Provider run",
      config: {
        provider: createDefaultProviderSelection(),
        prompt: "",
      },
      inputPorts: [createPort("input", "Input", true)],
      outputPorts: [createPort("output", "Output", true)],
      outputContract: createDefaultOutputContract("Provider output"),
    };
  }

  if (kind === WorkflowNodeKind.LogicCondition) {
    return {
      label: "Condition",
      config: {},
      inputPorts: [createPort("input", "Input", true)],
      outputPorts: [
        createPort("true", "True", true),
        createPort("false", "False", true),
      ],
    };
  }

  if (kind === WorkflowNodeKind.LogicMerge) {
    return {
      label: "Merge",
      config: {},
      inputPorts: [
        createPort("input-a", "Input A", true),
        createPort("input-b", "Input B", true),
      ],
      outputPorts: [createPort("output", "Merged", true)],
    };
  }

  if (kind === WorkflowNodeKind.HumanReview) {
    return {
      label: "Human review",
      config: {
        reviewPolicy: {
          requireHumanDecision: true,
        },
      },
      inputPorts: [createPort("input", "Input", true)],
      outputPorts: [
        createPort("approved", "Approved", true),
        createPort("changes", "Changes", true),
      ],
    };
  }

  return {
    label: "Response",
    config: {},
    inputPorts: [createPort("input", "Input", true)],
    outputPorts: [],
  };
};

export const readNodeAccentClassName = (kind: WorkflowNodeKind): string => {
  if (kind === WorkflowNodeKind.TriggerManual) {
    return "bg-emerald-500";
  }

  if (
    kind === WorkflowNodeKind.AssetPrompt ||
    kind === WorkflowNodeKind.AssetInstruction
  ) {
    return "bg-cyan-500";
  }

  if (kind === WorkflowNodeKind.AssetGuardrail) {
    return "bg-amber-500";
  }

  if (
    kind === WorkflowNodeKind.AiAgent ||
    kind === WorkflowNodeKind.AiProviderRun
  ) {
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

export const readNodeAssetKind = (
  kind: WorkflowNodeKind,
): WorkflowAssetKind | null => {
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
  WorkflowNodeKind.TerminalResponse,
];

const createPort = (
  id: string,
  name: string,
  acceptsMany: boolean,
): WorkflowPortRecord => ({
  id,
  name,
  acceptsMany,
});

const createDefaultOutputContract = (
  name: string,
  idFactory: () => string = () => crypto.randomUUID(),
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
        title: "Result",
      },
    },
  },
  sampleOutput: '{\n  "result": ""\n}',
});

const createDefaultGuardrailDefinition = (
  idFactory: () => string = () => crypto.randomUUID(),
): GuardrailDefinitionRecord => ({
  id: idFactory(),
  severity: WorkflowGuardrailSeverity.Error,
  operator: WorkflowGuardrailOperator.All,
  validations: [],
});

const createDefaultGuardrailValidation = (
  idFactory: () => string = () => crypto.randomUUID(),
): GuardrailValidationRecord => ({
  id: idFactory(),
  kind: "field_exists",
  target: "output",
  path: "$.result",
  message: "Expected $.result to be present.",
});

const createDefaultProviderSelection = (): WorkflowProviderSelectionRecord => ({
  providerId: ProviderKind.CodexCli,
  modelId: "",
  reasoningLevel: DefaultReasoningLevel,
  temperature: DefaultTemperature,
  verbosity: DefaultVerbosity,
  testStatus: "unknown",
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

const updateJsonSchemaNodeAtPath = (
  rootSchema: JsonSchemaNodeRecord,
  path: ReadonlyArray<string>,
  updater: (node: JsonSchemaNodeRecord) => JsonSchemaNodeRecord,
): JsonSchemaNodeRecord => {
  if (path.length === 0) {
    return cloneJsonSchemaNode(updater(cloneJsonSchemaNode(rootSchema)));
  }

  const [segment, ...restPath] = path;
  if (!segment) {
    return rootSchema;
  }

  if (segment === JsonSchemaItemsSegment) {
    if (rootSchema.type !== "array") {
      return rootSchema;
    }

    return {
      ...rootSchema,
      items: updateJsonSchemaNodeAtPath(
        cloneJsonSchemaNode(rootSchema.items ?? createJsonSchemaNode("string")),
        restPath,
        updater,
      ),
    };
  }

  if (rootSchema.type !== "object") {
    return rootSchema;
  }

  const currentChild = rootSchema.properties?.[segment];
  if (!currentChild) {
    return rootSchema;
  }

  return {
    ...rootSchema,
    properties: {
      ...(rootSchema.properties ?? {}),
      [segment]: updateJsonSchemaNodeAtPath(currentChild, restPath, updater),
    },
  };
};

const cloneJsonSchemaNode = (
  node: JsonSchemaNodeRecord,
): JsonSchemaNodeRecord => ({
  ...node,
  ...(node.required ? { required: [...node.required] } : {}),
  ...(node.properties
    ? {
        properties: Object.fromEntries(
          Object.entries(node.properties).map(([key, value]) => [
            key,
            cloneJsonSchemaNode(value),
          ]),
        ),
      }
    : {}),
  ...(node.items ? { items: cloneJsonSchemaNode(node.items) } : {}),
  ...(node.enum ? { enum: [...node.enum] } : {}),
});

const appendUniqueString = (
  values: ReadonlyArray<string> | undefined,
  value: string,
): ReadonlyArray<string> => [...new Set([...(values ?? []), value])];

const removeStringEntry = (
  values: ReadonlyArray<string> | undefined,
  value: string,
): ReadonlyArray<string> => (values ?? []).filter((entry) => entry !== value);

const readJsonSchemaNodePaths = (
  schema: JsonSchemaNodeRecord,
  prefix: string,
): ReadonlyArray<string> => {
  if (schema.type === "object") {
    const nestedPaths = Object.keys(schema.properties ?? {})
      .sort((left, right) => left.localeCompare(right))
      .flatMap((key) =>
        readJsonSchemaNodePaths(
          schema.properties?.[key] ?? createJsonSchemaNode("string"),
          `${prefix}.${key}`,
        ),
      );
    return [prefix, ...nestedPaths];
  }

  if (schema.type === "array") {
    const itemPrefix = `${prefix}[]`;
    const itemPaths = schema.items
      ? readJsonSchemaNodePaths(schema.items, itemPrefix)
      : [itemPrefix];
    return [prefix, ...itemPaths];
  }

  return [prefix];
};

const readJsonSchemaIssues = (
  schema: JsonSchemaNodeRecord,
  prefix: string,
): ReadonlyArray<string> => {
  if (schema.type === "object") {
    const properties = schema.properties ?? {};
    const missingRequired = (schema.required ?? []).filter(
      (fieldName) => !properties[fieldName],
    );
    if (missingRequired.length > 0) {
      return [
        `${prefix} references required fields that do not exist: ${missingRequired.join(", ")}.`,
      ];
    }

    return Object.entries(properties).flatMap(([key, value]) =>
      readJsonSchemaIssues(value, `${prefix}.${key}`),
    );
  }

  if (schema.type === "array") {
    const issues = readRangeIssues(
      prefix,
      schema.minItems,
      schema.maxItems,
      "items",
    );
    if (issues.length > 0) {
      return issues;
    }

    if (!schema.items) {
      return [`${prefix} arrays need an item schema.`];
    }

    return readJsonSchemaIssues(schema.items, `${prefix}[]`);
  }

  if (schema.type === "string") {
    const lengthIssues = readRangeIssues(
      prefix,
      schema.minLength,
      schema.maxLength,
      "length",
    );
    if (lengthIssues.length > 0) {
      return lengthIssues;
    }

    if (schema.pattern) {
      try {
        void new RegExp(schema.pattern, "u");
      } catch {
        return [`${prefix} has an invalid pattern.`];
      }
    }

    return [];
  }

  if (schema.type === "number" || schema.type === "integer") {
    return readRangeIssues(prefix, schema.minimum, schema.maximum, "value");
  }

  return [];
};

const readRangeIssues = (
  prefix: string,
  minimum: number | undefined,
  maximum: number | undefined,
  label: string,
): ReadonlyArray<string> => {
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    return [`${prefix} has a ${label} minimum greater than its maximum.`];
  }

  return [];
};

const buildJsonSchemaZodExpression = (schema: JsonSchemaNodeRecord): string => {
  const baseExpression = buildJsonSchemaZodExpressionCore(schema);
  return schema.nullable ? `${baseExpression}.nullable()` : baseExpression;
};

const buildJsonSchemaZodExpressionCore = (
  schema: JsonSchemaNodeRecord,
): string => {
  if (schema.type === "object") {
    const required = new Set(schema.required ?? []);
    const shapeEntries = Object.entries(schema.properties ?? {}).map(
      ([key, value]) => {
        const nestedExpression = buildJsonSchemaZodExpression(value);
        return `${JSON.stringify(key)}: ${required.has(key) ? nestedExpression : `${nestedExpression}.optional()`}`;
      },
    );
    return `z.object({${shapeEntries.join(", ")}}).strict()`;
  }

  if (schema.type === "array") {
    let arrayExpression = `z.array(${buildJsonSchemaZodExpression(schema.items ?? createJsonSchemaNode("string"))})`;
    if (schema.minItems !== undefined) {
      arrayExpression = `${arrayExpression}.min(${schema.minItems.toString()})`;
    }
    if (schema.maxItems !== undefined) {
      arrayExpression = `${arrayExpression}.max(${schema.maxItems.toString()})`;
    }
    return arrayExpression;
  }

  if (schema.type === "string") {
    let stringExpression = "z.string()";
    if (schema.minLength !== undefined) {
      stringExpression = `${stringExpression}.min(${schema.minLength.toString()})`;
    }
    if (schema.maxLength !== undefined) {
      stringExpression = `${stringExpression}.max(${schema.maxLength.toString()})`;
    }
    if (schema.pattern) {
      stringExpression = `${stringExpression}.regex(new RegExp(${JSON.stringify(schema.pattern)}, "u"))`;
    }
    if (schema.format === "email") {
      stringExpression = `${stringExpression}.email()`;
    }
    if (schema.format === "url") {
      stringExpression = `${stringExpression}.url()`;
    }
    if (schema.format === "uuid") {
      stringExpression = `${stringExpression}.uuid()`;
    }
    if (schema.format === "nif") {
      stringExpression = `${stringExpression}.regex(/^(?:\\\\d{8}|[XYZ]\\\\d{7})[A-Z]$/iu)`;
    }
    if (schema.enum && schema.enum.length > 0) {
      stringExpression = `${stringExpression}.refine((value) => ${JSON.stringify(schema.enum)}.includes(value))`;
    }
    return stringExpression;
  }

  if (schema.type === "number") {
    let numberExpression = "z.number()";
    if (schema.minimum !== undefined) {
      numberExpression = `${numberExpression}.min(${schema.minimum.toString()})`;
    }
    if (schema.maximum !== undefined) {
      numberExpression = `${numberExpression}.max(${schema.maximum.toString()})`;
    }
    return numberExpression;
  }

  if (schema.type === "integer") {
    let integerExpression = "z.number().int()";
    if (schema.minimum !== undefined) {
      integerExpression = `${integerExpression}.min(${schema.minimum.toString()})`;
    }
    if (schema.maximum !== undefined) {
      integerExpression = `${integerExpression}.max(${schema.maximum.toString()})`;
    }
    return integerExpression;
  }

  return "z.boolean()";
};

const validateJsonSchemaValue = (
  schema: JsonSchemaNodeRecord,
  value: unknown,
  prefix: string,
): ReadonlyArray<string> => {
  if (value === null) {
    return schema.nullable ? [] : [`${prefix} does not allow null values.`];
  }

  if (schema.type === "object") {
    if (!isRecordValue(value)) {
      return [`${prefix} must be an object.`];
    }

    const required = schema.required ?? [];
    const missingRequired = required.filter(
      (fieldName) => !(fieldName in value),
    );
    if (missingRequired.length > 0) {
      return [
        `${prefix} is missing required fields: ${missingRequired.join(", ")}.`,
      ];
    }

    const properties = schema.properties ?? {};
    const unknownKeys = Object.keys(value).filter((key) => !properties[key]);
    if (unknownKeys.length > 0) {
      return [`${prefix} contains unknown fields: ${unknownKeys.join(", ")}.`];
    }

    return Object.entries(properties).flatMap(([key, propertySchema]) =>
      key in value
        ? validateJsonSchemaValue(
            propertySchema,
            value[key],
            `${prefix}.${key}`,
          )
        : [],
    );
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      return [`${prefix} must be an array.`];
    }

    const minItemsIssue =
      schema.minItems !== undefined && value.length < schema.minItems
        ? [
            `${prefix} must contain at least ${schema.minItems.toString()} items.`,
          ]
        : [];
    if (minItemsIssue.length > 0) {
      return minItemsIssue;
    }

    const maxItemsIssue =
      schema.maxItems !== undefined && value.length > schema.maxItems
        ? [
            `${prefix} must contain at most ${schema.maxItems.toString()} items.`,
          ]
        : [];
    if (maxItemsIssue.length > 0) {
      return maxItemsIssue;
    }

    return value.flatMap((entry, index) =>
      validateJsonSchemaValue(
        schema.items ?? createJsonSchemaNode("string"),
        entry,
        `${prefix}[${index.toString()}]`,
      ),
    );
  }

  if (schema.type === "string") {
    return validateJsonSchemaStringValue(schema, value, prefix);
  }

  if (schema.type === "number" || schema.type === "integer") {
    return validateJsonSchemaNumberValue(schema, value, prefix);
  }

  return typeof value === "boolean" ? [] : [`${prefix} must be a boolean.`];
};

const validateJsonSchemaStringValue = (
  schema: JsonSchemaNodeRecord,
  value: unknown,
  prefix: string,
): ReadonlyArray<string> => {
  if (typeof value !== "string") {
    return [`${prefix} must be a string.`];
  }

  if (schema.minLength !== undefined && value.length < schema.minLength) {
    return [
      `${prefix} must be at least ${schema.minLength.toString()} characters long.`,
    ];
  }

  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    return [
      `${prefix} must be at most ${schema.maxLength.toString()} characters long.`,
    ];
  }

  if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
    return [`${prefix} does not match the configured pattern.`];
  }

  if (schema.enum && schema.enum.length > 0 && !schema.enum.includes(value)) {
    return [`${prefix} must be one of: ${schema.enum.join(", ")}.`];
  }

  if (schema.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
    return [`${prefix} must be a valid email.`];
  }

  if (schema.format === "url") {
    try {
      void new URL(value);
    } catch {
      return [`${prefix} must be a valid url.`];
    }
  }

  if (
    schema.format === "uuid" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    return [`${prefix} must be a valid uuid.`];
  }

  if (schema.format === "nif" && !/^(?:\d{8}|[XYZ]\d{7})[A-Z]$/iu.test(value)) {
    return [`${prefix} must be a valid nif.`];
  }

  return [];
};

const validateJsonSchemaNumberValue = (
  schema: JsonSchemaNodeRecord,
  value: unknown,
  prefix: string,
): ReadonlyArray<string> => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return [`${prefix} must be a number.`];
  }

  if (schema.type === "integer" && !Number.isInteger(value)) {
    return [`${prefix} must be an integer.`];
  }

  if (schema.minimum !== undefined && value < schema.minimum) {
    return [
      `${prefix} must be greater than or equal to ${schema.minimum.toString()}.`,
    ];
  }

  if (schema.maximum !== undefined && value > schema.maximum) {
    return [
      `${prefix} must be less than or equal to ${schema.maximum.toString()}.`,
    ];
  }

  return [];
};

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readJsonSchemaNodeDocument = (
  value: unknown,
): JsonSchemaNodeRecord | null => {
  if (!isRecordValue(value)) {
    return null;
  }

  const type = value["type"];
  if (
    type !== "object" &&
    type !== "string" &&
    type !== "number" &&
    type !== "integer" &&
    type !== "boolean" &&
    type !== "array"
  ) {
    return null;
  }

  const baseNode: JsonSchemaNodeRecord = {
    type,
  };

  if (typeof value["title"] === "string" && value["title"].trim().length > 0) {
    baseNode.title = value["title"].trim();
  }

  if (
    typeof value["description"] === "string" &&
    value["description"].trim().length > 0
  ) {
    baseNode.description = value["description"].trim();
  }

  if (
    Array.isArray(value["required"]) &&
    value["required"].every((entry) => typeof entry === "string")
  ) {
    baseNode.required = [...value["required"]];
  }

  if (
    Array.isArray(value["enum"]) &&
    value["enum"].every((entry) => typeof entry === "string")
  ) {
    baseNode.enum = [...value["enum"]];
  }

  if (typeof value["nullable"] === "boolean") {
    baseNode.nullable = value["nullable"];
  }

  if (
    value["format"] === "email" ||
    value["format"] === "url" ||
    value["format"] === "uuid" ||
    value["format"] === "nif"
  ) {
    baseNode.format = value["format"];
  }

  const minLength = readOptionalNumberValue(value["minLength"]);
  const maxLength = readOptionalNumberValue(value["maxLength"]);
  const minimum = readOptionalNumberValue(value["minimum"]);
  const maximum = readOptionalNumberValue(value["maximum"]);
  const minItems = readOptionalNumberValue(value["minItems"]);
  const maxItems = readOptionalNumberValue(value["maxItems"]);

  if (minLength !== undefined) {
    baseNode.minLength = minLength;
  }
  if (maxLength !== undefined) {
    baseNode.maxLength = maxLength;
  }
  if (minimum !== undefined) {
    baseNode.minimum = minimum;
  }
  if (maximum !== undefined) {
    baseNode.maximum = maximum;
  }
  if (minItems !== undefined) {
    baseNode.minItems = minItems;
  }
  if (maxItems !== undefined) {
    baseNode.maxItems = maxItems;
  }

  if (typeof value["pattern"] === "string") {
    baseNode.pattern = value["pattern"];
  }

  if (type === "object") {
    const propertiesValue = value["properties"];
    if (propertiesValue !== undefined) {
      if (!isRecordValue(propertiesValue)) {
        return null;
      }
      const properties = Object.entries(propertiesValue).reduce<Record<
        string,
        JsonSchemaNodeRecord
      > | null>((accumulator, [key, nested]) => {
        if (accumulator === null) {
          return null;
        }
        const nextNode = readJsonSchemaNodeDocument(nested);
        if (!nextNode) {
          return null;
        }
        accumulator[key] = nextNode;
        return accumulator;
      }, {});
      if (properties === null) {
        return null;
      }
      baseNode.properties = properties;
    } else {
      baseNode.properties = {};
    }
  }

  if (type === "array") {
    const itemNode =
      value["items"] === undefined
        ? createJsonSchemaNode("string")
        : readJsonSchemaNodeDocument(value["items"]);
    if (!itemNode) {
      return null;
    }
    baseNode.items = itemNode;
  }

  return baseNode;
};

const readOptionalNumberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const buildWorkflowExpressionToken = (
  reference: WorkflowExpressionVariableReference,
): string =>
  reference.sourceId
    ? `{{var|${reference.kind}|${reference.sourceId}|${reference.path}}}`
    : `{{var|${reference.kind}||${reference.path}}}`;

const splitWorkflowExpressionSegments = (
  value: string,
): ReadonlyArray<WorkflowExpressionSegmentRecord> => {
  const tokenPattern = /\{\{var\|([^|}]+)\|([^|}]*)\|([^}]+)\}\}/gu;
  const segments: WorkflowExpressionSegmentRecord[] = [];
  let index = 0;

  for (const match of value.matchAll(tokenPattern)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > index) {
      segments.push({
        kind: WorkflowExpressionSegmentKind.Text,
        value: value.slice(index, matchIndex),
      });
    }

    const reference = readWorkflowExpressionReferenceFromMatch(
      match[1] ?? "",
      match[2] ?? "",
      match[3] ?? "",
    );
    if (reference) {
      segments.push({
        kind: WorkflowExpressionSegmentKind.Variable,
        reference,
      });
    } else {
      segments.push({
        kind: WorkflowExpressionSegmentKind.Text,
        value: match[0],
      });
    }

    index = matchIndex + match[0].length;
  }

  if (index < value.length || segments.length === 0) {
    segments.push({
      kind: WorkflowExpressionSegmentKind.Text,
      value: value.slice(index),
    });
  }

  return segments;
};

const readWorkflowExpressionReferenceFromMatch = (
  kind: string,
  sourceId: string,
  path: string,
): WorkflowExpressionVariableReference | null => {
  if (
    kind !== WorkflowExpressionVariableKind.NodeOutput &&
    kind !== WorkflowExpressionVariableKind.CurrentInput &&
    kind !== WorkflowExpressionVariableKind.WorkflowContext &&
    kind !== WorkflowExpressionVariableKind.AssetOutput
  ) {
    return null;
  }

  const normalizedPath = path.trim();
  if (normalizedPath.length === 0) {
    return null;
  }

  return {
    kind,
    ...(sourceId.trim().length > 0 ? { sourceId: sourceId.trim() } : {}),
    path: normalizedPath,
  };
};

const serializeJsonSchemaNode = (
  schema: JsonSchemaNodeRecord,
): JsonContractProviderSchemaRecord => {
  if (schema.type === "object") {
    const required = new Set(schema.required ?? []);
    const properties = Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, value]) => [
        key,
        {
          ...serializeJsonSchemaNode(value),
          ...(required.has(key) ? { r: 1 as const } : {}),
        },
      ]),
    );
    return {
      t: "o",
      ...(Object.keys(properties).length > 0 ? { p: properties } : {}),
      ...(schema.nullable ? { n: 1 as const } : {}),
    };
  }

  if (schema.type === "array") {
    return {
      t: "a",
      i: serializeJsonSchemaNode(
        schema.items ?? createJsonSchemaNode("string"),
      ),
      ...(schema.minItems !== undefined ? { min: schema.minItems } : {}),
      ...(schema.maxItems !== undefined ? { max: schema.maxItems } : {}),
      ...(schema.nullable ? { n: 1 as const } : {}),
    };
  }

  return {
    t: readCompactPrimitiveType(schema.type),
    ...(schema.format ? { f: schema.format } : {}),
    ...(schema.minLength !== undefined ? { min: schema.minLength } : {}),
    ...(schema.maxLength !== undefined ? { max: schema.maxLength } : {}),
    ...(schema.minimum !== undefined ? { min: schema.minimum } : {}),
    ...(schema.maximum !== undefined ? { max: schema.maximum } : {}),
    ...(schema.pattern ? { re: schema.pattern } : {}),
    ...(schema.enum && schema.enum.length > 0 ? { e: [...schema.enum] } : {}),
    ...(schema.nullable ? { n: 1 as const } : {}),
  };
};

const readCompactPrimitiveType = (
  type: JsonSchemaNodeRecord["type"],
): "s" | "n" | "i" | "b" => {
  if (type === "string") {
    return "s";
  }

  if (type === "number") {
    return "n";
  }

  if (type === "integer") {
    return "i";
  }

  return "b";
};
