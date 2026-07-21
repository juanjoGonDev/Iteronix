import { describe, expect, it } from "vitest";
import {
  McpToolResultStatus,
  PluginRuntimeKind,
  type MemoryRetrieval,
  type RagPort,
} from "../../../packages/domain/src/agent-tool-contracts";
import {
  GovernanceActorKind,
  GovernanceTransitionKind,
  createGovernanceLifecycle,
  transitionGovernanceLifecycle,
} from "../../../packages/domain/src/governance-lifecycle";
import { createGovernedAgentToolService } from "./governed-agent-tool-service";
import type { GovernanceLifecyclePersistencePort } from "./governance-lifecycle-persistence-port";

describe("governed agent tool service", () => {
  it("executes a reference server plugin through an executing lifecycle and persists provenance", async () => {
    const persistence = createMemoryPersistence();
    const lifecycle = createExecutingLifecycle();
    await persistence.mutateGovernanceLifecycles(() => [lifecycle]);
    const service = createGovernedAgentToolService(
      persistence,
      createRagPort(),
    );
    service.registerPlugin({
      manifest: manifest,
      agentId: "reference-agent",
      invoke: async () => ({
        toolId: "knowledge.query",
        status: McpToolResultStatus.Success,
        output: { answers: ["approved knowledge"] },
        provenance: {
          serverId: "reference-knowledge",
          toolVersion: "1.0.0",
          responseFingerprint: "response-fingerprint",
        },
      }),
    });
    service.registerSkill(skill);

    const result = await service.invoke({
      lifecycleId: lifecycle.id,
      skillId: skill.id,
      input: { query: "what is approved?" },
      grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
      memoryScope: {
        tenantId: "tenant-1",
        workflowId: lifecycle.workflowId,
        enabled: true,
        retentionDays: 7,
        sourceId: "memory-source",
      },
      now: "2026-07-18T01:00:00.000Z",
    });

    expect(result.output).toEqual({ answers: ["approved knowledge"] });
    expect(result.retrievals).toEqual([retrieval]);
    expect(persistence.read().governanceLifecycles[0]?.agentExecutions).toEqual(
      [
        expect.objectContaining({
          lifecycleId: lifecycle.id,
          agentId: "reference-agent",
          pluginId: manifest.id,
          skillId: skill.id,
          responseFingerprint: "response-fingerprint",
        }),
      ],
    );
    const retrievalExecution =
      persistence.read().governanceLifecycles[0]?.retrievalExecutions[0];
    expect(retrievalExecution).toBeDefined();
    expect(retrievalExecution?.assetId).toBe("memory-source");
    expect(retrievalExecution?.scope).toBe(`tenant-1:${lifecycle.workflowId}`);
    expect(retrievalExecution?.workflowId).toBe(lifecycle.workflowId);
    expect(retrievalExecution?.documentCount).toBe(1);
    expect(retrievalExecution?.provenanceFingerprint.length).toBeGreaterThan(0);
    expect(retrievalExecution?.redacted).toBe(true);
    expect(retrievalExecution?.timestamp).toBe("2026-07-18T01:00:00.000Z");
    expect(
      JSON.stringify(persistence.read().governanceLifecycles[0]),
    ).not.toContain(retrieval.content);
  });

  it("rejects cross-workflow memory, missing permissions, invalid MCP output, and approved lifecycle invocation", async () => {
    const persistence = createMemoryPersistence();
    const lifecycle = createExecutingLifecycle();
    await persistence.mutateGovernanceLifecycles(() => [lifecycle]);
    const service = createGovernedAgentToolService(
      persistence,
      createRagPort(),
    );
    service.registerPlugin({
      manifest,
      agentId: "reference-agent",
      invoke: async () => ({
        toolId: "knowledge.query",
        status: McpToolResultStatus.Success,
        output: { answers: [1] },
        provenance: {
          serverId: "reference-knowledge",
          toolVersion: "1.0.0",
          responseFingerprint: "response-fingerprint",
        },
      }),
    });
    service.registerSkill(skill);

    await expect(
      invoke(service, lifecycle.id, { workflowId: "other" }),
    ).rejects.toThrow("Memory scope workflow must match the lifecycle");
    await expect(
      service.invoke({
        lifecycleId: lifecycle.id,
        skillId: skill.id,
        input: { query: "approved" },
        grantedPermissions: ["tool.invoke"],
        memoryScope: scope,
        now: "2026-07-18T01:00:00.000Z",
      }),
    ).rejects.toThrow("Skill permissions were not granted");
    await expect(invoke(service, lifecycle.id)).rejects.toThrow(
      "MCP output failed schema validation",
    );
    await persistence.mutateGovernanceLifecycles((lifecycles) =>
      lifecycles.map((candidate) =>
        candidate.id === lifecycle.id
          ? { ...candidate, state: "approved" as const }
          : candidate,
      ),
    );
    await expect(invoke(service, lifecycle.id)).rejects.toThrow(
      "Agent executions require an executing lifecycle",
    );
  });

  it("uses a requested immutable skill version and rejects an unavailable version", async () => {
    const persistence = createMemoryPersistence();
    const lifecycle = createExecutingLifecycle();
    await persistence.mutateGovernanceLifecycles(() => [lifecycle]);
    const service = createGovernedAgentToolService(
      persistence,
      createRagPort(),
    );
    service.registerPlugin({
      manifest,
      agentId: "reference-agent",
      invoke: async () => ({
        toolId: skill.id,
        status: McpToolResultStatus.Success,
        output: { answers: ["versioned"] },
        provenance: {
          serverId: "reference-knowledge",
          toolVersion: "1.0.0",
          responseFingerprint: "response-fingerprint",
        },
      }),
    });
    service.registerSkill(skill);
    service.registerSkill({
      ...skill,
      version: 2,
      provenance: { ...skill.provenance, artifactFingerprint: "skill-v2" },
    });

    await service.invoke({
      lifecycleId: lifecycle.id,
      skillId: skill.id,
      skillVersion: 2,
      input: { query: "versioned" },
      grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
      memoryScope: scope,
      now: "2026-07-21T00:00:00.000Z",
    });

    expect(
      persistence.read().governanceLifecycles[0]?.agentExecutions[0],
    ).toMatchObject({
      skillId: skill.id,
      skillVersion: 2,
      artifactFingerprint: "skill-v2",
    });
    await expect(
      service.invoke({
        lifecycleId: lifecycle.id,
        skillId: skill.id,
        skillVersion: 3,
        input: { query: "missing" },
        grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
        memoryScope: scope,
        now: "2026-07-21T00:00:01.000Z",
      }),
    ).rejects.toThrow("Skill knowledge.query was not registered");
  });
});

