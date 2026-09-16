import { describe, expect, it, vi } from "vitest";
import { McpToolResultStatus } from "../../../packages/domain/src/agent-tool-contracts";
import {
  createConfiguredMcpConnectionPort,
  createLocalMcpConnectionPort,
} from "./mcp-connection-port";

describe("local MCP connection port", () => {
  it("keeps the fake invocation server-side and requires a complete pinned binding", async () => {
    const calls: Array<{ toolId: string }> = [];
    const port = createLocalMcpConnectionPort({
      invoke: async (request) => {
        calls.push({ toolId: request.toolId });
        return {
          toolId: request.toolId,
          status: McpToolResultStatus.Success,
          output: { value: "local" },
          provenance: {
            serverId: "local-mcp",
            toolVersion: "1.0.0",
            responseFingerprint: "response-fingerprint",
          },
        };
      },
    });

    await expect(
      port.invoke({
        connection: {
          assetId: "mcp-asset",
          serverId: "local-mcp",
          toolVersion: "1.0.0",
        },
        toolId: "local.tool",
        input: { query: "safe" },
        provenance: {
          source: "test",
          artifactFingerprint: "asset-fingerprint",
          registeredAt: "2026-07-21T00:00:00.000Z",
        },
      }),
    ).resolves.toMatchObject({ toolId: "local.tool" });
    expect(calls).toEqual([{ toolId: "local.tool" }]);

    await expect(
      port.invoke({
        connection: {
          assetId: "",
          serverId: "local-mcp",
          toolVersion: "1.0.0",
        },
        toolId: "local.tool",
        input: { query: "safe" },
        provenance: {
          source: "test",
          artifactFingerprint: "asset-fingerprint",
          registeredAt: "2026-07-21T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("MCP connection binding is invalid");
  });

  it("executes only configured server-side MCP registrations and rejects unknown servers", async () => {
    const requests: Array<{
      endpoint: string;
      token: string;
      body: unknown;
    }> = [];
    const port = createConfiguredMcpConnectionPort({
      servers: [
        {
          serverId: "reference-knowledge",
          endpoint: "https://mcp.example.test/invoke",
          token: "server-only-token",
          allowedToolIds: ["knowledge.query"],
        },
      ],
      transport: {
        post: async (request) => {
          requests.push({
            endpoint: request.endpoint,
            token: request.token,
            body: request.body,
          });
          return {
            toolId: "knowledge.query",
            status: McpToolResultStatus.Success,
            output: { answers: ["configured"] },
            provenance: {
              serverId: "reference-knowledge",
              toolVersion: "1.0.0",
              responseFingerprint: "configured-response",
            },
          };
        },
      },
    });
    const request = {
      connection: {
        assetId: "mcp-asset",
        serverId: "reference-knowledge",
        toolVersion: "1.0.0",
        timeoutMs: 10,
      },
      toolId: "knowledge.query",
      input: { query: "safe" },
      provenance: {
        source: "test",
        artifactFingerprint: "asset-fingerprint",
        registeredAt: "2026-07-27T00:00:00.000Z",
      },
    };

    await expect(port.invoke(request)).resolves.toMatchObject({
      toolId: "knowledge.query",
    });
    expect(requests).toEqual([
      {
        endpoint: "https://mcp.example.test/invoke",
        token: "server-only-token",
        body: {
          toolId: "knowledge.query",
          input: { query: "safe" },
        },
      },
    ]);

    await expect(
      port.invoke({
        ...request,
        connection: {
          ...request.connection,
          serverId: "unconfigured-server",
        },
      }),
    ).rejects.toThrow("MCP server is not configured");

    await expect(
      port.invoke({ ...request, toolId: "knowledge.unlisted" }),
    ).rejects.toThrow("MCP tool is not configured for this server");
    expect(requests).toHaveLength(1);
  });

  it("aborts a hanging MCP transport at the pinned timeout", async () => {
    let aborted = false;
    const port = createConfiguredMcpConnectionPort({
      servers: [
        {
          serverId: "reference-knowledge",
          endpoint: "https://mcp.example.test/invoke",
          token: "server-only-token",
          allowedToolIds: ["knowledge.query"],
        },
      ],
      transport: {
        post: async (request) =>
          new Promise<never>(() => {
            request.signal.addEventListener("abort", () => {
              aborted = true;
            });
          }),
      },
    });

    await expect(
      port.invoke({
        connection: {
          assetId: "mcp-asset",
          serverId: "reference-knowledge",
          toolVersion: "1.0.0",
          timeoutMs: 1,
        },
        toolId: "knowledge.query",
        input: { query: "safe" },
        provenance: {
          source: "test",
          artifactFingerprint: "asset-fingerprint",
          registeredAt: "2026-07-27T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("MCP server request timed out");
    expect(aborted).toBe(true);
  });

  it("rejects MCP redirects without following a second destination", async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      if (init) requests.push(init);
      throw new Error("Redirect response rejected.");
    });
    const port = createConfiguredMcpConnectionPort({
      servers: [
        {
          serverId: "reference-knowledge",
          endpoint: "https://mcp.example.test/invoke",
          token: "server-only-token",
          allowedToolIds: ["knowledge.query"],
        },
      ],
    });

    try {
      await expect(
        port.invoke({
          connection: {
            assetId: "mcp-asset",
            serverId: "reference-knowledge",
            toolVersion: "1.0.0",
            timeoutMs: 10,
          },
          toolId: "knowledge.query",
          input: { query: "safe" },
          provenance: {
            source: "test",
            artifactFingerprint: "asset-fingerprint",
            registeredAt: "2026-07-27T00:00:00.000Z",
          },
        }),
      ).rejects.toThrow("MCP server request failed");
      expect(requests).toHaveLength(1);
      expect(requests[0]?.redirect).toBe("error");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
