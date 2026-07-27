import {
  createMemoryScope,
  createSkillDefinition,
  validateMcpToolResult,
  validatePluginManifest,
  type AgentPermission,
  type ArtifactProvenance,
  type McpToolResult,
  type MemoryRetrieval,
  type MemoryScope,
  type RagPort,
  type ServerPluginManifest,
  type SkillDefinition,
} from "../../../packages/domain/src/agent-tool-contracts";
import {
  GovernanceLifecycleState,
  recordGovernanceAgentExecution,
  recordGovernanceRetrievalExecution,
  type GovernanceAgentExecutionRecord,
  type GovernanceLifecycle,
} from "../../../packages/domain/src/governance-lifecycle";
import {
  validateVersionedJsonSchema,
  type JsonValue,
} from "../../../packages/domain/src/governance-validation";
import type { GovernanceLifecyclePersistencePort } from "./governance-lifecycle-persistence-port";
import type { McpConnectionBinding } from "./mcp-connection-port";

export type GovernedAgentToolService = {
  registerPlugin: (plugin: RegisteredServerPlugin) => void;
  registerSkill: (skill: SkillDefinition) => void;
  invoke: (input: GovernedSkillInvocation) => Promise<GovernedSkillResult>;
  invokePlugin: (
    input: GovernedPluginInvocation,
  ) => Promise<GovernedSkillResult>;
};

type RegisteredServerPlugin = {
  manifest: ServerPluginManifest;
  agentId: string;
  invoke: (input: {
    connection?: McpConnectionBinding;
    toolId: string;
    input: JsonValue;
    provenance: ArtifactProvenance;
  }) => Promise<McpToolResult>;
};

type GovernedSkillInvocation = {
  lifecycleId: string;
  skillId: string;
  skillVersion?: number;
  input: JsonValue;
  grantedPermissions: ReadonlyArray<AgentPermission>;
  memoryScope?: MemoryScope;
  mcpConnection?: McpConnectionBinding;
  now: string;
};

type GovernedSkillResult = {
  output: JsonValue;
  retrievals: ReadonlyArray<MemoryRetrieval>;
};

type GovernedPluginInvocation = {
  lifecycleId: string;
  pluginAssetId: string;
  pluginVersion: string;
  input: JsonValue;
  grantedPermissions: ReadonlyArray<AgentPermission>;
  now: string;
};

