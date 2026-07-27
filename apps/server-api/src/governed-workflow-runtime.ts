import {
  createWorkflowRuntime,
  type GovernedNodeExecutionRequest,
  type WorkflowProviderRunResult,
} from "../../../packages/agents/src/workflow-runtime";
import {
  createGovernedAgentToolService,
  type GovernedAgentToolService,
} from "./governed-agent-tool-service";
import {
  createMemoryScope,
  McpToolResultStatus,
  type ArtifactProvenance,
  type McpToolResult,
  type MemoryScope,
  type RagPort,
} from "../../../packages/domain/src/agent-tool-contracts";
import type { JsonValue } from "../../../packages/domain/src/governance-validation";
import {
  type GovernanceFingerprints,
  type GovernanceLifecycle,
  type GovernanceBudgetLimits,
} from "../../../packages/domain/src/governance-lifecycle";
import {
  type WorkflowAssetRecord,
  type WorkflowDefinitionRecord,
  type WorkflowExecutionRecord,
} from "../../../packages/shared/src/workflows";
import type { ApplicationState } from "./application-state";
import {
  AssetKind,
  AssetStatus,
  type EditableAssetRecord,
} from "./editable-assets";
import type { GovernanceLifecyclePersistencePort } from "./governance-lifecycle-persistence-port";
import {
  executeProviderNode,
  resolveProviderProfile,
  resolveWorkflowPromptAssets,
} from "./workflow-runtime";
import {
  createLocalMcpConnectionPort,
  type McpConnectionBinding,
  type ServerMcpConnectionPort,
} from "./mcp-connection-port";
import type { GovernanceLifecycleService } from "./governance-lifecycle-service";
import type {
  TrustedPluginRegistry,
  TrustedPluginRegistrySnapshot,
} from "./server-plugin-runtime";

export type GovernedWorkflowRuntimeService = {
  runGovernedWorkflow: (input: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    lifecycleInput: {
      id: string;
      workflowId: string;
      fingerprints: GovernanceFingerprints;
      limits: GovernanceBudgetLimits;
    };
    grantedPermissions: ReadonlyArray<string>;
    memoryScope: MemoryScope;
    now: string;
  }) => Promise<{
    execution: WorkflowExecutionRecord;
    lifecycle: GovernanceLifecycle;
  }>;
};

export const createGovernedWorkflowRuntimeService = (input: {
  readApplicationState: () => ApplicationState;
  lifecycleService: GovernanceLifecycleService;
  persistence: GovernanceLifecyclePersistencePort;
  rag: RagPort;
  invoke: (input: {
    toolId: string;
    input: JsonValue;
    provenance: ArtifactProvenance;
  }) => Promise<McpToolResult>;
  agentId: string;
  pluginRegistry?: TrustedPluginRegistry;
  now?: () => Date;
}): GovernedWorkflowRuntimeService => {
  const now = input.now ?? (() => new Date());
  const mcp = createLocalMcpConnectionPort({ invoke: input.invoke });

  const runGovernedWorkflow = async (workflowInput: {
    definition: WorkflowDefinitionRecord;
    assets: ReadonlyArray<WorkflowAssetRecord>;
    lifecycleInput: {
      id: string;
      workflowId: string;
      fingerprints: GovernanceFingerprints;
      limits: GovernanceBudgetLimits;
    };
    grantedPermissions: ReadonlyArray<string>;
    memoryScope: MemoryScope;
    now: string;
  }): Promise<{
    execution: WorkflowExecutionRecord;
    lifecycle: GovernanceLifecycle;
  }> => {
    const state = input.readApplicationState();
    const governedService = createGovernedAgentToolService(
      input.persistence,
      input.rag,
    );
    registerSkillsAndPlugins(
      governedService,
      state,
      input.agentId,
      mcp,
      input.pluginRegistry?.createSnapshot(state.editableAssets.records),
    );

    const resolved = resolveWorkflowPromptAssets(
      workflowInput.definition,
      state,
    );

    const lifecycle = await createLifecycle(
      input.lifecycleService,
      workflowInput,
    );
    const lifecycleId = lifecycle.id;

    const memoryScope = createMemoryScope({
      tenantId: workflowInput.memoryScope.tenantId,
      workflowId: workflowInput.memoryScope.workflowId,
      enabled: workflowInput.memoryScope.enabled,
      retentionDays: workflowInput.memoryScope.retentionDays,
    });

    let executionResult: WorkflowExecutionRecord | undefined;

    await input.lifecycleService.executeBoundedPass({
      lifecycleId,
      execute: async () => {
        const runtime = createWorkflowRuntime({
          now,
          resolveWorkflowInvocation: (invocation) => {
            const definition = state.workflows.definitionVersions?.find(
              (record) =>
                record.workflowId === invocation.workflowId &&
                record.version === invocation.workflowVersion,
            )?.snapshot;
            if (!definition) return undefined;
            return { definition };
          },
          runGovernedNode: createRunGovernedNodeCallback({
            governedService,
            lifecycleId,
            grantedPermissions: workflowInput.grantedPermissions,
            memoryScope,
            resolveMcpConnection: (connection) =>
              resolveMcpConnection(state, connection),
            resolveMcpConnectionForSkill: (assetId) =>
              resolveMcpConnectionForSkill(state, assetId),
            now,
          }),
          runProviderNode: async (request) =>
            executeProviderNode(
              request,
              resolveProviderProfile(
                state,
                request.node.config.provider?.providerId,
              ),
            ),
        });

        executionResult = await runtime.runDefinition({
          definition: resolved.definition,
          assets: workflowInput.assets,
        });
      },
      now: (step: number) => {
        const date = new Date(workflowInput.now);
        date.setSeconds(date.getSeconds() + step);
        return date.toISOString();
      },
    });

    const finalLifecycle = input.lifecycleService.read(lifecycleId);
    if (!finalLifecycle) {
      throw new Error("Governance lifecycle was lost after bounded pass.");
    }

    return {
      execution: executionResult ?? {
        id: "governed-execution",
        workflowId: workflowInput.definition.id,
        triggerKind: workflowInput.definition.trigger.kind,
        status: "failed",
        startedAt: now().toISOString(),
        finishedAt: now().toISOString(),
        durationMs: 0,
        warningsCount: 0,
        errorsCount: 0,
        totals: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostEur: 0,
          latencyMs: 0,
        },
        contextSessionId: "governed-run",
        nodeRuns: [],
      },
      lifecycle: finalLifecycle,
    };
  };

  return { runGovernedWorkflow };
};

