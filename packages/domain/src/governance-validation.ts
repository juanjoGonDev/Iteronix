export const GuardrailDecisionKind = {
  Allow: "allow",
  Deny: "deny",
} as const;

export type GuardrailDecisionKind =
  (typeof GuardrailDecisionKind)[keyof typeof GuardrailDecisionKind];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue };

export type GovernanceJsonSchema = {
  type: "array" | "boolean" | "number" | "object" | "string";
  properties?: Readonly<Record<string, GovernanceJsonSchema>>;
  required?: ReadonlyArray<string>;
  items?: GovernanceJsonSchema;
  enum?: ReadonlyArray<JsonPrimitive>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean;
};

export type VersionedJsonSchema = {
  id: string;
  version: number;
  schema: GovernanceJsonSchema;
};

export type ValidationError = {
  path: string;
  code: string;
  message: string;
};

export type SchemaValidationResult = {
  valid: boolean;
  errors: ReadonlyArray<ValidationError>;
};

export type WorkflowGuardrailPolicy = {
  allowedToolIds: ReadonlyArray<string>;
  allowSensitiveData: boolean;
  requiredProviderCapabilities: ReadonlyArray<string>;
  maxNodes: number;
  maxParallelism: number;
};

export type WorkflowGuardrailInput = {
  toolIds: ReadonlyArray<string>;
  handlesSensitiveData: boolean;
  providerCapabilities: ReadonlyArray<string>;
  nodeCount: number;
  parallelism: number;
};

export type GuardrailReason = {
  code:
    | "node-limit-exceeded"
    | "parallelism-limit-exceeded"
    | "provider-capability-missing"
    | "sensitive-data-not-allowed"
    | "tool-not-allowed";
  message: string;
};

export type GuardrailDecision = {
  kind: GuardrailDecisionKind;
  reasons: ReadonlyArray<GuardrailReason>;
};

export type RepairProposal = {
  id: string;
  lifecycleId: string;
  failureEvidence: string;
  proposedOutput: JsonValue;
  outputFingerprint: string;
  schema: VersionedJsonSchema;
  guardrailPolicy: WorkflowGuardrailPolicy;
  guardrailInput: WorkflowGuardrailInput;
};

export type EvaluationCase = {
  id: string;
  inputFingerprint: string;
  expectedFingerprint: string;
};

export type EvaluationContract = {
  id: string;
  workflowId: string;
  workflowVersion: string;
  providerId: string;
  providerVersion: string;
  dataset: ReadonlyArray<EvaluationCase>;
  fingerprint: string;
};

export type EvaluationOutcome = {
  caseId: string;
  outputFingerprint: string;
  latencyMs: number;
  costMicros: number;
};

export type EvaluationReport = {
  contractFingerprint: string;
  datasetFingerprint: string;
  totalCases: number;
  passedCases: number;
  totalLatencyMs: number;
  totalCostMicros: number;
};

export const validateVersionedJsonSchema = (
  schema: VersionedJsonSchema,
  value: unknown,
): SchemaValidationResult => {
  assertVersionedSchema(schema);
  const errors = validateSchema(schema.schema, value, "$");
  return { valid: errors.length === 0, errors };
};

export const evaluateGuardrails = (
  policy: WorkflowGuardrailPolicy,
  input: WorkflowGuardrailInput,
): GuardrailDecision => {
  assertGuardrailPolicy(policy);
  const reasons = [
    ...readToolReasons(policy, input),
    ...readSensitiveDataReasons(policy, input),
    ...readProviderCapabilityReasons(policy, input),
    ...readRuntimeLimitReasons(policy, input),
  ];
  return {
    kind:
      reasons.length === 0
        ? GuardrailDecisionKind.Allow
        : GuardrailDecisionKind.Deny,
    reasons,
  };
};

