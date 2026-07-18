import {
  type GovernanceJsonSchema,
  type JsonValue,
  type VersionedJsonSchema,
  toJsonValue,
  validateVersionedJsonSchema,
} from "./governance-validation";

export const AgentCapability = {
  Memory: "memory",
  Mcp: "mcp",
  Rag: "rag",
  Streaming: "streaming",
  StructuredOutput: "structured-output",
  ToolCalls: "tool-calls",
} as const;

export type AgentCapability =
  (typeof AgentCapability)[keyof typeof AgentCapability];

export const AgentPermission = {
  MemoryRead: "memory.read",
  MemoryWrite: "memory.write",
  McpInvoke: "mcp.invoke",
  RagQuery: "rag.query",
  ToolInvoke: "tool.invoke",
} as const;

export type AgentPermission =
  (typeof AgentPermission)[keyof typeof AgentPermission];

export type CapabilityDeclaration = {
  capabilities: ReadonlyArray<AgentCapability>;
  permissions: ReadonlyArray<AgentPermission>;
};

export type ArtifactProvenance = {
  source: string;
  artifactFingerprint: string;
  registeredAt: string;
};

export type AgentInvocationRequest = {
  agentId: string;
  workflowId: string;
  input: JsonValue;
  requestedCapabilities: ReadonlyArray<AgentCapability>;
  grantedPermissions: ReadonlyArray<AgentPermission>;
};

export type AgentInvocationResult = {
  output: JsonValue;
  provenance: ArtifactProvenance;
};

export type AgentPort = CapabilityDeclaration & {
  id: string;
  invoke: (request: AgentInvocationRequest) => Promise<AgentInvocationResult>;
};

export type ToolDefinition = {
  id: string;
  inputSchema: VersionedJsonSchema;
  outputSchema: VersionedJsonSchema;
  requiredPermissions: ReadonlyArray<AgentPermission>;
};

export type ToolPort = CapabilityDeclaration & {
  id: string;
  tools: ReadonlyArray<ToolDefinition>;
  invoke: (input: {
    toolId: string;
    input: JsonValue;
    provenance: ArtifactProvenance;
  }) => Promise<McpToolResult>;
};

export type SkillDefinition = ToolDefinition & {
  version: number;
  description: string;
  provenance: ArtifactProvenance;
};

export type MemoryScope = {
  tenantId: string;
  workflowId: string;
  enabled: boolean;
  retentionDays: number;
};

export type MemoryRetrievalProvenance = {
  documentId: string;
  documentFingerprint: string;
  source: string;
  retrievedAt: string;
};

export type MemoryRetrieval = {
  content: string;
  provenance: MemoryRetrievalProvenance;
};

export type MemoryPort = {
  retrieve: (input: {
    scope: MemoryScope;
    query: string;
  }) => Promise<ReadonlyArray<MemoryRetrieval>>;
  store: (input: {
    scope: MemoryScope;
    value: JsonValue;
    provenance: ArtifactProvenance;
  }) => Promise<void>;
};

export type RagPort = {
  retrieve: (input: {
    scope: MemoryScope;
    query: string;
    limit: number;
  }) => Promise<ReadonlyArray<MemoryRetrieval>>;
};

export const McpToolResultStatus = {
  Failure: "failure",
  Success: "success",
} as const;

export type McpToolResultStatus =
  (typeof McpToolResultStatus)[keyof typeof McpToolResultStatus];

export type McpResponseProvenance = {
  serverId: string;
  toolVersion: string;
  responseFingerprint: string;
};

export type McpToolResult = {
  toolId: string;
  status: McpToolResultStatus;
  output?: unknown;
  provenance: McpResponseProvenance;
};

export type McpToolResultValidation = {
  valid: boolean;
  output?: JsonValue;
  errors: ReadonlyArray<{ path: string; code: string; message: string }>;
};

export const PluginRuntimeKind = {
  Server: "server",
} as const;

export type PluginRuntimeKind =
  (typeof PluginRuntimeKind)[keyof typeof PluginRuntimeKind];

export type ServerPluginManifest = {
  id: string;
  version: string;
  runtime: PluginRuntimeKind;
  isolation: "process";
  permissions: ReadonlyArray<AgentPermission>;
  tools: ReadonlyArray<
    Pick<ToolDefinition, "id" | "inputSchema" | "outputSchema">
  >;
  audit: {
    manifestFingerprint: string;
    publishedAt: string;
  };
};

