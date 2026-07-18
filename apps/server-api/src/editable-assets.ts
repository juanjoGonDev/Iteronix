import {
  AgentCapability,
  AgentPermission,
  PluginRuntimeKind,
  type ArtifactProvenance,
} from "../../../packages/domain/src/agent-tool-contracts";
import type { VersionedJsonSchema } from "../../../packages/domain/src/governance-validation";

export const AssetKind = {
  Agent: "agent",
  McpTool: "mcp-tool",
  Skill: "skill",
  MemorySource: "memory-source",
  Plugin: "plugin",
  Prompt: "prompt",
} as const;

export type AssetKind = (typeof AssetKind)[keyof typeof AssetKind];

export const AssetStatus = {
  Disabled: "disabled",
  Enabled: "enabled",
  Error: "error",
} as const;

export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export type EditableAssetRecord = {
  id: string;
  kind: AssetKind;
  name: string;
  status: AssetStatus;
  capabilities: ReadonlyArray<AgentCapability>;
  permissions: ReadonlyArray<AgentPermission>;
  inputSchema: VersionedJsonSchema;
  outputSchema: VersionedJsonSchema;
  limits: { executions: number; timeoutMs: number };
  provenance: ArtifactProvenance;
  agent?: {
    providerId: string;
    model: string;
    toolPermissions: ReadonlyArray<AgentPermission>;
  };
  mcp?: {
    serverId: string;
    toolVersion: string;
    auditEvents: ReadonlyArray<AssetAuditEvent>;
  };
  skill?: { version: number; lifecycle: AssetStatus };
  memory?: {
    tenantId: string;
    workflowId: string;
    optInIndexing: boolean;
    retentionDays: number;
    redactRetrievals: boolean;
  };
  plugin?: {
    runtime: PluginRuntimeKind;
    isolation: "process";
    auditEvents: ReadonlyArray<AssetAuditEvent>;
  };
  prompt?: {
    activeVersion: number;
    versions: ReadonlyArray<PromptAssetVersion>;
  };
};

export type PromptVariableDefinition = {
  name: string;
  required: boolean;
  schema: VersionedJsonSchema;
};

export type PromptAssetVersion = {
  version: number;
  template: string;
  variables: ReadonlyArray<PromptVariableDefinition>;
  provenance: ArtifactProvenance;
  createdAt: string;
};

export type AssetAuditEvent = { at: string; action: string; actorId: string };

export type EditableAssetCatalog = {
  records: ReadonlyArray<EditableAssetRecord>;
};

export const createEditableAssetCatalog = (): EditableAssetCatalog => ({
  records: [],
});

export const upsertEditableAsset = (
  catalog: EditableAssetCatalog,
  input: EditableAssetRecord,
): EditableAssetCatalog => {
  const asset = normalizeEditableAsset(input);
  const existing = catalog.records.find(
    (candidate) => candidate.id === asset.id,
  );
  if (existing?.kind === AssetKind.Prompt || asset.kind === AssetKind.Prompt) {
    assertPromptUpdate(existing, asset);
  }
  const records = catalog.records.filter(
    (candidate) => candidate.id !== asset.id,
  );
  return { records: [...records, asset] };
};

export const removeEditableAsset = (
  catalog: EditableAssetCatalog,
  assetId: string,
): EditableAssetCatalog => ({
  records: catalog.records.filter((asset) => asset.id !== assetId),
});

export const parseEditableAssetCatalog = (
  value: unknown,
): EditableAssetCatalog => {
  if (!isRecord(value) || !Array.isArray(value["records"])) {
    return createEditableAssetCatalog();
  }
  return value["records"]
    .flatMap((record) => {
      try {
        return isRecord(record) ? [readEditableAsset(record)] : [];
      } catch {
        return [];
      }
    })
    .reduce<EditableAssetCatalog>(
      (catalog, asset) => upsertEditableAsset(catalog, asset),
      createEditableAssetCatalog(),
    );
};

