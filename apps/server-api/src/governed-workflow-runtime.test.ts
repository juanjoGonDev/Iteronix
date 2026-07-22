import { describe, expect, it } from "vitest";
import {
  McpToolResultStatus,
  PluginRuntimeKind,
  type MemoryRetrieval,
  type RagPort,
} from "../../../packages/domain/src/agent-tool-contracts";
import { type GovernanceLifecycle } from "../../../packages/domain/src/governance-lifecycle";
import {
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
  type WorkflowDefinitionRecord,
  type WorkflowNodeRecord,
} from "../../../packages/shared/src/workflows";
import {
  createDefaultApplicationState,
  type ApplicationState,
} from "./application-state";
import {
  AssetKind,
  AssetStatus,
  type EditableAssetRecord,
} from "./editable-assets";
import { createGovernanceLifecycleService } from "./governance-lifecycle-service";
import {
  createGovernedWorkflowRuntimeService,
  type GovernedWorkflowRuntimeService,
} from "./governed-workflow-runtime";
import type { GovernanceLifecyclePersistencePort } from "./governance-lifecycle-persistence-port";
import {
  createChildProcessReferencePluginHost,
  createProcessIsolatedPluginHost,
  createTrustedPluginRegistry,
} from "./server-plugin-runtime";

describe("governed workflow runtime service", () => {
  it("executes a version-pinned plugin without a Skill and persists plugin provenance", async () => {
    const persistence = createMemoryPersistence();
    const fixture = createFixture(persistence, [], false);
    const definition = createDefinitionWithSkillNode();

    const result = await fixture.service.runGovernedWorkflow({
      definition: {
        ...definition,
        nodes: definition.nodes.map((node) =>
          node.id === "skill-node"
            ? {
                ...node,
                config: {
                  grantedPermissions: [
                    "memory.read",
                    "rag.query",
                    "tool.invoke",
                  ],
                  pluginAsset: { assetId: assetPlugin.id, version: "1" },
                },
              }
            : node,
        ),
      },
      assets: [],
      lifecycleInput: {
        id: "lifecycle-plugin-1",
        workflowId: "workflow-1",
        fingerprints: { scope: "scope-fp", evidence: "evidence-fp" },
        limits: { execution: 1, repair: 1, review: 1 },
      },
      grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
      memoryScope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: true,
        retentionDays: 7,
      },
      now: "2026-07-21T00:00:00.000Z",
    });

    expect(result.execution.status).toBe("completed");
    expect(result.lifecycle.agentExecutions[0]).toMatchObject({
      pluginAssetId: assetPlugin.id,
      pluginVersion: "1",
      pluginFingerprint: assetPlugin.provenance.artifactFingerprint,
      pluginIsolation: "process",
      pluginAuditAction: "invoked",
    });
  });

  it("executes a governed AiAgent node through the governance lifecycle with skill provenance", async () => {
    const persistence = createMemoryPersistence();
    const fixture = createFixture(persistence);

    const result = await fixture.service.runGovernedWorkflow({
      definition: createDefinitionWithSkillNode(),
      assets: [],
      lifecycleInput: {
        id: "lifecycle-1",
        workflowId: "workflow-1",
        fingerprints: {
          scope: "scope-fp",
          evidence: "evidence-fp",
        },
        limits: { execution: 1, repair: 1, review: 1 },
      },
      grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
      memoryScope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: true,
        retentionDays: 7,
      },
      now: "2026-07-19T00:00:00.000Z",
    });

    expect(result.execution.status).toBe("completed");
    expect(result.execution.nodeRuns).toHaveLength(3);
    const skillRun = result.execution.nodeRuns.find(
      (n: { nodeId: string }) => n.nodeId === "skill-node",
    );
    expect(skillRun?.outputSnapshot).toEqual({ answers: ["governed result"] });

    expect(result.lifecycle.state).toBe("awaiting-user-approval");
    expect(result.lifecycle.agentExecutions).toHaveLength(1);
    expect(result.lifecycle.agentExecutions[0]).toMatchObject({
      lifecycleId: "lifecycle-1",
      agentId: "test-agent",
      skillId: "knowledge.query",
    });
  });

  it("records full provenance fingerprints in the agent execution record", async () => {
    const persistence = createMemoryPersistence();
    const fixture = createFixture(persistence);

    const result = await fixture.service.runGovernedWorkflow({
      definition: createDefinitionWithSkillNode(),
      assets: [],
      lifecycleInput: {
        id: "lifecycle-2",
        workflowId: "workflow-1",
        fingerprints: {
          scope: "scope-fp",
          evidence: "evidence-fp",
        },
        limits: { execution: 1, repair: 1, review: 1 },
      },
      grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
      memoryScope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: true,
        retentionDays: 7,
      },
      now: "2026-07-19T00:00:00.000Z",
    });

    expect(result.lifecycle.agentExecutions).toHaveLength(1);
    const agentExecution = result.lifecycle.agentExecutions[0]!;
    expect(agentExecution.inputFingerprint).toMatch(/^fnv1a-[0-9a-f]{8}$/u);
    expect(agentExecution.outputFingerprint).toMatch(/^fnv1a-[0-9a-f]{8}$/u);
    expect(agentExecution.artifactFingerprint).toBe("skill-fingerprint");
    expect(agentExecution.responseFingerprint).toBe("response-fingerprint");
    expect(agentExecution.pluginId).toBe("plugin-1");
    expect(agentExecution.toolId).toBe("knowledge.query");
    expect(agentExecution.skillVersion).toBe(1);
  });

  it("uses an enabled pinned MCP connection and persists only its safe provenance", async () => {
    const persistence = createMemoryPersistence();
    const fixture = createFixture(persistence, [assetMcpConnection]);
    const definition = createDefinitionWithSkillNode();

    const result = await fixture.service.runGovernedWorkflow({
      definition: {
        ...definition,
        nodes: definition.nodes.map((node) =>
          node.id === "skill-node"
            ? {
                ...node,
                config: {
                  ...node.config,
                  mcpConnection: {
                    assetId: "mcp-knowledge",
                    serverId: "reference-knowledge",
                    toolVersion: "1.0.0",
                  },
                  grantedPermissions: [
                    "memory.read",
                    "rag.query",
                    "tool.invoke",
                    "mcp.invoke",
                  ],
                },
              }
            : node,
        ),
      },
      assets: [],
      lifecycleInput: {
        id: "lifecycle-mcp-1",
        workflowId: "workflow-1",
        fingerprints: { scope: "scope-fp", evidence: "evidence-fp" },
        limits: { execution: 1, repair: 1, review: 1 },
      },
      grantedPermissions: [
        "memory.read",
        "rag.query",
        "tool.invoke",
        "mcp.invoke",
      ],
      memoryScope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: true,
        retentionDays: 7,
      },
      now: "2026-07-21T00:00:00.000Z",
    });

    expect(result.execution.status).toBe("completed");
    expect(result.lifecycle.agentExecutions[0]).toMatchObject({
      mcpAssetId: "mcp-knowledge",
      mcpServerId: "reference-knowledge",
      mcpToolVersion: "1.0.0",
    });
  });

  it("executes a standalone MCP AiAgent without a Skill or Memory/RAG source", async () => {
    const persistence = createMemoryPersistence();
    const fixture = createFixture(persistence, [assetMcpConnection]);
    const definition = createDefinitionWithSkillNode();

    const result = await fixture.service.runGovernedWorkflow({
      definition: {
        ...definition,
        nodes: definition.nodes.map((node) =>
          node.id === "skill-node"
            ? {
                ...node,
                config: {
                  mcpConnection: {
                    assetId: "mcp-knowledge",
                    serverId: "reference-knowledge",
                    toolVersion: "1.0.0",
                  },
                  grantedPermissions: ["mcp.invoke"],
                },
              }
            : node,
        ),
      },
      assets: [],
      lifecycleInput: {
        id: "lifecycle-mcp-standalone",
        workflowId: "workflow-1",
        fingerprints: { scope: "scope-fp", evidence: "evidence-fp" },
        limits: { execution: 1, repair: 1, review: 1 },
      },
      grantedPermissions: ["mcp.invoke"],
      memoryScope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: false,
        retentionDays: 0,
      },
      now: "2026-07-21T00:00:00.000Z",
    });

    expect(result.execution.status).toBe("completed");
    expect(result.lifecycle.retrievalExecutions).toEqual([]);
    expect(result.lifecycle.agentExecutions[0]).toMatchObject({
      skillId: "mcp-knowledge",
      mcpAssetId: "mcp-knowledge",
    });
  });

  it("executes pinned reference Skill and Plugin nodes with MCP and redacted RAG provenance", async () => {
    const persistence = createMemoryPersistence();
    const fixture = createFixture(
      persistence,
      [assetMcpConnection, assetMemory, assetReferencePlugin],
      true,
      true,
    );

    const result = await fixture.service.runGovernedWorkflow({
      definition: createReferenceAssetAcceptanceDefinition(),
      assets: [],
      lifecycleInput: {
        id: "lifecycle-reference-assets",
        workflowId: "workflow-1",
        fingerprints: { scope: "scope-fp", evidence: "evidence-fp" },
        limits: { execution: 1, repair: 1, review: 1 },
      },
      grantedPermissions: [
        "memory.read",
        "rag.query",
        "tool.invoke",
        "mcp.invoke",
      ],
      memoryScope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: true,
        retentionDays: 7,
      },
      now: "2026-07-22T00:00:00.000Z",
    });

    expect(result.execution.status).toBe("completed");
    expect(result.lifecycle.state).toBe("awaiting-user-approval");
    expect(result.lifecycle.agentExecutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: assetSkill.id,
          skillVersion: 1,
          mcpAssetId: assetMcpConnection.id,
          mcpServerId: assetMcpConnection.mcp!.serverId,
          mcpToolVersion: assetMcpConnection.mcp!.toolVersion,
        }),
        expect.objectContaining({
          pluginAssetId: assetReferencePlugin.id,
          pluginVersion: "1",
          pluginIsolation: "process",
          pluginAuditAction: "invoked",
        }),
      ]),
    );
    expect(result.lifecycle.retrievalExecutions).toEqual([
      expect.objectContaining({
        assetId: assetMemory.id,
        workflowId: "workflow-1",
        documentCount: 1,
        redacted: true,
      }),
    ]);
    expect(JSON.stringify(result.lifecycle)).not.toContain(
      "governed knowledge",
    );
    expect(JSON.stringify(fixture.persistence.read())).not.toContain(
      "governed knowledge",
    );
  });

  it("transitions to failed lifecycle when skill input fails schema validation", async () => {
    const persistence = createMemoryPersistence();
    const fixture = createFixture(persistence);

    const result = await fixture.service.runGovernedWorkflow({
      definition: createDefinitionWithInvalidSkillInput(),
      assets: [],
      lifecycleInput: {
        id: "lifecycle-3",
        workflowId: "workflow-1",
        fingerprints: {
          scope: "scope-fp",
          evidence: "evidence-fp",
        },
        limits: { execution: 1, repair: 1, review: 1 },
      },
      grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
      memoryScope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: true,
        retentionDays: 7,
      },
      now: "2026-07-19T00:00:00.000Z",
    });

    expect(result.lifecycle.state).toBe("awaiting-user-approval");
    expect(result.lifecycle.agentExecutions).toHaveLength(0);
    const failedNode = result.execution.nodeRuns.find(
      (n: { nodeId: string }) => n.nodeId === "skill-node",
    );
    expect(failedNode).toBeDefined();
    expect(failedNode!.status).toBe("failed");
    expect(JSON.stringify(failedNode!.outputSnapshot)).toMatch(
      /schema validation/iu,
    );
  });

  it("routes AiAgent nodes without skillId through the provider path and records no agent executions", async () => {
    const persistence = createMemoryPersistence();
    const fixture = createFixture(persistence);

    const result = await fixture.service.runGovernedWorkflow({
      definition: createDefinitionWithProviderNode(),
      assets: [],
      lifecycleInput: {
        id: "lifecycle-4",
        workflowId: "workflow-1",
        fingerprints: {
          scope: "scope-fp",
          evidence: "evidence-fp",
        },
        limits: { execution: 1, repair: 1, review: 1 },
      },
      grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
      memoryScope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: true,
        retentionDays: 7,
      },
      now: "2026-07-19T00:00:00.000Z",
    });

    expect(result.lifecycle.state).toBe("awaiting-user-approval");
    expect(result.lifecycle.agentExecutions).toHaveLength(0);
    const agentNode = result.execution.nodeRuns.find(
      (n: { nodeId: string }) => n.nodeId === "provider-node",
    );
    expect(agentNode).toBeDefined();
    expect(agentNode!.status).toBe("failed");
    expect(JSON.stringify(agentNode!.outputSnapshot)).toMatch(
      /missing provider configuration/iu,
    );
  });

  it("rejects invocation when granted permissions do not satisfy skill requirements", async () => {
    const persistence = createMemoryPersistence();
    const fixture = createFixture(persistence);

    const result = await fixture.service.runGovernedWorkflow({
      definition: createDefinitionWithNodeNoPermissions(),
      assets: [],
      lifecycleInput: {
        id: "lifecycle-5",
        workflowId: "workflow-1",
        fingerprints: {
          scope: "scope-fp",
          evidence: "evidence-fp",
        },
        limits: { execution: 1, repair: 1, review: 1 },
      },
      grantedPermissions: ["memory.read"],
      memoryScope: {
        tenantId: "tenant-1",
        workflowId: "workflow-1",
        enabled: true,
        retentionDays: 7,
      },
      now: "2026-07-19T00:00:00.000Z",
    });

    expect(result.lifecycle.state).toBe("awaiting-user-approval");
    expect(result.lifecycle.agentExecutions).toHaveLength(0);
    const failedNode = result.execution.nodeRuns.find(
      (n: { nodeId: string }) => n.nodeId === "skill-node",
    );
    expect(failedNode).toBeDefined();
    expect(failedNode!.status).toBe("failed");
    expect(JSON.stringify(failedNode!.outputSnapshot)).toMatch(/permissions/iu);
  });
});