export type PluginManifestValidation = {
  valid: boolean;
  errors: ReadonlyArray<{ code: string; message: string }>;
};

export const createSkillDefinition = (
  input: SkillDefinition,
): SkillDefinition => {
  assertNonEmpty(input.id, "Skill id is required");
  assertPositiveInteger(
    input.version,
    "Skill version must be a positive integer",
  );
  assertNonEmpty(input.description, "Skill description is required");
  assertPermissions(
    input.requiredPermissions,
    "Skill permissions must be declared",
  );
  assertSchema(input.inputSchema, "Skill input schema");
  assertSchema(input.outputSchema, "Skill output schema");
  assertArtifactProvenance(input.provenance);
  return {
    ...input,
    requiredPermissions: [...input.requiredPermissions],
    inputSchema: copySchema(input.inputSchema),
    outputSchema: copySchema(input.outputSchema),
    provenance: { ...input.provenance },
  };
};

export const createMemoryScope = (input: MemoryScope): MemoryScope => {
  assertNonEmpty(input.tenantId, "Memory tenant id is required");
  assertNonEmpty(input.workflowId, "Memory workflow id is required");
  if (!Number.isInteger(input.retentionDays) || input.retentionDays < 0) {
    throw new Error("Memory retention days must be a non-negative integer.");
  }
  if (!input.enabled && input.retentionDays !== 0) {
    throw new Error("Disabled memory scopes must not retain data.");
  }
  return { ...input };
};

export const validateMcpToolResult = (
  result: McpToolResult,
  outputSchema: VersionedJsonSchema,
): McpToolResultValidation => {
  assertNonEmpty(result.toolId, "MCP tool id is required");
  assertMcpProvenance(result.provenance);
  assertSchema(outputSchema, "MCP output schema");
  if (result.status !== McpToolResultStatus.Success) {
    return {
      valid: false,
      errors: [{ path: "$", code: "mcp.failure", message: "MCP tool failed." }],
    };
  }
  const validation = validateVersionedJsonSchema(outputSchema, result.output);
  if (!validation.valid) {
    return validation;
  }
  const output = toJsonValue(result.output);
  return output === undefined
    ? {
        valid: false,
        errors: [
          {
            path: "$",
            code: "mcp.json",
            message: "MCP output must be JSON-compatible.",
          },
        ],
      }
    : { valid: true, output, errors: [] };
};

export const validatePluginManifest = (
  input: unknown,
): PluginManifestValidation => {
  if (!isRecord(input)) {
    return invalidManifest(
      "plugin.manifest",
      "Plugin manifest must be an object.",
    );
  }
  const runtime = input["runtime"];
  const isolation = input["isolation"];
  const id = input["id"];
  const version = input["version"];
  const permissions = input["permissions"];
  const tools = input["tools"];
  const audit = input["audit"];
  const errors = [
    ...(runtime === PluginRuntimeKind.Server
      ? []
      : [manifestError("plugin.runtime", "Plugins must run on the server.")]),
    ...(isolation === "process"
      ? []
      : [
          manifestError(
            "plugin.isolation",
            "Plugins require process isolation.",
          ),
        ]),
    ...(isNonEmptyString(id)
      ? []
      : [manifestError("plugin.id", "Plugin id is required.")]),
    ...(isNonEmptyString(version)
      ? []
      : [manifestError("plugin.version", "Plugin version is required.")]),
    ...validateManifestPermissions(permissions),
    ...validateManifestTools(tools),
    ...validateManifestAudit(audit),
  ];
  return { valid: errors.length === 0, errors };
};

const validateManifestPermissions = (
  value: unknown,
): ReadonlyArray<{ code: string; message: string }> =>
  Array.isArray(value) && value.length > 0 && value.every(isAgentPermission)
    ? []
    : [
        manifestError(
          "plugin.permissions",
          "Plugin permissions must be declared.",
        ),
      ];

