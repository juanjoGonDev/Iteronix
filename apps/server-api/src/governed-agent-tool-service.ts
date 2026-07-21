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

export type GovernedAgentToolService = {
  registerPlugin: (plugin: RegisteredServerPlugin) => void;
  registerSkill: (skill: SkillDefinition) => void;
  invoke: (input: GovernedSkillInvocation) => Promise<GovernedSkillResult>;
};

type RegisteredServerPlugin = {
  manifest: ServerPluginManifest;
  agentId: string;
  invoke: (input: {
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
  memoryScope: MemoryScope;
  now: string;
};

type GovernedSkillResult = {
  output: JsonValue;
  retrievals: ReadonlyArray<MemoryRetrieval>;
};

export const createGovernedAgentToolService = (
  persistence: GovernanceLifecyclePersistencePort,
  rag: RagPort,
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
      const retrievals = await rag.retrieve({
        scope: createMemoryScope(input.memoryScope),
        query: readQuery(input.input),
        limit: MaxRagRetrievals,
      });
      await persistRetrievalExecution(persistence, lifecycle.id, {
        assetId: input.memoryScope.sourceId ?? "none",
        scope: `${input.memoryScope.tenantId}:${input.memoryScope.workflowId}`,
        workflowId: input.memoryScope.workflowId,
        documentCount: retrievals.length,
        provenanceFingerprint: fingerprint(
          retrievals.map(
            (retrieval) => retrieval.provenance.documentFingerprint,
          ),
        ),
        redacted: true,
        timestamp: input.now,
      });
      const response = await plugin.invoke({
        toolId: skill.id,
        input: input.input,
        provenance: skill.provenance,
      });
      const validated = validateMcpToolResult(response, skill.outputSchema);
      if (!validated.valid || validated.output === undefined) {
        throw new Error("MCP output failed schema validation.");
      }
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
        timestamp: input.now,
      });
      return { output: validated.output, retrievals };
    },
  };
};

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

const assertInvocation = (
  lifecycle: GovernanceLifecycle,
  skill: SkillDefinition,
  plugin: RegisteredServerPlugin,
  input: GovernedSkillInvocation,
): void => {
  if (lifecycle.state !== GovernanceLifecycleState.Executing) {
    throw new Error("Agent executions require an executing lifecycle.");
  }
  if (input.memoryScope.workflowId !== lifecycle.workflowId) {
    throw new Error("Memory scope workflow must match the lifecycle.");
  }
  if (!input.memoryScope.enabled) {
    throw new Error("Memory scope must be enabled for governed retrieval.");
  }
  if (!hasPermissions(input.grantedPermissions, skill.requiredPermissions)) {
    throw new Error("Skill permissions were not granted.");
  }
  if (!hasPermissions(input.grantedPermissions, plugin.manifest.permissions)) {
    throw new Error("Plugin permissions were not granted.");
  }
  if (!validateVersionedJsonSchema(skill.inputSchema, input.input).valid) {
    throw new Error("Skill input failed schema validation.");
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