const createDefinitionWithSkillNode = (): WorkflowDefinitionRecord => ({
  id: "workflow-1",
  name: "Governed workflow",
  description: "Governed workflow acceptance fixture",
  status: WorkflowRecordStatus.Published,
  version: 1,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  trigger: {
    kind: WorkflowTriggerKind.Manual,
    enabled: true,
    config: {},
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    createNode("trigger", WorkflowNodeKind.TriggerManual, [], ["out"]),
    createNode("skill-node", WorkflowNodeKind.AiAgent, ["in"], ["out"]),
    createNode("terminal", WorkflowNodeKind.TerminalResponse, ["in"], []),
  ],
  edges: [
    {
      id: "e1",
      sourceNodeId: "trigger",
      sourcePortId: "out",
      targetNodeId: "skill-node",
      targetPortId: "in",
      mapping: {
        mode: "object" as const,
        entries: [
          {
            targetPath: "query",
            source: { kind: "literal" as const, value: "test query" },
          },
        ],
      },
    },
    {
      id: "e2",
      sourceNodeId: "skill-node",
      sourcePortId: "out",
      targetNodeId: "terminal",
      targetPortId: "in",
      mapping: { mode: "passthrough" as const, entries: [] },
    },
  ],
  executionPolicy: {
    maxNodeRetries: 0,
    allowManualCheckpointResume: false,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 1,
    carryArtifactLimit: 1,
  },
  tags: [],
});