export const createRepairProposal = (input: {
  id: string;
  lifecycleId: string;
  failureEvidence: string;
  proposedOutput: unknown;
  schema: VersionedJsonSchema;
  guardrailPolicy: WorkflowGuardrailPolicy;
  guardrailInput: WorkflowGuardrailInput;
}): RepairProposal => {
  assertNonEmpty(input.id, "Repair proposal id is required");
  assertNonEmpty(input.lifecycleId, "Repair proposal lifecycle id is required");
  assertNonEmpty(
    input.failureEvidence,
    "Repair proposal failure evidence is required",
  );
  const validation = validateVersionedJsonSchema(
    input.schema,
    input.proposedOutput,
  );
  if (!validation.valid) {
    throw new Error("Repair proposal does not satisfy its output schema.");
  }
  const guardrail = evaluateGuardrails(
    input.guardrailPolicy,
    input.guardrailInput,
  );
  if (guardrail.kind === GuardrailDecisionKind.Deny) {
    throw new Error("Repair proposal violates workflow guardrails.");
  }
  const proposedOutput = toJsonValue(input.proposedOutput);
  if (proposedOutput === undefined) {
    throw new Error("Repair proposal output must be JSON-compatible.");
  }
  return {
    id: input.id,
    lifecycleId: input.lifecycleId,
    failureEvidence: input.failureEvidence,
    proposedOutput,
    outputFingerprint: createFingerprint(proposedOutput),
    schema: copySchema(input.schema),
    guardrailPolicy: copyGuardrailPolicy(input.guardrailPolicy),
    guardrailInput: copyGuardrailInput(input.guardrailInput),
  };
};

export const createEvaluationContract = (input: {
  id: string;
  workflowId: string;
  workflowVersion: string;
  providerId: string;
  providerVersion: string;
  dataset: ReadonlyArray<EvaluationCase>;
}): EvaluationContract => {
  assertNonEmpty(input.id, "Evaluation id is required");
  assertNonEmpty(input.workflowId, "Evaluation workflow id is required");
  assertNonEmpty(
    input.workflowVersion,
    "Evaluation workflow version is required",
  );
  assertNonEmpty(input.providerId, "Evaluation provider id is required");
  assertNonEmpty(
    input.providerVersion,
    "Evaluation provider version is required",
  );
  if (input.dataset.length === 0 || !input.dataset.every(isEvaluationCase)) {
    throw new Error("Evaluation dataset must contain valid cases.");
  }
  const dataset = [...input.dataset].sort(compareById);
  return {
    ...input,
    dataset,
    fingerprint: createFingerprint({
      id: input.id,
      workflowId: input.workflowId,
      workflowVersion: input.workflowVersion,
      providerId: input.providerId,
      providerVersion: input.providerVersion,
      dataset,
    }),
  };
};

export const evaluateReproducibleDataset = (
  contract: EvaluationContract,
  outcomes: ReadonlyArray<EvaluationOutcome>,
): EvaluationReport => {
  const orderedOutcomes = [...outcomes].sort(compareByCaseId);
  const expectedByCaseId = new Map(
    contract.dataset.map((evaluationCase) => [
      evaluationCase.id,
      evaluationCase.expectedFingerprint,
    ]),
  );
  const outcomeIds = new Set(orderedOutcomes.map((outcome) => outcome.caseId));
  if (
    orderedOutcomes.length !== contract.dataset.length ||
    outcomeIds.size !== contract.dataset.length ||
    !orderedOutcomes.every((outcome) =>
      isEvaluationOutcome(outcome, expectedByCaseId),
    )
  ) {
    throw new Error(
      "Evaluation outcomes must match the contract dataset exactly.",
    );
  }
  return {
    contractFingerprint: contract.fingerprint,
    datasetFingerprint: createFingerprint(contract.dataset),
    totalCases: orderedOutcomes.length,
    passedCases: orderedOutcomes.filter(
      (outcome) =>
        expectedByCaseId.get(outcome.caseId) === outcome.outputFingerprint,
    ).length,
    totalLatencyMs: orderedOutcomes.reduce(
      (total, outcome) => total + outcome.latencyMs,
      0,
    ),
    totalCostMicros: orderedOutcomes.reduce(
      (total, outcome) => total + outcome.costMicros,
      0,
    ),
  };
};