export const createGovernedAgentToolService = (
  persistence: GovernanceLifecyclePersistencePort,
  rag: RagPort,
  auditPlugin?: (input: {
    assetId: string;
    action: string;
    at: string;
  }) => Promise<void>,
): GovernedAgentToolService => {
  const plugins = new Map<string, RegisteredServerPlugin>();
  const skills = new Map<string, SkillDefinition>();
  return {
    registerPlugin: (plugin) => registerPlugin(plugins, plugin),
    registerSkill: (skill) => registerSkill(skills, skill),
    invoke: async (input) => {
      const lifecycle = readLifecycle(persistence, input.lifecycleId);
      const skill = readSkill(skills, input.skillId, input.skillVersion);
      const plugin = readPluginForSkill(plugins, skill.id);
      assertInvocation(lifecycle, skill, plugin, input);
      const retrievals = input.memoryScope
        ? await retrieveAndPersist(persistence, rag, lifecycle.id, input)
        : [];
      const response = await plugin.invoke({
        ...(input.mcpConnection ? { connection: input.mcpConnection } : {}),
        toolId: skill.id,
        input: input.input,
        provenance: skill.provenance,
      });
      const validated = validateMcpToolResult(response, skill.outputSchema);
      if (!validated.valid || validated.output === undefined) {
        throw new Error("MCP output failed schema validation.");
      }
      assertMcpResponseToolId(skill.id, response.toolId);
      assertMcpConnectionResponse(input.mcpConnection, response);
      await persistExecution(persistence, lifecycle.id, {
        id: `${lifecycle.id}:agent:${(lifecycle.agentExecutions.length + 1).toString()}`,
        lifecycleId: lifecycle.id,
        agentId: plugin.agentId,
        pluginId: plugin.manifest.id,
        skillId: skill.id,
        skillVersion: skill.version,
        toolId: skill.id,
        inputFingerprint: fingerprint(input.input),
        outputFingerprint: fingerprint(validated.output),
        artifactFingerprint: skill.provenance.artifactFingerprint,
        responseFingerprint: response.provenance.responseFingerprint,
        ...pluginExecutionProvenance(plugin),
        ...(input.mcpConnection
          ? {
              mcpAssetId: input.mcpConnection.assetId,
              mcpServerId: input.mcpConnection.serverId,
              mcpToolVersion: input.mcpConnection.toolVersion,
            }
          : {}),
        timestamp: input.now,
      });
      return { output: validated.output, retrievals };
    },
    invokePlugin: async (input) => {
      const lifecycle = readLifecycle(persistence, input.lifecycleId);
      const plugin = readPinnedPlugin(
        plugins,
        input.pluginAssetId,
        input.pluginVersion,
      );
      const tool = plugin.manifest.tools[0];
      if (!tool) {
        throw new Error("Plugin manifest does not declare a tool.");
      }
      assertPluginInvocation(lifecycle, plugin, tool, input);
      try {
        const response = await plugin.invoke({
          toolId: tool.id,
          input: input.input,
          provenance: {
            source: `plugin:${input.pluginAssetId}`,
            artifactFingerprint: plugin.manifest.audit.manifestFingerprint,
            registeredAt: plugin.manifest.audit.publishedAt,
          },
        });
        const validated = validateMcpToolResult(response, tool.outputSchema);
        if (!validated.valid || validated.output === undefined) {
          throw new Error("Plugin output failed schema validation.");
        }
        await persistExecution(persistence, lifecycle.id, {
          id: `${lifecycle.id}:agent:${(lifecycle.agentExecutions.length + 1).toString()}`,
          lifecycleId: lifecycle.id,
          agentId: plugin.agentId,
          pluginId: plugin.manifest.id,
          skillId: tool.id,
          skillVersion: 1,
          toolId: tool.id,
          inputFingerprint: fingerprint(input.input),
          outputFingerprint: fingerprint(validated.output),
          artifactFingerprint: plugin.manifest.audit.manifestFingerprint,
          responseFingerprint: response.provenance.responseFingerprint,
          ...pluginExecutionProvenance(plugin),
          timestamp: input.now,
        });
        await auditPlugin?.({
          assetId: input.pluginAssetId,
          action: "executed",
          at: input.now,
        });
        return { output: validated.output, retrievals: [] };
      } catch (error) {
        await auditPlugin?.({
          assetId: input.pluginAssetId,
          action: "failed",
          at: input.now,
        });
        throw error;
      }
    },
  };
};

const PluginAssetPrefix = "plugin:";

const pluginExecutionProvenance = (
  plugin: RegisteredServerPlugin,
): Partial<GovernanceAgentExecutionRecord> =>
  plugin.manifest.id.startsWith(PluginAssetPrefix)
    ? {
        pluginAssetId: plugin.manifest.id.slice(PluginAssetPrefix.length),
        pluginVersion: plugin.manifest.version,
        pluginFingerprint: plugin.manifest.audit.manifestFingerprint,
        pluginIsolation: plugin.manifest.isolation,
        pluginAuditAction: "invoked",
      }
    : {};

const MaxRagRetrievals = 10;

const registerPlugin = (
  plugins: Map<string, RegisteredServerPlugin>,
  plugin: RegisteredServerPlugin,
): void => {
  const validation = validatePluginManifest(plugin.manifest);
  if (!validation.valid) {
    throw new Error("Plugin manifest is invalid.");
  }
  if (plugin.agentId.trim().length === 0) {
    throw new Error("Plugin agent id is required.");
  }
  plugins.set(plugin.manifest.id, plugin);
};