const createReferenceAssetAcceptanceDefinition =
  (): WorkflowDefinitionRecord => {
    const definition = createDefinitionWithSkillNode();
    const pluginNode = {
      ...createNode("plugin-node", WorkflowNodeKind.AiAgent, ["in"], ["out"]),
      config: {
        pluginAsset: { assetId: assetReferencePlugin.id, version: "1" },
        grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
      },
    };
    return {
      ...definition,
      nodes: definition.nodes.flatMap((node) =>
        node.id === "skill-node"
          ? [
              {
                ...node,
                config: {
                  skillAsset: { assetId: assetSkill.id, version: 1 },
                  memorySourceId: assetMemory.id,
                  mcpConnection: {
                    assetId: assetMcpConnection.id,
                    serverId: assetMcpConnection.mcp!.serverId,
                    toolVersion: assetMcpConnection.mcp!.toolVersion,
                  },
                  grantedPermissions: [
                    "memory.read",
                    "rag.query",
                    "tool.invoke",
                    "mcp.invoke",
                  ],
                },
              },
              pluginNode,
            ]
          : [node],
      ),
      edges: [
        definition.edges[0]!,
        {
          id: "e-plugin",
          sourceNodeId: "skill-node",
          sourcePortId: "out",
          targetNodeId: "plugin-node",
          targetPortId: "in",
          mapping: {
            mode: "object",
            entries: [
              {
                targetPath: "query",
                source: { kind: "literal", value: "plugin query" },
              },
            ],
          },
        },
        {
          ...definition.edges[1]!,
          sourceNodeId: "plugin-node",
        },
      ],
    };
  };