const normalizeEditableAsset = (
  asset: EditableAssetRecord,
): EditableAssetRecord => {
  assertString(asset.id, "Asset id is required");
  assertString(asset.name, "Asset name is required");
  if (!isAssetKind(asset.kind)) throw new Error("Asset kind is invalid.");
  if (!isAssetStatus(asset.status)) throw new Error("Asset status is invalid.");
  assertCapabilities(asset.capabilities);
  assertPermissions(asset.permissions);
  assertSchema(asset.inputSchema);
  assertSchema(asset.outputSchema);
  if (!Number.isInteger(asset.limits.executions) || asset.limits.executions < 1)
    throw new Error("Asset execution limit must be positive.");
  if (!Number.isInteger(asset.limits.timeoutMs) || asset.limits.timeoutMs < 1)
    throw new Error("Asset timeout must be positive.");
  assertProvenance(asset.provenance);
  assertDetails(asset);
  return withSafeDetails({
    ...asset,
    capabilities: [...new Set(asset.capabilities)],
    permissions: [...new Set(asset.permissions)],
    inputSchema: {
      ...asset.inputSchema,
      schema: { ...asset.inputSchema.schema },
    },
    outputSchema: {
      ...asset.outputSchema,
      schema: { ...asset.outputSchema.schema },
    },
    limits: { ...asset.limits },
    provenance: { ...asset.provenance },
    ...(asset.agent
      ? {
          agent: {
            ...asset.agent,
            toolPermissions: [...new Set(asset.agent.toolPermissions)],
          },
        }
      : {}),
    ...(asset.mcp
      ? { mcp: { ...asset.mcp, auditEvents: [...asset.mcp.auditEvents] } }
      : {}),
    ...(asset.skill ? { skill: { ...asset.skill } } : {}),
    ...(asset.memory ? { memory: { ...asset.memory } } : {}),
    ...(asset.plugin
      ? {
          plugin: {
            ...asset.plugin,
            auditEvents: [...asset.plugin.auditEvents],
          },
        }
      : {}),
    ...(asset.prompt
      ? {
          prompt: {
            activeVersion: asset.prompt.activeVersion,
            versions: asset.prompt.versions.map(copyPromptVersion),
          },
        }
      : {}),
  });
};

const withSafeDetails = (asset: EditableAssetRecord): EditableAssetRecord => ({
  ...asset,
  ...(asset.kind === AssetKind.MemorySource && !asset.memory
    ? {
        memory: {
          tenantId: "",
          workflowId: "",
          optInIndexing: false,
          retentionDays: 0,
          redactRetrievals: true,
        },
      }
    : {}),
  ...(asset.kind === AssetKind.Plugin && !asset.plugin
    ? {
        plugin: {
          runtime: PluginRuntimeKind.Server,
          isolation: "process",
          auditEvents: [],
        },
      }
    : {}),
});

const readEditableAsset = (
  value: Record<string, unknown>,
): EditableAssetRecord => {
  const id = readString(value, "id");
  const kind = value["kind"];
  const name = readString(value, "name");
  const status = value["status"];
  const limits = readLimits(value["limits"]);
  const provenance = readProvenance(value["provenance"]);
  const inputSchema = readSchema(value["inputSchema"]);
  const outputSchema = readSchema(value["outputSchema"]);
  const agent = readAgent(value["agent"]);
  const mcp = readMcp(value["mcp"]);
  const skill = readSkill(value["skill"]);
  const memory = readMemory(value["memory"]);
  const plugin = readPlugin(value["plugin"]);
  const prompt = readPrompt(value["prompt"]);
  if (
    !id ||
    !name ||
    !isAssetKind(kind) ||
    !isAssetStatus(status) ||
    !limits ||
    !provenance ||
    !inputSchema ||
    !outputSchema
  )
    throw new Error("Editable asset is invalid.");
  return normalizeEditableAsset({
    id,
    kind,
    name,
    status,
    capabilities: readCapabilities(value["capabilities"]),
    permissions: readPermissions(value["permissions"]),
    inputSchema,
    outputSchema,
    limits,
    provenance,
    ...(agent ? { agent } : {}),
    ...(mcp ? { mcp } : {}),
    ...(skill ? { skill } : {}),
    ...(memory ? { memory } : {}),
    ...(plugin ? { plugin } : {}),
    ...(prompt ? { prompt } : {}),
  });
};