export const registerSkillsAndPlugins = (
  governedService: GovernedAgentToolService,
  state: ApplicationState,
  agentId: string,
  mcp:
    | ServerMcpConnectionPort
    | ((input: {
        toolId: string;
        input: JsonValue;
        provenance: ArtifactProvenance;
      }) => Promise<McpToolResult>),
  pluginRegistry?: TrustedPluginRegistrySnapshot,
): void => {
  const connectionPort =
    typeof mcp === "function"
      ? createLocalMcpConnectionPort({ invoke: mcp })
      : mcp;
  const plugins = state.editableAssets.records.filter(
    (asset) => asset.kind === AssetKind.Plugin && asset.plugin,
  );
  const skills = state.editableAssets.records.filter(
    (asset) =>
      asset.kind === AssetKind.Skill &&
      asset.status === AssetStatus.Enabled &&
      asset.skill?.lifecycle === AssetStatus.Enabled,
  );
  const mcpTools = state.editableAssets.records.filter(
    (asset) =>
      asset.kind === AssetKind.McpTool &&
      asset.status === AssetStatus.Enabled &&
      asset.mcp !== undefined,
  );

  for (const skill of skills) {
    if (!skill.skill) continue;
    const versions = skill.skill.versions ?? [
      {
        version: skill.skill.version,
        capabilities: skill.capabilities,
        permissions: skill.permissions,
        inputSchema: skill.inputSchema,
        outputSchema: skill.outputSchema,
        limits: skill.limits,
        provenance: skill.provenance,
        createdAt: skill.provenance.registeredAt,
      },
    ];
    for (const version of versions) {
      governedService.registerSkill({
        id: skill.id,
        version: version.version,
        description: skill.name,
        inputSchema: version.inputSchema,
        outputSchema: version.outputSchema,
        requiredPermissions: [...version.permissions],
        provenance: {
          source: `asset:${skill.id}`,
          artifactFingerprint: version.provenance.artifactFingerprint,
          registeredAt: version.provenance.registeredAt,
        },
      });
    }
    registerStandaloneSkill(governedService, skill, agentId, connectionPort);
  }

  for (const plugin of plugins) {
    registerDirectPlugin(governedService, plugin, agentId, pluginRegistry);
  }

  for (const mcpTool of mcpTools) {
    governedService.registerSkill({
      id: mcpTool.id,
      version: 1,
      description: mcpTool.name,
      inputSchema: mcpTool.inputSchema,
      outputSchema: mcpTool.outputSchema,
      requiredPermissions: [...mcpTool.permissions],
      provenance: mcpTool.provenance,
    });
    governedService.registerPlugin({
      manifest: {
        id: `mcp:${mcpTool.id}`,
        version: mcpTool.mcp!.toolVersion,
        runtime: "server",
        isolation: "process",
        permissions: [...mcpTool.permissions],
        tools: [
          {
            id: mcpTool.id,
            inputSchema: mcpTool.inputSchema,
            outputSchema: mcpTool.outputSchema,
          },
        ],
        audit: {
          manifestFingerprint: mcpTool.provenance.artifactFingerprint,
          publishedAt: mcpTool.provenance.registeredAt,
        },
      },
      agentId,
      invoke: (request) =>
        connectionPort.invoke({
          connection: request.connection ?? {
            assetId: mcpTool.id,
            serverId: mcpTool.mcp!.serverId,
            toolVersion: mcpTool.mcp!.toolVersion,
          },
          toolId: request.toolId,
          input: request.input,
          provenance: request.provenance,
        }),
    });
  }
};

