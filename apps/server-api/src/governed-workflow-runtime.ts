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
import { AssetKind } from "./editable-assets";
import type { GovernanceLifecyclePersistencePort } from "./governance-lifecycle-persistence-port";
import {
  executeProviderNode,
  resolveProviderProfile,
  resolveWorkflowPromptAssets,
} from "./workflow-runtime";
import type { GovernanceLifecycleService } from "./governance-lifecycle-service";

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
  now?: () => Date;
}): GovernedWorkflowRuntimeService => {
  const now = input.now ?? (() => new Date());
  const governedService = createGovernedAgentToolService(
    input.persistence,
    input.rag,
  );

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
    registerSkillsAndPlugins(
      governedService,
      state,
      input.agentId,
      input.invoke,
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
  invoke: (input: {
    toolId: string;
    input: JsonValue;
    provenance: ArtifactProvenance;
  }) => Promise<McpToolResult>,
): void => {
  const plugins = state.editableAssets.records.filter(
    (asset) => asset.kind === AssetKind.Plugin && asset.plugin,
  );
  const skills = state.editableAssets.records.filter(
    (asset) => asset.kind === AssetKind.Skill && asset.skill,
  );

  for (const skill of skills) {
    if (!skill.skill) continue;
    governedService.registerSkill({
      id: skill.id,
      version: skill.skill.version,
      description: skill.name,
      inputSchema: skill.inputSchema,
      outputSchema: skill.outputSchema,
      requiredPermissions: [...skill.permissions],
      provenance: {
        source: `asset:${skill.id}`,
        artifactFingerprint: skill.provenance.artifactFingerprint,
        registeredAt: skill.provenance.registeredAt,
      },
    });
  }

  for (const plugin of plugins) {
    governedService.registerPlugin({
      manifest: {
        id: plugin.id,
        version: "1",
        runtime: plugin.plugin!.runtime,
        isolation: plugin.plugin!.isolation,
        permissions: [...plugin.permissions],
        tools: skills
          .filter(
            (
              entry,
            ): entry is typeof entry & {
              skill: NonNullable<(typeof entry)["skill"]>;
            } => entry.skill !== undefined,
          )
          .map((skill) => ({
            id: skill.id,
            inputSchema: skill.inputSchema,
            outputSchema: skill.outputSchema,
          })),
        audit: {
          manifestFingerprint: plugin.provenance.artifactFingerprint,
          publishedAt: plugin.provenance.registeredAt,
        },
      },
      agentId,
      invoke,
    });
  }
};

export const createRunGovernedNodeCallback = (input: {
  governedService: GovernedAgentToolService;
  lifecycleId: string;
  grantedPermissions: ReadonlyArray<string>;
  memoryScope: MemoryScope;
  now: () => Date;
}): ((
  request: GovernedNodeExecutionRequest,
) => Promise<WorkflowProviderRunResult>) => {
  return async (governedRequest) => {
    const node = governedRequest.node;
    if (!node.config.skillId) {
      throw new Error(`Governed node ${node.id} is missing a skillId.`);
    }
    const result = await input.governedService.invoke({
      lifecycleId: input.lifecycleId,
      skillId: node.config.skillId,
      input: governedRequest.inputValue as unknown as JsonValue,
      grantedPermissions: (node.config.grantedPermissions ??
        input.grantedPermissions) as unknown as Parameters<
        GovernedAgentToolService["invoke"]
      >[0]["grantedPermissions"],
      memoryScope: input.memoryScope,
      now: input.now().toISOString(),
    });
    const outputStr =
      typeof result.output === "string"
        ? result.output
        : JSON.stringify(result.output);
    return {
      outputText: outputStr,
      outputSnapshot: result.output,
      alerts: [],
      citations: [],
    } as WorkflowProviderRunResult;
  };
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