const readString = (
  record: Record<string, unknown>,
  key: string,
): string | undefined =>
  isNonEmptyString(record[key]) ? record[key].trim() : undefined;
const readCapabilities = (value: unknown): ReadonlyArray<AgentCapability> =>
  Array.isArray(value) ? value.filter(isAgentCapability) : [];
const readPermissions = (value: unknown): ReadonlyArray<AgentPermission> =>
  Array.isArray(value) ? value.filter(isAgentPermission) : [];
const readLimits = (
  value: unknown,
): EditableAssetRecord["limits"] | undefined =>
  isRecord(value) &&
  typeof value["executions"] === "number" &&
  typeof value["timeoutMs"] === "number"
    ? { executions: value["executions"], timeoutMs: value["timeoutMs"] }
    : undefined;
const readProvenance = (value: unknown): ArtifactProvenance | undefined =>
  isRecord(value) &&
  isNonEmptyString(value["source"]) &&
  isNonEmptyString(value["artifactFingerprint"]) &&
  isNonEmptyString(value["registeredAt"])
    ? {
        source: value["source"],
        artifactFingerprint: value["artifactFingerprint"],
        registeredAt: value["registeredAt"],
      }
    : undefined;
const readSchema = (value: unknown): VersionedJsonSchema | undefined =>
  isRecord(value) &&
  isNonEmptyString(value["id"]) &&
  typeof value["version"] === "number" &&
  isGovernanceSchema(value["schema"])
    ? { id: value["id"], version: value["version"], schema: value["schema"] }
    : undefined;
const readAgent = (value: unknown): EditableAssetRecord["agent"] | undefined =>
  isRecord(value) &&
  isNonEmptyString(value["providerId"]) &&
  isNonEmptyString(value["model"])
    ? {
        providerId: value["providerId"],
        model: value["model"],
        toolPermissions: readPermissions(value["toolPermissions"]),
      }
    : undefined;
const readMcp = (value: unknown): EditableAssetRecord["mcp"] | undefined =>
  isRecord(value) &&
  isNonEmptyString(value["serverId"]) &&
  isNonEmptyString(value["toolVersion"])
    ? {
        serverId: value["serverId"],
        toolVersion: value["toolVersion"],
        auditEvents: readAuditEvents(value["auditEvents"]),
      }
    : undefined;
const readSkill = (value: unknown): EditableAssetRecord["skill"] | undefined =>
  isRecord(value) &&
  typeof value["version"] === "number" &&
  isAssetStatus(value["lifecycle"])
    ? { version: value["version"], lifecycle: value["lifecycle"] }
    : undefined;
const readMemory = (
  value: unknown,
): EditableAssetRecord["memory"] | undefined =>
  isRecord(value) &&
  isNonEmptyString(value["tenantId"]) &&
  isNonEmptyString(value["workflowId"]) &&
  typeof value["optInIndexing"] === "boolean" &&
  typeof value["retentionDays"] === "number" &&
  typeof value["redactRetrievals"] === "boolean"
    ? {
        tenantId: value["tenantId"],
        workflowId: value["workflowId"],
        optInIndexing: value["optInIndexing"],
        retentionDays: value["retentionDays"],
        redactRetrievals: value["redactRetrievals"],
      }
    : undefined;
const readPlugin = (
  value: unknown,
): EditableAssetRecord["plugin"] | undefined =>
  isRecord(value) &&
  value["runtime"] === PluginRuntimeKind.Server &&
  value["isolation"] === "process"
    ? {
        runtime: PluginRuntimeKind.Server,
        isolation: "process",
        auditEvents: readAuditEvents(value["auditEvents"]),
      }
    : undefined;