const inputSchema = {
  id: "knowledge.query.input",
  version: 1,
  schema: {
    type: "object" as const,
    properties: { query: { type: "string" as const, minLength: 1 } },
    required: ["query"],
    additionalProperties: false,
  },
};

const outputSchema = {
  id: "knowledge.query.output",
  version: 1,
  schema: {
    type: "object" as const,
    properties: {
      answers: { type: "array" as const, items: { type: "string" as const } },
    },
    required: ["answers"],
    additionalProperties: false,
  },
};

const manifest = {
  id: "reference-knowledge",
  version: "1.0.0",
  runtime: PluginRuntimeKind.Server,
  isolation: "process" as const,
  permissions: ["memory.read", "rag.query", "tool.invoke"] as const,
  tools: [{ id: "knowledge.query", inputSchema, outputSchema }],
  audit: {
    manifestFingerprint: "plugin-fingerprint",
    publishedAt: "2026-07-18T00:00:00.000Z",
  },
};

const skill = {
  id: "knowledge.query",
  version: 1,
  description: "Queries approved knowledge.",
  inputSchema,
  outputSchema,
  requiredPermissions: ["memory.read", "rag.query", "tool.invoke"] as const,
  provenance: {
    source: "plugin:reference-knowledge",
    artifactFingerprint: "skill-fingerprint",
    registeredAt: "2026-07-18T00:00:00.000Z",
  },
};

const scope = {
  tenantId: "tenant-1",
  workflowId: "workflow-1",
  enabled: true,
  retentionDays: 7,
};

const retrieval: MemoryRetrieval = {
  content: "approved knowledge",
  provenance: {
    documentId: "document-1",
    documentFingerprint: "document-fingerprint",
    source: "reference-memory",
    retrievedAt: "2026-07-18T01:00:00.000Z",
  },
};

const createRagPort = (): RagPort => ({ retrieve: async () => [retrieval] });

const invoke = (
  service: ReturnType<typeof createGovernedAgentToolService>,
  lifecycleId: string,
  scopeOverride: Partial<typeof scope> = {},
) =>
  service.invoke({
    lifecycleId,
    skillId: skill.id,
    input: { query: "approved" },
    grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
    memoryScope: { ...scope, ...scopeOverride },
    now: "2026-07-18T01:00:00.000Z",
  });

const createExecutingLifecycle = () => {
  const draft = createGovernanceLifecycle({
    id: "lifecycle-1",
    workflowId: "workflow-1",
    fingerprints: { scope: "scope", evidence: "evidence" },
    limits: { execution: 1, repair: 1, review: 1 },
    now: "2026-07-18T00:00:00.000Z",
  });
  const planning = transitionGovernanceLifecycle(draft, {
    kind: GovernanceTransitionKind.StartPlanning,
    actor: { kind: GovernanceActorKind.System, id: "runtime" },
    reason: "Planning.",
    now: "2026-07-18T00:00:01.000Z",
  });
  return transitionGovernanceLifecycle(planning, {
    kind: GovernanceTransitionKind.StartExecuting,
    actor: { kind: GovernanceActorKind.System, id: "runtime" },
    reason: "Executing.",
    now: "2026-07-18T00:00:02.000Z",
  });
};

const createMemoryPersistence = (): GovernanceLifecyclePersistencePort => {
  let governanceLifecycles: ReturnType<
    GovernanceLifecyclePersistencePort["read"]
  >["governanceLifecycles"] = [];
  return {
    read: () => ({ governanceLifecycles }),
    mutateGovernanceLifecycles: async (updater) => {
      governanceLifecycles = updater(governanceLifecycles);
    },
  };
};
