import { describe, expect, it } from "vitest";
import {
  McpToolResultStatus,
  PluginRuntimeKind,
  createMemoryScope,
  createSkillDefinition,
  validateMcpToolResult,
  validatePluginManifest,
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