const readPrompt = (
  value: unknown,
): EditableAssetRecord["prompt"] | undefined => {
  if (
    !isRecord(value) ||
    typeof value["activeVersion"] !== "number" ||
    !Array.isArray(value["versions"])
  ) {
    return undefined;
  }
  const versions = value["versions"].flatMap((candidate) => {
    const version = readPromptVersion(candidate);
    return version ? [version] : [];
  });
  return versions.length === value["versions"].length
    ? { activeVersion: value["activeVersion"], versions }
    : undefined;
};
const readPromptVersion = (value: unknown): PromptAssetVersion | undefined => {
  if (
    !isRecord(value) ||
    typeof value["version"] !== "number" ||
    !isNonEmptyString(value["template"]) ||
    !isNonEmptyString(value["createdAt"])
  ) {
    return undefined;
  }
  const provenance = readProvenance(value["provenance"]);
  if (!provenance || !Array.isArray(value["variables"])) return undefined;
  const variables = value["variables"].flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      !isNonEmptyString(candidate["name"]) ||
      typeof candidate["required"] !== "boolean"
    )
      return [];
    const schema = readSchema(candidate["schema"]);
    return schema
      ? [{ name: candidate["name"], required: candidate["required"], schema }]
      : [];
  });
  return variables.length === value["variables"].length
    ? {
        version: value["version"],
        template: value["template"],
        variables,
        provenance,
        createdAt: value["createdAt"],
      }
    : undefined;
};
const readAuditEvents = (value: unknown): ReadonlyArray<AssetAuditEvent> =>
  Array.isArray(value)
    ? value.flatMap((event) =>
        isRecord(event) &&
        isNonEmptyString(event["at"]) &&
        isNonEmptyString(event["action"]) &&
        isNonEmptyString(event["actorId"])
          ? [
              {
                at: event["at"],
                action: event["action"],
                actorId: event["actorId"],
              },
            ]
          : [],
      )
    : [];
const isAgentCapability = (value: unknown): value is AgentCapability =>
  typeof value === "string" &&
  Object.values(AgentCapability).some((candidate) => candidate === value);
const isAgentPermission = (value: unknown): value is AgentPermission =>
  typeof value === "string" &&
  Object.values(AgentPermission).some((candidate) => candidate === value);
const isGovernanceSchema = (
  value: unknown,
): value is VersionedJsonSchema["schema"] =>
  isRecord(value) &&
  (value["type"] === "array" ||
    value["type"] === "boolean" ||
    value["type"] === "number" ||
    value["type"] === "object" ||
    value["type"] === "string");

const assertDetails = (asset: EditableAssetRecord): void => {
  if (asset.kind === AssetKind.Agent && asset.agent) {
    assertString(asset.agent.providerId, "Agent provider is required");
    assertString(asset.agent.model, "Agent model is required");
    assertPermissions(asset.agent.toolPermissions);
  }
  if (asset.kind === AssetKind.McpTool && asset.mcp) {
    assertString(asset.mcp.serverId, "MCP server id is required");
    assertString(asset.mcp.toolVersion, "MCP tool version is required");
    assertAuditEvents(asset.mcp.auditEvents);
  }
  if (
    asset.kind === AssetKind.Skill &&
    asset.skill &&
    (!Number.isInteger(asset.skill.version) ||
      asset.skill.version < 1 ||
      !isAssetStatus(asset.skill.lifecycle))
  )
    throw new Error("Skill lifecycle is invalid.");
  if (asset.kind === AssetKind.MemorySource && asset.memory) {
    assertString(asset.memory.tenantId, "Memory tenant is required");
    assertString(asset.memory.workflowId, "Memory workflow is required");
    if (
      !Number.isInteger(asset.memory.retentionDays) ||
      asset.memory.retentionDays < 0
    )
      throw new Error("Memory retention is invalid.");
  }
  if (asset.kind === AssetKind.Plugin && asset.plugin) {
    if (asset.plugin.runtime !== PluginRuntimeKind.Server)
      throw new Error("Plugin runtime must be server.");
    if (asset.plugin.isolation !== "process")
      throw new Error("Plugin isolation must be process.");
    assertAuditEvents(asset.plugin.auditEvents);
  }
  if (asset.kind === AssetKind.Prompt) {
    if (!asset.prompt) throw new Error("Prompt versions are required.");
    assertPrompt(asset.prompt);
  }
};