const validateSchema = (
  schema: GovernanceJsonSchema,
  value: unknown,
  path: string,
): ReadonlyArray<ValidationError> => [
  ...validateType(schema, value, path),
  ...validateEnum(schema, value, path),
  ...validateStringBounds(schema, value, path),
  ...validateNumberBounds(schema, value, path),
  ...validateObject(schema, value, path),
  ...validateArray(schema, value, path),
];

const validateType = (
  schema: GovernanceJsonSchema,
  value: unknown,
  path: string,
): ReadonlyArray<ValidationError> =>
  matchesType(schema.type, value)
    ? []
    : [{ path, code: "type", message: `Expected ${schema.type}.` }];

const validateEnum = (
  schema: GovernanceJsonSchema,
  value: unknown,
  path: string,
): ReadonlyArray<ValidationError> =>
  !schema.enum || schema.enum.some((candidate) => candidate === value)
    ? []
    : [{ path, code: "enum", message: "Value is not allowed." }];

const validateStringBounds = (
  schema: GovernanceJsonSchema,
  value: unknown,
  path: string,
): ReadonlyArray<ValidationError> =>
  typeof value !== "string"
    ? []
    : [
        ...(schema.minLength !== undefined && value.length < schema.minLength
          ? [{ path, code: "minLength", message: "String is too short." }]
          : []),
        ...(schema.maxLength !== undefined && value.length > schema.maxLength
          ? [{ path, code: "maxLength", message: "String is too long." }]
          : []),
      ];

const validateNumberBounds = (
  schema: GovernanceJsonSchema,
  value: unknown,
  path: string,
): ReadonlyArray<ValidationError> =>
  typeof value !== "number"
    ? []
    : [
        ...(schema.minimum !== undefined && value < schema.minimum
          ? [{ path, code: "minimum", message: "Number is too small." }]
          : []),
        ...(schema.maximum !== undefined && value > schema.maximum
          ? [{ path, code: "maximum", message: "Number is too large." }]
          : []),
      ];

const validateObject = (
  schema: GovernanceJsonSchema,
  value: unknown,
  path: string,
): ReadonlyArray<ValidationError> => {
  if (schema.type !== "object" || !isRecord(value)) {
    return [];
  }
  const required = schema.required ?? [];
  const properties = schema.properties ?? {};
  return [
    ...required
      .filter((key) => value[key] === undefined)
      .map((key) => ({
        path: `${path}.${key}`,
        code: "required",
        message: "Property is required.",
      })),
    ...Object.entries(properties).flatMap(([key, childSchema]) =>
      value[key] === undefined
        ? []
        : validateSchema(childSchema, value[key], `${path}.${key}`),
    ),
    ...(schema.additionalProperties === false
      ? Object.keys(value)
          .filter((key) => properties[key] === undefined)
          .map((key) => ({
            path: `${path}.${key}`,
            code: "additionalProperties",
            message: "Property is not allowed.",
          }))
      : []),
  ];
};

const validateArray = (
  schema: GovernanceJsonSchema,
  value: unknown,
  path: string,
): ReadonlyArray<ValidationError> => {
  const itemSchema = schema.items;
  return schema.type !== "array" || !Array.isArray(value) || !itemSchema
    ? []
    : value.flatMap((item, index) =>
        validateSchema(itemSchema, item, `${path}[${index.toString()}]`),
      );
};

const readToolReasons = (
  policy: WorkflowGuardrailPolicy,
  input: WorkflowGuardrailInput,
): ReadonlyArray<GuardrailReason> =>
  input.toolIds
    .filter((toolId) => !policy.allowedToolIds.includes(toolId))
    .map(() => ({
      code: "tool-not-allowed" as const,
      message: "A requested tool is not allowed.",
    }));

const readSensitiveDataReasons = (
  policy: WorkflowGuardrailPolicy,
  input: WorkflowGuardrailInput,
): ReadonlyArray<GuardrailReason> =>
  input.handlesSensitiveData && !policy.allowSensitiveData
    ? [
        {
          code: "sensitive-data-not-allowed",
          message: "Sensitive data handling is not allowed.",
        },
      ]
    : [];