const createDefinitionWithInvalidSkillInput = (): WorkflowDefinitionRecord => ({
  id: "workflow-1",
  name: "Invalid input workflow",
  description: "Input without query field",
  status: WorkflowRecordStatus.Published,
  version: 1,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  trigger: {
    kind: WorkflowTriggerKind.Manual,
    enabled: true,
    config: {},
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    createNode("trigger", WorkflowNodeKind.TriggerManual, [], ["out"]),
    createNode("skill-node", WorkflowNodeKind.AiAgent, ["in"], ["out"]),
    createNode("terminal", WorkflowNodeKind.TerminalResponse, ["in"], []),
  ],
  edges: [
    {
      id: "e1",
      sourceNodeId: "trigger",
      sourcePortId: "out",
      targetNodeId: "skill-node",
      targetPortId: "in",
      mapping: { mode: "passthrough" as const, entries: [] },
    },
    {
      id: "e2",
      sourceNodeId: "skill-node",
      sourcePortId: "out",
      targetNodeId: "terminal",
      targetPortId: "in",
      mapping: { mode: "passthrough" as const, entries: [] },
    },
  ],
  executionPolicy: {
    maxNodeRetries: 0,
    allowManualCheckpointResume: false,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 1,
    carryArtifactLimit: 1,
  },
  tags: [],
});