const registerSkill = (
  skills: Map<string, SkillDefinition>,
  skill: SkillDefinition,
): void => {
  const registered = createSkillDefinition(skill);
  skills.set(skillKey(registered.id, registered.version), registered);
};

const readLifecycle = (
  persistence: GovernanceLifecyclePersistencePort,
  lifecycleId: string,
): GovernanceLifecycle => {
  const lifecycle = persistence
    .read()
    .governanceLifecycles.find((candidate) => candidate.id === lifecycleId);
  if (!lifecycle) {
    throw new Error(`Governance lifecycle ${lifecycleId} was not found.`);
  }
  return lifecycle;
};

const readSkill = (
  skills: ReadonlyMap<string, SkillDefinition>,
  skillId: string,
  skillVersion?: number,
): SkillDefinition => {
  const skill = skills.get(
    skillKey(skillId, skillVersion ?? readLatestVersion(skills, skillId)),
  );
  if (!skill) {
    throw new Error(`Skill ${skillId} was not registered.`);
  }
  return skill;
};

const readLatestVersion = (
  skills: ReadonlyMap<string, SkillDefinition>,
  skillId: string,
): number => {
  const versions = [...skills.values()]
    .filter((skill) => skill.id === skillId)
    .map((skill) => skill.version);
  const version = Math.max(...versions);
  if (!Number.isFinite(version))
    throw new Error(`Skill ${skillId} was not registered.`);
  return version;
};

const skillKey = (skillId: string, version: number): string =>
  `${skillId}@${version}`;

const readPluginForSkill = (
  plugins: ReadonlyMap<string, RegisteredServerPlugin>,
  skillId: string,
): RegisteredServerPlugin => {
  const plugin = [...plugins.values()].find((candidate) =>
    candidate.manifest.tools.some((tool) => tool.id === skillId),
  );
  if (!plugin) {
    throw new Error(`No registered plugin provides skill ${skillId}.`);
  }
  return plugin;
};

const readPinnedPlugin = (
  plugins: ReadonlyMap<string, RegisteredServerPlugin>,
  assetId: string,
  version: string,
): RegisteredServerPlugin => {
  const plugin = plugins.get(`${PluginAssetPrefix}${assetId}`);
  if (!plugin) {
    throw new Error("Plugin asset is unavailable.");
  }
  if (plugin.manifest.version !== version) {
    throw new Error("Plugin pin does not match the persisted asset.");
  }
  return plugin;
};

const assertInvocation = (
  lifecycle: GovernanceLifecycle,
  skill: SkillDefinition,
  plugin: RegisteredServerPlugin,
  input: GovernedSkillInvocation,
): void => {
  if (lifecycle.state !== GovernanceLifecycleState.Executing) {
    throw new Error("Agent executions require an executing lifecycle.");
  }
  if (
    input.memoryScope &&
    input.memoryScope.workflowId !== lifecycle.workflowId
  ) {
    throw new Error("Memory scope workflow must match the lifecycle.");
  }
  if (input.memoryScope && !input.memoryScope.enabled) {
    throw new Error("Memory scope must be enabled for governed retrieval.");
  }
  if (!hasPermissions(input.grantedPermissions, skill.requiredPermissions)) {
    throw new Error("Skill permissions were not granted.");
  }
  if (!hasPermissions(input.grantedPermissions, plugin.manifest.permissions)) {
    throw new Error("Plugin permissions were not granted.");
  }
  if (
    input.mcpConnection &&
    !hasPermissions(input.grantedPermissions, ["mcp.invoke"])
  ) {
    throw new Error("MCP permission was not granted.");
  }
  if (!validateVersionedJsonSchema(skill.inputSchema, input.input).valid) {
    throw new Error("Skill input failed schema validation.");
  }
};