const registerDirectPlugin = (
  governedService: GovernedAgentToolService,
  plugin: EditableAssetRecord,
  agentId: string,
  registry: TrustedPluginRegistrySnapshot | undefined,
): void => {
  if (!registry || plugin.status !== AssetStatus.Enabled || !plugin.plugin) {
    return;
  }
  const version = 1;
  governedService.registerPlugin({
    manifest: {
      id: `plugin:${plugin.id}`,
      version: version.toString(),
      runtime: plugin.plugin.runtime,
      isolation: plugin.plugin.isolation,
      permissions: plugin.permissions,
      tools: [
        {
          id: plugin.id,
          inputSchema: plugin.inputSchema,
          outputSchema: plugin.outputSchema,
        },
      ],
      audit: {
        manifestFingerprint: plugin.provenance.artifactFingerprint,
        publishedAt: plugin.provenance.registeredAt,
      },
    },
    agentId,
    invoke: async (request) => ({
      toolId: request.toolId,
      status: McpToolResultStatus.Success,
      output: await registry.invoke({
        assetId: plugin.id,
        version: version.toString(),
        input: request.input,
      }),
      provenance: {
        serverId: plugin.id,
        toolVersion: version.toString(),
        responseFingerprint: plugin.provenance.artifactFingerprint,
      },
    }),
  });
};

const PluginProvenancePrefix = "plugin:";
const StandaloneSkillProviderPrefix = "skill:";
const StandaloneSkillProviderServerId = "local-skill-provider";

const registerStandaloneSkill = (
  governedService: GovernedAgentToolService,
  skill: EditableAssetRecord,
  agentId: string,
  connectionPort: ServerMcpConnectionPort,
): void => {
  if (
    !skill.skill ||
    skill.provenance.source.startsWith(PluginProvenancePrefix)
  ) {
    return;
  }
  const version = skill.skill.version.toString();
  governedService.registerPlugin({
    manifest: {
      id: `${StandaloneSkillProviderPrefix}${skill.id}`,
      version,
      runtime: "server",
      isolation: "process",
      permissions: [...skill.permissions],
      tools: [
        {
          id: skill.id,
          inputSchema: skill.inputSchema,
          outputSchema: skill.outputSchema,
        },
      ],
      audit: {
        manifestFingerprint: skill.provenance.artifactFingerprint,
        publishedAt: skill.provenance.registeredAt,
      },
    },
    agentId,
    invoke: (request) =>
      connectionPort.invoke({
        connection: request.connection ?? {
          assetId: skill.id,
          serverId: StandaloneSkillProviderServerId,
          toolVersion: version,
        },
        toolId: request.toolId,
        input: request.input,
        provenance: request.provenance,
      }),
  });
};