const createDefinitionWithNodeNoPermissions = (): WorkflowDefinitionRecord => ({
  id: "workflow-1",
  name: "Missing permissions workflow",
  description:
    "AiAgent node without grantedPermissions uses workflow-level permissions",
  status: WorkflowRecordStatus.Published,
  version: 1,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  trigger: {
    kind: WorkflowTriggerKind.Manual,
    enabled: true,
    config: {},
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    createNode("trigger", WorkflowNodeKind.TriggerManual, [], ["out"]),
    {
      ...createNode("skill-node", WorkflowNodeKind.AiAgent, ["in"], ["out"]),
      config: { skillId: "knowledge.query" },
    },
    createNode("terminal", WorkflowNodeKind.TerminalResponse, ["in"], []),
  ],
  edges: [
    {
      id: "e1",
      sourceNodeId: "trigger",
      sourcePortId: "out",
      targetNodeId: "skill-node",
      targetPortId: "in",
      mapping: {
        mode: "object" as const,
        entries: [
          {
            targetPath: "query",
            source: { kind: "literal" as const, value: "test query" },
          },
        ],
      },
    },
    {
      id: "e2",
      sourceNodeId: "skill-node",
      sourcePortId: "out",
      targetNodeId: "terminal",
      targetPortId: "in",
      mapping: { mode: "passthrough" as const, entries: [] },
    },
  ],
  executionPolicy: {
    maxNodeRetries: 0,
    allowManualCheckpointResume: false,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 1,
    carryArtifactLimit: 1,
  },
  tags: [],
});

