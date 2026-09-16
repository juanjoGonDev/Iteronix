import { describe, expect, it } from "vitest";
import {
  AgentCapability,
  AgentPermission,
  McpToolResultStatus,
  PluginRuntimeKind,
  createMemoryScope,
  createSkillDefinition,
  enforceAssetCapabilities,
  enforceAssetPermissions,
  validateMcpToolResult,
  validatePluginManifest,
  type AgentPort,
  type ToolPort,
} from "./agent-tool-contracts";

const schema = {
  id: "knowledge.query",
  version: 1,
  schema: {
    type: "object",
    properties: { query: { type: "string", minLength: 1 } },
    required: ["query"],
    additionalProperties: false,
  },
} as const;

describe("agent and tool contracts", () => {
  it("creates versioned permissioned skills with immutable schemas and provenance", () => {
    const skill = createSkillDefinition({
      id: "knowledge.query",
      version: 1,
      description: "Queries approved knowledge.",
      inputSchema: schema,
      outputSchema: schema,
      requiredPermissions: ["memory.read", "tool.invoke"],
      provenance: {
        source: "plugin:knowledge",
        artifactFingerprint: "skill-source-fingerprint",
        registeredAt: "2026-07-18T00:00:00.000Z",
      },
    });

    expect(skill.requiredPermissions).toEqual(["memory.read", "tool.invoke"]);
    expect(skill.inputSchema).toEqual(schema);
    expect(skill.provenance.artifactFingerprint).toBe(
      "skill-source-fingerprint",
    );
    expect(() =>
      createSkillDefinition({
        ...skill,
        requiredPermissions: ["memory.read", "memory.read"],
      }),
    ).toThrow("Skill permissions must be declared");
  });

  it("enforces tenant and workflow scoped opt-in memory boundaries", () => {
    expect(
      createMemoryScope({
        tenantId: "tenant-a",
        workflowId: "workflow-a",
        enabled: true,
        retentionDays: 30,
      }),
    ).toEqual({
      tenantId: "tenant-a",
      workflowId: "workflow-a",
      enabled: true,
      retentionDays: 30,
    });

    expect(() =>
      createMemoryScope({
        tenantId: "tenant-a",
        workflowId: "workflow-a",
        enabled: false,
        retentionDays: 30,
      }),
    ).toThrow("Disabled memory scopes must not retain data");
  });

  it("rejects untrusted MCP output that violates its declared schema without exposing payload", () => {
    const rejected = validateMcpToolResult(
      {
        toolId: "knowledge.query",
        status: McpToolResultStatus.Success,
        output: { query: "", secret: "never expose" },
        provenance: {
          serverId: "mcp-knowledge",
          toolVersion: "1.0.0",
          responseFingerprint: "mcp-response-fingerprint",
        },
      },
      schema,
    );

    expect(rejected.valid).toBe(false);
    expect(rejected.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.query", code: "minLength" }),
        expect.objectContaining({
          path: "$.secret",
          code: "additionalProperties",
        }),
      ]),
    );
    expect(JSON.stringify(rejected.errors)).not.toContain("never expose");
  });

  it("accepts only server-isolated plugin manifests with permissions, schemas, and audit provenance", () => {
    const manifest = {
      id: "knowledge-plugin",
      version: "1.0.0",
      runtime: PluginRuntimeKind.Server,
      isolation: "process",
      permissions: ["memory.read", "tool.invoke"],
      tools: [
        {
          id: "knowledge.query",
          inputSchema: schema,
          outputSchema: schema,
        },
      ],
      audit: {
        manifestFingerprint: "plugin-fingerprint",
        publishedAt: "2026-07-18T00:00:00.000Z",
      },
    } as const;

    expect(validatePluginManifest(manifest)).toEqual({
      valid: true,
      errors: [],
    });
    const invalid = validatePluginManifest({ ...manifest, runtime: "desktop" });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.map((error) => error.code)).toContain(
      "plugin.runtime",
    );
  });
});