const readProviderCapabilityReasons = (
  policy: WorkflowGuardrailPolicy,
  input: WorkflowGuardrailInput,
): ReadonlyArray<GuardrailReason> =>
  policy.requiredProviderCapabilities
    .filter((capability) => !input.providerCapabilities.includes(capability))
    .map(() => ({
      code: "provider-capability-missing" as const,
      message: "A required provider capability is missing.",
    }));

const readRuntimeLimitReasons = (
  policy: WorkflowGuardrailPolicy,
  input: WorkflowGuardrailInput,
): ReadonlyArray<GuardrailReason> => [
  ...(input.nodeCount > policy.maxNodes
    ? [
        {
          code: "node-limit-exceeded" as const,
          message: "Workflow node limit is exceeded.",
        },
      ]
    : []),
  ...(input.parallelism > policy.maxParallelism
    ? [
        {
          code: "parallelism-limit-exceeded" as const,
          message: "Workflow parallelism limit is exceeded.",
        },
      ]
    : []),
];

const assertVersionedSchema = (schema: VersionedJsonSchema): void => {
  assertNonEmpty(schema.id, "Schema id is required");
  if (!Number.isInteger(schema.version) || schema.version < 1) {
    throw new Error("Schema version must be a positive integer.");
  }
};

const assertGuardrailPolicy = (policy: WorkflowGuardrailPolicy): void => {
  if (!Number.isInteger(policy.maxNodes) || policy.maxNodes < 0) {
    throw new Error("Guardrail maxNodes must be a non-negative integer.");
  }
  if (!Number.isInteger(policy.maxParallelism) || policy.maxParallelism < 0) {
    throw new Error("Guardrail maxParallelism must be a non-negative integer.");
  }
};

const isEvaluationCase = (value: EvaluationCase): boolean =>
  value.id.trim().length > 0 &&
  value.inputFingerprint.trim().length > 0 &&
  value.expectedFingerprint.trim().length > 0;

const isEvaluationOutcome = (
  outcome: EvaluationOutcome,
  expectedByCaseId: ReadonlyMap<string, string>,
): boolean =>
  expectedByCaseId.has(outcome.caseId) &&
  outcome.outputFingerprint.trim().length > 0 &&
  Number.isInteger(outcome.latencyMs) &&
  outcome.latencyMs >= 0 &&
  Number.isInteger(outcome.costMicros) &&
  outcome.costMicros >= 0;

const compareById = (left: EvaluationCase, right: EvaluationCase): number =>
  compareCanonicalText(left.id, right.id);

const compareByCaseId = (
  left: EvaluationOutcome,
  right: EvaluationOutcome,
): number => compareCanonicalText(left.caseId, right.caseId);

const compareCanonicalText = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const matchesType = (
  type: GovernanceJsonSchema["type"],
  value: unknown,
): boolean =>
  (type === "array" && Array.isArray(value)) ||
  (type === "boolean" && typeof value === "boolean") ||
  (type === "number" && typeof value === "number" && Number.isFinite(value)) ||
  (type === "object" && isRecord(value)) ||
  (type === "string" && typeof value === "string");

export const toJsonValue = (value: unknown): JsonValue | undefined => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    const items = value.map(toJsonValue);
    return items.every((item): item is JsonValue => item !== undefined)
      ? items
      : undefined;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).map(
      ([key, item]) => [key, toJsonValue(item)] as const,
    );
    return entries.every(
      (entry): entry is readonly [string, JsonValue] => entry[1] !== undefined,
    )
      ? Object.fromEntries(entries)
      : undefined;
  }
  return undefined;
};

export const parseRepairProposals = (
  value: unknown,
): ReadonlyArray<RepairProposal> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const proposals = value.map(parseRepairProposal);
  return proposals.every(
    (proposal): proposal is RepairProposal => proposal !== undefined,
  )
    ? proposals
    : undefined;
};