const createDefinitionWithProviderNode = (): WorkflowDefinitionRecord => ({
  id: "workflow-1",
  name: "Provider-only workflow",
  description: "AiAgent without skillId uses provider path",
  status: WorkflowRecordStatus.Published,
  version: 1,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  trigger: {
    kind: WorkflowTriggerKind.Manual,
    enabled: true,
    config: {},
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    createNode("trigger", WorkflowNodeKind.TriggerManual, [], ["out"]),
    createNode("provider-node", WorkflowNodeKind.AiAgent, ["in"], ["out"]),
    createNode("terminal", WorkflowNodeKind.TerminalResponse, ["in"], []),
  ],
  edges: [
    {
      id: "e1",
      sourceNodeId: "trigger",
      sourcePortId: "out",
      targetNodeId: "provider-node",
      targetPortId: "in",
      mapping: { mode: "passthrough" as const, entries: [] },
    },
    {
      id: "e2",
      sourceNodeId: "provider-node",
      sourcePortId: "out",
      targetNodeId: "terminal",
      targetPortId: "in",
      mapping: { mode: "passthrough" as const, entries: [] },
    },
  ],
  executionPolicy: {
    maxNodeRetries: 0,
    allowManualCheckpointResume: false,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 1,
    carryArtifactLimit: 1,
  },
  tags: [],
});