const validateManifestTools = (
  value: unknown,
): ReadonlyArray<{ code: string; message: string }> => {
  if (!Array.isArray(value) || value.length === 0) {
    return [manifestError("plugin.tools", "Plugin tools must be declared.")];
  }
  return value.every(isValidManifestTool)
    ? []
    : [manifestError("plugin.tools", "Plugin tools require valid schemas.")];
};

const validateManifestAudit = (
  value: unknown,
): ReadonlyArray<{ code: string; message: string }> =>
  isRecord(value) &&
  isNonEmptyString(value["manifestFingerprint"]) &&
  isNonEmptyString(value["publishedAt"])
    ? []
    : [manifestError("plugin.audit", "Plugin audit provenance is required.")];

const isValidManifestTool = (value: unknown): boolean => {
  if (!isRecord(value) || !isNonEmptyString(value["id"])) {
    return false;
  }
  try {
    assertSchema(value["inputSchema"], "Plugin input schema");
    assertSchema(value["outputSchema"], "Plugin output schema");
    return true;
  } catch {
    return false;
  }
};

const assertPermissions = (
  permissions: ReadonlyArray<AgentPermission>,
  message: string,
): void => {
  if (
    permissions.length === 0 ||
    !permissions.every(isAgentPermission) ||
    new Set(permissions).size !== permissions.length
  ) {
    throw new Error(`${message}.`);
  }
};

const assertSchema: (
  value: unknown,
  label: string,
) => asserts value is VersionedJsonSchema = (value, label) => {
  if (!isVersionedJsonSchema(value)) {
    throw new Error(`${label} is invalid.`);
  }
};

const isVersionedJsonSchema = (
  value: unknown,
): value is VersionedJsonSchema => {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value["id"]) ||
    !isPositiveInteger(value["version"])
  ) {
    return false;
  }
  const schema = value["schema"];
  return isGovernanceJsonSchema(schema);
};

const isGovernanceJsonSchema = (
  value: unknown,
): value is GovernanceJsonSchema =>
  isRecord(value) &&
  (value["type"] === "array" ||
    value["type"] === "boolean" ||
    value["type"] === "number" ||
    value["type"] === "object" ||
    value["type"] === "string");

const assertArtifactProvenance = (value: ArtifactProvenance): void => {
  assertNonEmpty(value.source, "Artifact provenance source is required");
  assertNonEmpty(
    value.artifactFingerprint,
    "Artifact provenance fingerprint is required",
  );
  assertNonEmpty(
    value.registeredAt,
    "Artifact provenance registration time is required",
  );
};

const assertMcpProvenance = (value: McpResponseProvenance): void => {
  assertNonEmpty(value.serverId, "MCP server id is required");
  assertNonEmpty(value.toolVersion, "MCP tool version is required");
  assertNonEmpty(
    value.responseFingerprint,
    "MCP response fingerprint is required",
  );
};

const copySchema = (schema: VersionedJsonSchema): VersionedJsonSchema => ({
  id: schema.id,
  version: schema.version,
  schema: copyGovernanceSchema(schema.schema),
});

const copyGovernanceSchema = (
  schema: GovernanceJsonSchema,
): GovernanceJsonSchema => ({
  ...schema,
  ...(schema.properties
    ? {
        properties: Object.fromEntries(
          Object.entries(schema.properties).map(([key, value]) => [
            key,
            copyGovernanceSchema(value),
          ]),
        ),
      }
    : {}),
  ...(schema.required ? { required: [...schema.required] } : {}),
  ...(schema.items ? { items: copyGovernanceSchema(schema.items) } : {}),
  ...(schema.enum ? { enum: [...schema.enum] } : {}),
});

const invalidManifest = (
  code: string,
  message: string,
): PluginManifestValidation => ({
  valid: false,
  errors: [manifestError(code, message)],
});

const manifestError = (
  code: string,
  message: string,
): { code: string; message: string } => ({
  code,
  message,
});

const isAgentPermission = (value: unknown): value is AgentPermission =>
  typeof value === "string" &&
  Object.values(AgentPermission).some((permission) => permission === value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const assertNonEmpty = (value: string, message: string): void => {
  if (!isNonEmptyString(value)) {
    throw new Error(`${message}.`);
  }
};

const assertPositiveInteger = (value: number, message: string): void => {
  if (!isPositiveInteger(value)) {
    throw new Error(`${message}.`);
  }
};