const assertPluginInvocation = (
  lifecycle: GovernanceLifecycle,
  plugin: RegisteredServerPlugin,
  tool: ServerPluginManifest["tools"][number],
  input: GovernedPluginInvocation,
): void => {
  if (lifecycle.state !== GovernanceLifecycleState.Executing) {
    throw new Error("Plugin executions require an executing lifecycle.");
  }
  if (!hasPermissions(input.grantedPermissions, plugin.manifest.permissions)) {
    throw new Error("Plugin permissions were not granted.");
  }
  if (!validateVersionedJsonSchema(tool.inputSchema, input.input).valid) {
    throw new Error("Plugin input failed schema validation.");
  }
};

const retrieveAndPersist = async (
  persistence: GovernanceLifecyclePersistencePort,
  rag: RagPort,
  lifecycleId: string,
  input: GovernedSkillInvocation,
): Promise<ReadonlyArray<MemoryRetrieval>> => {
  const scope = createMemoryScope(input.memoryScope!);
  const retrievals = await rag.retrieve({
    scope,
    query: readQuery(input.input),
    limit: MaxRagRetrievals,
  });
  await persistRetrievalExecution(persistence, lifecycleId, {
    assetId: scope.sourceId ?? "none",
    scope: `${scope.tenantId}:${scope.workflowId}`,
    workflowId: scope.workflowId,
    documentCount: retrievals.length,
    provenanceFingerprint: fingerprint(
      retrievals.map((retrieval) => retrieval.provenance.documentFingerprint),
    ),
    redacted: true,
    timestamp: input.now,
  });
  return retrievals;
};

const assertMcpConnectionResponse = (
  connection: GovernedSkillInvocation["mcpConnection"],
  response: McpToolResult,
): void => {
  if (!connection) return;
  if (
    response.provenance.serverId !== connection.serverId ||
    response.provenance.toolVersion !== connection.toolVersion
  ) {
    throw new Error(
      "MCP response provenance does not match the pinned connection.",
    );
  }
};

const assertMcpResponseToolId = (
  requestedToolId: string,
  responseToolId: string,
): void => {
  if (requestedToolId !== responseToolId) {
    throw new Error("MCP response tool does not match the requested tool.");
  }
};

const hasPermissions = (
  granted: ReadonlyArray<AgentPermission>,
  required: ReadonlyArray<AgentPermission>,
): boolean => required.every((permission) => granted.includes(permission));

const readQuery = (input: JsonValue): string => {
  if (isJsonRecord(input) && typeof input["query"] === "string") {
    return input["query"];
  }
  return "";
};

const persistExecution = async (
  persistence: GovernanceLifecyclePersistencePort,
  lifecycleId: string,
  record: GovernanceAgentExecutionRecord,
): Promise<void> => {
  await persistence.mutateGovernanceLifecycles((lifecycles) =>
    lifecycles.map((lifecycle) =>
      lifecycle.id === lifecycleId
        ? recordGovernanceAgentExecution(lifecycle, record)
        : lifecycle,
    ),
  );
};

const persistRetrievalExecution = async (
  persistence: GovernanceLifecyclePersistencePort,
  lifecycleId: string,
  record: Parameters<typeof recordGovernanceRetrievalExecution>[1],
): Promise<void> => {
  await persistence.mutateGovernanceLifecycles((lifecycles) =>
    lifecycles.map((lifecycle) =>
      lifecycle.id === lifecycleId
        ? recordGovernanceRetrievalExecution(lifecycle, record)
        : lifecycle,
    ),
  );
};

const fingerprint = (value: JsonValue): string => {
  const source = stableJson(value);
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const stableJson = (value: JsonValue): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isJsonRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key]!)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const isJsonRecord = (
  value: JsonValue,
): value is { readonly [key: string]: JsonValue } =>
  typeof value === "object" && value !== null && !Array.isArray(value);