export const createRunGovernedNodeCallback = (input: {
  governedService: GovernedAgentToolService;
  lifecycleId: string;
  grantedPermissions: ReadonlyArray<string>;
  memoryScope: MemoryScope;
  resolveMemoryScope?: (sourceId: string) => MemoryScope;
  resolveMcpConnection?: (connection: {
    assetId: string;
    serverId: string;
    toolVersion: string;
  }) => {
    assetId: string;
    serverId: string;
    toolVersion: string;
    timeoutMs: number;
  };
  resolveMcpConnectionForSkill?: (
    assetId: string,
  ) => McpConnectionBinding | undefined;
  now: () => Date;
}): ((
  request: GovernedNodeExecutionRequest,
) => Promise<WorkflowProviderRunResult>) => {
  return async (governedRequest) => {
    const node = governedRequest.node;
    if (node.config.pluginAsset) {
      const result = await input.governedService.invokePlugin({
        lifecycleId: input.lifecycleId,
        pluginAssetId: node.config.pluginAsset.assetId,
        pluginVersion: node.config.pluginAsset.version,
        input: governedRequest.inputValue as unknown as JsonValue,
        grantedPermissions: (node.config.grantedPermissions ??
          input.grantedPermissions) as Parameters<
          GovernedAgentToolService["invokePlugin"]
        >[0]["grantedPermissions"],
        now: input.now().toISOString(),
      });
      return toWorkflowProviderRunResult(result.output);
    }
    const skillId = node.config.skillAsset?.assetId ?? node.config.skillId;
    if (!skillId && !node.config.mcpConnection) {
      throw new Error(`Governed node ${node.id} is missing a skillId.`);
    }
    const mcpConnection = node.config.mcpConnection
      ? input.resolveMcpConnection
        ? input.resolveMcpConnection(node.config.mcpConnection)
        : node.config.mcpConnection
      : skillId
        ? input.resolveMcpConnectionForSkill?.(skillId)
        : undefined;
    const sourceId = node.config.memorySourceId;
    const memoryScope = sourceId
      ? (input.resolveMemoryScope?.(sourceId) ?? {
          ...input.memoryScope,
          sourceId,
        })
      : input.memoryScope;
    const result = await input.governedService.invoke({
      lifecycleId: input.lifecycleId,
      skillId: skillId ?? node.config.mcpConnection!.assetId,
      ...(node.config.skillAsset
        ? { skillVersion: node.config.skillAsset.version }
        : {}),
      input: governedRequest.inputValue as unknown as JsonValue,
      grantedPermissions: (node.config.grantedPermissions ??
        input.grantedPermissions) as unknown as Parameters<
        GovernedAgentToolService["invoke"]
      >[0]["grantedPermissions"],
      ...(sourceId || (skillId && !mcpConnection) ? { memoryScope } : {}),
      ...(mcpConnection
        ? {
            mcpConnection,
          }
        : {}),
      now: input.now().toISOString(),
    });
    return toWorkflowProviderRunResult(result.output);
  };
};

const toWorkflowProviderRunResult = (
  output: JsonValue,
): WorkflowProviderRunResult => ({
  outputText: typeof output === "string" ? output : JSON.stringify(output),
  outputSnapshot: output,
  alerts: [],
  citations: [],
});

export const resolveMcpConnection = (
  state: ApplicationState,
  connection: { assetId: string; serverId: string; toolVersion: string },
): {
  assetId: string;
  serverId: string;
  toolVersion: string;
  timeoutMs: number;
} => {
  const asset = state.editableAssets.records.find(
    (candidate) => candidate.id === connection.assetId,
  );
  if (
    !asset ||
    asset.kind !== AssetKind.McpTool ||
    asset.status !== AssetStatus.Enabled ||
    !asset.mcp
  ) {
    throw new Error("MCP connection asset is unavailable.");
  }
  if (
    !asset.capabilities.includes("mcp") ||
    !asset.permissions.includes("mcp.invoke")
  ) {
    throw new Error("MCP connection asset is not authorized for invocation.");
  }
  if (
    asset.mcp.serverId !== connection.serverId ||
    asset.mcp.toolVersion !== connection.toolVersion
  ) {
    throw new Error("MCP connection pin does not match the persisted asset.");
  }
  return { ...connection, timeoutMs: asset.limits.timeoutMs };
};

export const resolveMcpConnectionForSkill = (
  state: ApplicationState,
  assetId: string,
): McpConnectionBinding | undefined => {
  const asset = state.editableAssets.records.find(
    (candidate) => candidate.id === assetId,
  );
  if (!asset || asset.kind !== AssetKind.McpTool) {
    return undefined;
  }
  if (!asset.mcp) {
    throw new Error("MCP connection asset is unavailable.");
  }
  return resolveMcpConnection(state, {
    assetId: asset.id,
    serverId: asset.mcp.serverId,
    toolVersion: asset.mcp.toolVersion,
  });
};

const createLifecycle = async (
  service: GovernanceLifecycleService,
  input: {
    lifecycleInput: {
      id: string;
      workflowId: string;
      fingerprints: GovernanceFingerprints;
      limits: GovernanceBudgetLimits;
    };
    now: string;
  },
): Promise<GovernanceLifecycle> => {
  const draft = await service.begin({
    id: input.lifecycleInput.id,
    workflowId: input.lifecycleInput.workflowId,
    fingerprints: input.lifecycleInput.fingerprints,
    limits: input.lifecycleInput.limits,
    now: input.now,
  });
  return service.transition({
    lifecycleId: draft.id,
    kind: "start-planning" as const,
    actorId: "runtime",
    reason: "Governed workflow planning started.",
    now: input.now,
  });
};