const assertPrompt = (
  prompt: NonNullable<EditableAssetRecord["prompt"]>,
): void => {
  if (
    !Number.isInteger(prompt.activeVersion) ||
    prompt.activeVersion < 1 ||
    prompt.versions.length === 0
  )
    throw new Error("Prompt active version is invalid.");
  const versions = new Set<number>();
  for (const version of prompt.versions) {
    if (
      !Number.isInteger(version.version) ||
      version.version < 1 ||
      versions.has(version.version) ||
      !isNonEmptyString(version.template) ||
      !isNonEmptyString(version.createdAt)
    )
      throw new Error("Prompt version is invalid.");
    versions.add(version.version);
    assertProvenance(version.provenance);
    const variables = new Set<string>();
    for (const variable of version.variables) {
      if (!isNonEmptyString(variable.name) || variables.has(variable.name))
        throw new Error("Prompt variable is invalid.");
      variables.add(variable.name);
      assertSchema(variable.schema);
    }
  }
  if (!versions.has(prompt.activeVersion))
    throw new Error("Prompt active version is missing.");
};

const assertPromptUpdate = (
  existing: EditableAssetRecord | undefined,
  next: EditableAssetRecord,
): void => {
  if (next.kind !== AssetKind.Prompt || !next.prompt)
    throw new Error("Prompt asset kind is immutable.");
  if (!existing) return;
  if (existing.kind !== AssetKind.Prompt || !existing.prompt)
    throw new Error("Asset kind is immutable.");
  const nextByVersion = new Map(
    next.prompt.versions.map((version) => [version.version, version]),
  );
  for (const version of existing.prompt.versions) {
    const candidate = nextByVersion.get(version.version);
    if (!candidate || JSON.stringify(candidate) !== JSON.stringify(version))
      throw new Error("Prompt versions are immutable.");
  }
  const highestExisting = Math.max(
    ...existing.prompt.versions.map((version) => version.version),
  );
  const additions = next.prompt.versions.filter(
    (version) => version.version > highestExisting,
  );
  if (
    additions.length > 1 ||
    (additions.length === 1 && additions[0]?.version !== highestExisting + 1)
  )
    throw new Error("Prompt versions must be appended sequentially.");
};

const copyPromptVersion = (
  version: PromptAssetVersion,
): PromptAssetVersion => ({
  ...version,
  variables: version.variables.map((variable) => ({
    ...variable,
    schema: { ...variable.schema, schema: { ...variable.schema.schema } },
  })),
  provenance: { ...version.provenance },
});

const assertCapabilities = (values: ReadonlyArray<AgentCapability>): void => {
  if (!values.every((value) => Object.values(AgentCapability).includes(value)))
    throw new Error("Asset capabilities are invalid.");
};
const assertPermissions = (values: ReadonlyArray<AgentPermission>): void => {
  if (!values.every((value) => Object.values(AgentPermission).includes(value)))
    throw new Error("Asset permissions are invalid.");
};
const assertSchema = (schema: VersionedJsonSchema): void => {
  if (
    !schema ||
    !schema.id ||
    !Number.isInteger(schema.version) ||
    schema.version < 1 ||
    !schema.schema
  )
    throw new Error("Asset schema is invalid.");
};
const assertProvenance = (provenance: ArtifactProvenance): void => {
  assertString(provenance.source, "Asset provenance source is required");
  assertString(
    provenance.artifactFingerprint,
    "Asset provenance fingerprint is required",
  );
  assertString(
    provenance.registeredAt,
    "Asset provenance registration is required",
  );
};
const assertAuditEvents = (events: ReadonlyArray<AssetAuditEvent>): void => {
  if (
    !events.every(
      (event) =>
        event &&
        isNonEmptyString(event.at) &&
        isNonEmptyString(event.action) &&
        isNonEmptyString(event.actorId),
    )
  )
    throw new Error("Asset audit event is invalid.");
};
const assertString = (value: string, message: string): void => {
  if (!isNonEmptyString(value)) throw new Error(`${message}.`);
};
const isAssetKind = (value: unknown): value is AssetKind =>
  typeof value === "string" &&
  Object.values(AssetKind).includes(value as AssetKind);
const isAssetStatus = (value: unknown): value is AssetStatus =>
  typeof value === "string" &&
  Object.values(AssetStatus).includes(value as AssetStatus);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