describe("port contract enforcement", () => {
  const declaredCapabilities = [
    AgentCapability.ToolCalls,
    AgentCapability.Streaming,
  ] as const;
  const declaredPermissions = [
    AgentPermission.ToolInvoke,
    AgentPermission.McpInvoke,
  ] as const;

  it("rejects undeclared capabilities with a deterministic error", () => {
    expect(() =>
      enforceAssetCapabilities(declaredCapabilities, [AgentCapability.Memory]),
    ).toThrow("Undeclared capability: memory.");
    expect(() =>
      enforceAssetCapabilities(declaredCapabilities, [
        AgentCapability.ToolCalls,
        AgentCapability.Mcp,
      ]),
    ).toThrow("Undeclared capability: mcp.");
    expect(() =>
      enforceAssetCapabilities(declaredCapabilities, []),
    ).not.toThrow();
  });

  it("rejects undeclared permissions with a deterministic error", () => {
    expect(() =>
      enforceAssetPermissions(declaredPermissions, [
        AgentPermission.MemoryRead,
      ]),
    ).toThrow("Undeclared permission: memory.read.");
    expect(() =>
      enforceAssetPermissions(declaredPermissions, [
        AgentPermission.ToolInvoke,
        AgentPermission.RagQuery,
      ]),
    ).toThrow("Undeclared permission: rag.query.");
    expect(() =>
      enforceAssetPermissions(declaredPermissions, []),
    ).not.toThrow();
  });

  it("rejects AgentPort invoke with undeclared capabilities", async () => {
    const port = createFakeAgentPort();
    await expect(
      port.invoke({
        agentId: "test-agent",
        workflowId: "test-workflow",
        input: {},
        requestedCapabilities: [AgentCapability.Memory],
        grantedPermissions: port.permissions,
      }),
    ).rejects.toThrow("Undeclared capability: memory.");
  });

  it("rejects AgentPort invoke with undeclared permissions", async () => {
    const port = createFakeAgentPort();
    await expect(
      port.invoke({
        agentId: "test-agent",
        workflowId: "test-workflow",
        input: {},
        requestedCapabilities: port.capabilities,
        grantedPermissions: [AgentPermission.MemoryRead],
      }),
    ).rejects.toThrow("Undeclared permission: memory.read.");
  });

  it("accepts AgentPort invoke with declared capabilities and permissions", async () => {
    const port = createFakeAgentPort();
    const result = await port.invoke({
      agentId: "test-agent",
      workflowId: "test-workflow",
      input: { prompt: "Hello" },
      requestedCapabilities: port.capabilities,
      grantedPermissions: port.permissions,
    });
    expect(result.output).toEqual({ result: "ok" });
    expect(result.provenance.source).toBe("fake-agent");
    expect(result.provenance.artifactFingerprint).toBeTruthy();
    expect(result.provenance.registeredAt).toBeTruthy();
  });

  it("invokes ToolPort with matching tool and returns validated output", async () => {
    const port = createFakeToolPort();
    const result = await port.invoke({
      toolId: "knowledge.query",
      input: { query: "test" },
      provenance: {
        source: "test",
        artifactFingerprint: "test",
        registeredAt: new Date().toISOString(),
      },
    });
    expect(result.toolId).toBe("knowledge.query");
    expect(result.status).toBe("success");
  });

  it("rejects ToolPort invoke for a non-existent tool", async () => {
    const port = createFakeToolPort();
    await expect(
      port.invoke({
        toolId: "missing.tool",
        input: {},
        provenance: {
          source: "test",
          artifactFingerprint: "test",
          registeredAt: new Date().toISOString(),
        },
      }),
    ).rejects.toThrow("Tool not found.");
  });
});

const createFakeAgentPort = (): AgentPort => {
  const capabilities: AgentPort["capabilities"] = [
    AgentCapability.ToolCalls,
    AgentCapability.Streaming,
  ];
  const permissions: AgentPort["permissions"] = [
    AgentPermission.ToolInvoke,
    AgentPermission.McpInvoke,
  ];
  return {
    id: "fake-agent",
    capabilities,
    permissions,
    invoke: async (request) => {
      enforceAssetCapabilities(capabilities, request.requestedCapabilities);
      enforceAssetPermissions(permissions, request.grantedPermissions);
      return {
        output: { result: "ok" },
        provenance: {
          source: "fake-agent",
          artifactFingerprint: "fake-fingerprint",
          registeredAt: new Date().toISOString(),
        },
      };
    },
  };
};

const createFakeToolPort = (): ToolPort => {
  const capabilities: ToolPort["capabilities"] = [AgentCapability.ToolCalls];
  const permissions: ToolPort["permissions"] = [AgentPermission.ToolInvoke];
  const declaredTools: ToolPort["tools"] = [
    {
      id: "knowledge.query",
      inputSchema: {
        id: "knowledge.query.input",
        version: 1,
        schema: {
          type: "object",
          properties: { query: { type: "string", minLength: 1 } },
          required: ["query"],
          additionalProperties: false,
        },
      },
      outputSchema: {
        id: "knowledge.query.output",
        version: 1,
        schema: {
          type: "object",
          properties: { result: { type: "string" } },
          required: ["result"],
          additionalProperties: false,
        },
      },
      requiredPermissions: [AgentPermission.ToolInvoke],
    },
  ];
  return {
    id: "fake-tool",
    capabilities,
    permissions,
    tools: declaredTools,
    invoke: async (request) => {
      const declared = declaredTools.find(
        (candidate) => candidate.id === request.toolId,
      );
      if (!declared) throw new Error("Tool not found.");
      return {
        toolId: request.toolId,
        status: "success",
        output: { result: "queried" },
        provenance: {
          serverId: "fake-server",
          toolVersion: "1.0.0",
          responseFingerprint: "resp-fp",
        },
      };
    },
  };
};