const createNode = (
  id: string,
  kind: WorkflowNodeKind,
  inputPortIds: ReadonlyArray<string>,
  outputPortIds: ReadonlyArray<string>,
): WorkflowNodeRecord => ({
  id,
  kind,
  label: id,
  position: { x: 0, y: 0 },
  width: 160,
  collapsed: false,
  config:
    id === "skill-node"
      ? {
          skillId: "knowledge.query",
          grantedPermissions: ["memory.read", "rag.query", "tool.invoke"],
        }
      : {},
  inputPorts: inputPortIds.map((portId) => ({
    id: portId,
    name: portId,
    acceptsMany: true,
  })),
  outputPorts: outputPortIds.map((portId) => ({
    id: portId,
    name: portId,
    acceptsMany: true,
  })),
  attachedGuardrails: [],
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

const referencePluginOutputSchema = {
  id: "reference.plugin.output",
  version: 1,
  schema: {
    type: "object" as const,
    properties: { echo: { type: "object" as const } },
    required: ["echo"],
    additionalProperties: false,
  },
};

const assetPlugin: EditableAssetRecord = {
  id: "plugin-1",
  kind: AssetKind.Plugin,
  name: "Reference Knowledge",
  status: AssetStatus.Enabled,
  capabilities: ["memory", "rag", "tool-calls"],
  permissions: ["memory.read", "rag.query", "tool.invoke"],
  inputSchema,
  outputSchema,
  limits: { executions: 10, timeoutMs: 5000 },
  provenance: {
    source: "test",
    artifactFingerprint: "plugin-1",
    registeredAt: "2026-07-19T00:00:00.000Z",
  },
  plugin: {
    runtime: PluginRuntimeKind.Server,
    isolation: "process",
    auditEvents: [],
  },
};

const assetReferencePlugin: EditableAssetRecord = {
  id: "reference.echo",
  kind: AssetKind.Plugin,
  name: "Reference Echo",
  status: AssetStatus.Enabled,
  capabilities: ["tool-calls"],
  permissions: ["tool.invoke"],
  inputSchema,
  outputSchema: referencePluginOutputSchema,
  limits: { executions: 10, timeoutMs: 5000 },
  provenance: {
    source: "test",
    artifactFingerprint: "reference-echo-fingerprint",
    registeredAt: "2026-07-22T00:00:00.000Z",
  },
  plugin: {
    runtime: PluginRuntimeKind.Server,
    isolation: "process",
    auditEvents: [],
  },
};

const assetSkill: EditableAssetRecord = {
  id: "knowledge.query",
  kind: AssetKind.Skill,
  name: "Knowledge Query",
  status: AssetStatus.Enabled,
  capabilities: ["tool-calls"],
  permissions: ["memory.read", "rag.query", "tool.invoke"],
  inputSchema,
  outputSchema,
  limits: { executions: 10, timeoutMs: 5000 },
  provenance: {
    source: "plugin:reference-knowledge",
    artifactFingerprint: "skill-fingerprint",
    registeredAt: "2026-07-19T00:00:00.000Z",
  },
  skill: {
    version: 1,
    lifecycle: AssetStatus.Enabled,
  },
};

const assetMcpConnection: EditableAssetRecord = {
  id: "mcp-knowledge",
  kind: AssetKind.McpTool,
  name: "Reference MCP",
  status: AssetStatus.Enabled,
  capabilities: ["mcp"],
  permissions: ["mcp.invoke"],
  inputSchema,
  outputSchema,
  limits: { executions: 10, timeoutMs: 5000 },
  provenance: {
    source: "test",
    artifactFingerprint: "mcp-knowledge-fingerprint",
    registeredAt: "2026-07-21T00:00:00.000Z",
  },
  mcp: {
    serverId: "reference-knowledge",
    toolVersion: "1.0.0",
    auditEvents: [],
  },
};

const assetMemory: EditableAssetRecord = {
  id: "memory-reference",
  kind: AssetKind.MemorySource,
  name: "Reference Memory",
  status: AssetStatus.Enabled,
  capabilities: ["rag"],
  permissions: ["memory.read", "rag.query"],
  inputSchema,
  outputSchema,
  limits: { executions: 10, timeoutMs: 5000 },
  provenance: {
    source: "test",
    artifactFingerprint: "memory-reference-fingerprint",
    registeredAt: "2026-07-22T00:00:00.000Z",
  },
  memory: {
    tenantId: "tenant-1",
    workflowId: "workflow-1",
    optInIndexing: true,
    retentionDays: 7,
    redactRetrievals: true,
  },
};

const retrieval: MemoryRetrieval = {
  content: "governed knowledge",
  provenance: {
    documentId: "document-1",
    documentFingerprint: "document-fingerprint",
    source: "reference-memory",
    retrievedAt: "2026-07-19T01:00:00.000Z",
  },
};

const createRagPort = (): RagPort => ({
  retrieve: async () => [retrieval],
});

type Fixture = {
  service: GovernedWorkflowRuntimeService;
  persistence: GovernanceLifecyclePersistencePort;
};

const createFixture = (
  persistence: GovernanceLifecyclePersistencePort,
  additionalAssets: ReadonlyArray<EditableAssetRecord> = [],
  includeLegacySkill: boolean = true,
  useChildProcessPluginHost: boolean = false,
): Fixture => {
  const state: ApplicationState = {
    ...createDefaultApplicationState(),
    editableAssets: {
      records: [
        assetPlugin,
        ...(includeLegacySkill ? [assetSkill] : []),
        ...additionalAssets,
      ],
    },
  };

  const lifecycleService = createGovernanceLifecycleService(persistence);
  const pluginRegistry = createTrustedPluginRegistry({
    allowedPluginIds: [assetPlugin.id, assetReferencePlugin.id],
    host: useChildProcessPluginHost
      ? createChildProcessReferencePluginHost()
      : createProcessIsolatedPluginHost({
          invoke: async (request) => ({ answers: [request.pluginId] }),
        }),
  });

  const service = createGovernedWorkflowRuntimeService({
    readApplicationState: () => state,
    lifecycleService,
    persistence,
    rag: createRagPort(),
    invoke: async () => ({
      toolId: "knowledge.query",
      status: McpToolResultStatus.Success,
      output: { answers: ["governed result"] },
      provenance: {
        serverId: "reference-knowledge",
        toolVersion: "1.0.0",
        responseFingerprint: "response-fingerprint",
      },
    }),
    agentId: "test-agent",
    pluginRegistry,
  });

  return { service, persistence };
};

const createMemoryPersistence = (): GovernanceLifecyclePersistencePort => {
  let state = {
    governanceLifecycles: [] as ReadonlyArray<GovernanceLifecycle>,
  };
  return {
    read: () => state,
    mutateGovernanceLifecycles: async (updater) => {
      state = { governanceLifecycles: updater(state.governanceLifecycles) };
    },
  };
};