const parseRepairProposal = (value: unknown): RepairProposal | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = readNonEmptyString(value["id"]);
  const lifecycleId = readNonEmptyString(value["lifecycleId"]);
  const failureEvidence = readNonEmptyString(value["failureEvidence"]);
  const outputFingerprint = readNonEmptyString(value["outputFingerprint"]);
  const proposedOutput = toJsonValue(value["proposedOutput"]);
  const schema = parseVersionedJsonSchema(value["schema"]);
  const guardrailPolicy = parseGuardrailPolicy(value["guardrailPolicy"]);
  const guardrailInput = parseGuardrailInput(value["guardrailInput"]);
  if (
    !id ||
    !lifecycleId ||
    !failureEvidence ||
    !outputFingerprint ||
    proposedOutput === undefined ||
    !schema ||
    !guardrailPolicy ||
    !guardrailInput
  ) {
    return undefined;
  }
  try {
    const proposal = createRepairProposal({
      id,
      lifecycleId,
      failureEvidence,
      proposedOutput,
      schema,
      guardrailPolicy,
      guardrailInput,
    });
    return proposal.outputFingerprint === outputFingerprint
      ? proposal
      : undefined;
  } catch {
    return undefined;
  }
};

const parseVersionedJsonSchema = (
  value: unknown,
): VersionedJsonSchema | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = readNonEmptyString(value["id"]);
  const version = value["version"];
  const schema = parseGovernanceJsonSchema(value["schema"]);
  return id &&
    typeof version === "number" &&
    Number.isInteger(version) &&
    version > 0 &&
    schema
    ? { id, version, schema }
    : undefined;
};

const parseGovernanceJsonSchema = (
  value: unknown,
): GovernanceJsonSchema | undefined => {
  if (!isRecord(value) || !isSchemaType(value["type"])) {
    return undefined;
  }
  const properties = parseSchemaProperties(value["properties"]);
  const required = parseStringArray(value["required"]);
  const items =
    value["items"] === undefined
      ? undefined
      : parseGovernanceJsonSchema(value["items"]);
  const enumValues = parseJsonPrimitiveArray(value["enum"]);
  if (
    (value["properties"] !== undefined && !properties) ||
    (value["required"] !== undefined && !required) ||
    (value["items"] !== undefined && !items) ||
    (value["enum"] !== undefined && !enumValues) ||
    !isOptionalNonNegativeInteger(value["minLength"]) ||
    !isOptionalNonNegativeInteger(value["maxLength"]) ||
    !isOptionalFiniteNumber(value["minimum"]) ||
    !isOptionalFiniteNumber(value["maximum"]) ||
    !isOptionalBoolean(value["additionalProperties"])
  ) {
    return undefined;
  }
  return {
    type: value["type"],
    ...(properties ? { properties } : {}),
    ...(required ? { required } : {}),
    ...(items ? { items } : {}),
    ...(enumValues ? { enum: enumValues } : {}),
    ...(typeof value["minLength"] === "number"
      ? { minLength: value["minLength"] }
      : {}),
    ...(typeof value["maxLength"] === "number"
      ? { maxLength: value["maxLength"] }
      : {}),
    ...(typeof value["minimum"] === "number"
      ? { minimum: value["minimum"] }
      : {}),
    ...(typeof value["maximum"] === "number"
      ? { maximum: value["maximum"] }
      : {}),
    ...(typeof value["additionalProperties"] === "boolean"
      ? { additionalProperties: value["additionalProperties"] }
      : {}),
  };
};

const parseGuardrailPolicy = (
  value: unknown,
): WorkflowGuardrailPolicy | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const allowedToolIds = parseStringArray(value["allowedToolIds"]);
  const requiredProviderCapabilities = parseStringArray(
    value["requiredProviderCapabilities"],
  );
  return allowedToolIds &&
    requiredProviderCapabilities &&
    typeof value["allowSensitiveData"] === "boolean" &&
    isNonNegativeInteger(value["maxNodes"]) &&
    isNonNegativeInteger(value["maxParallelism"])
    ? {
        allowedToolIds,
        allowSensitiveData: value["allowSensitiveData"],
        requiredProviderCapabilities,
        maxNodes: value["maxNodes"],
        maxParallelism: value["maxParallelism"],
      }
    : undefined;
};

const parseGuardrailInput = (
  value: unknown,
): WorkflowGuardrailInput | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const toolIds = parseStringArray(value["toolIds"]);
  const providerCapabilities = parseStringArray(value["providerCapabilities"]);
  return toolIds &&
    providerCapabilities &&
    typeof value["handlesSensitiveData"] === "boolean" &&
    isNonNegativeInteger(value["nodeCount"]) &&
    isNonNegativeInteger(value["parallelism"])
    ? {
        toolIds,
        handlesSensitiveData: value["handlesSensitiveData"],
        providerCapabilities,
        nodeCount: value["nodeCount"],
        parallelism: value["parallelism"],
      }
    : undefined;
};

const createFingerprint = (value: JsonValue): string => {
  const source = stableJson(value);
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const stableJson = (value: JsonValue): string =>
  Array.isArray(value)
    ? `[${value.map(stableJson).join(",")}]`
    : isJsonRecord(value)
      ? `{${Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
          .join(",")}}`
      : JSON.stringify(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const parseStringArray = (value: unknown): ReadonlyArray<string> | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;

const parseJsonPrimitiveArray = (
  value: unknown,
): ReadonlyArray<JsonPrimitive> | undefined =>
  Array.isArray(value) && value.every(isJsonPrimitive) ? value : undefined;

const parseSchemaProperties = (
  value: unknown,
): Readonly<Record<string, GovernanceJsonSchema>> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const entries = Object.entries(value).map(
    ([key, schema]) => [key, parseGovernanceJsonSchema(schema)] as const,
  );
  return entries.every(
    (entry): entry is readonly [string, GovernanceJsonSchema] =>
      entry[1] !== undefined,
  )
    ? Object.fromEntries(entries)
    : undefined;
};

const isSchemaType = (value: unknown): value is GovernanceJsonSchema["type"] =>
  value === "array" ||
  value === "boolean" ||
  value === "number" ||
  value === "object" ||
  value === "string";

const isJsonPrimitive = (value: unknown): value is JsonPrimitive =>
  value === null ||
  typeof value === "string" ||
  typeof value === "number" ||
  typeof value === "boolean";

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isOptionalNonNegativeInteger = (value: unknown): boolean =>
  value === undefined || isNonNegativeInteger(value);

const isOptionalFiniteNumber = (value: unknown): boolean =>
  value === undefined || (typeof value === "number" && Number.isFinite(value));

const isOptionalBoolean = (value: unknown): boolean =>
  value === undefined || typeof value === "boolean";

const isJsonRecord = (
  value: JsonValue,
): value is { readonly [key: string]: JsonValue } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const copySchema = (schema: VersionedJsonSchema): VersionedJsonSchema => ({
  id: schema.id,
  version: schema.version,
  schema: copyJsonSchema(schema.schema),
});

const copyJsonSchema = (
  schema: GovernanceJsonSchema,
): GovernanceJsonSchema => ({
  ...schema,
  ...(schema.properties
    ? {
        properties: Object.fromEntries(
          Object.entries(schema.properties).map(([key, value]) => [
            key,
            copyJsonSchema(value),
          ]),
        ),
      }
    : {}),
  ...(schema.items ? { items: copyJsonSchema(schema.items) } : {}),
  ...(schema.required ? { required: [...schema.required] } : {}),
  ...(schema.enum ? { enum: [...schema.enum] } : {}),
});

const copyGuardrailPolicy = (
  policy: WorkflowGuardrailPolicy,
): WorkflowGuardrailPolicy => ({
  allowedToolIds: [...policy.allowedToolIds],
  allowSensitiveData: policy.allowSensitiveData,
  requiredProviderCapabilities: [...policy.requiredProviderCapabilities],
  maxNodes: policy.maxNodes,
  maxParallelism: policy.maxParallelism,
});

const copyGuardrailInput = (
  input: WorkflowGuardrailInput,
): WorkflowGuardrailInput => ({
  toolIds: [...input.toolIds],
  handlesSensitiveData: input.handlesSensitiveData,
  providerCapabilities: [...input.providerCapabilities],
  nodeCount: input.nodeCount,
  parallelism: input.parallelism,
});

const assertNonEmpty = (value: string, message: string): void => {
  if (value.trim().length === 0) {
    throw new Error(`${message}.`);
  }
};
