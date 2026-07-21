import { describe, expect, it } from "vitest";
import { McpToolResultStatus } from "../../../packages/domain/src/agent-tool-contracts";
import { createLocalMcpConnectionPort } from "./mcp-connection-port";

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
});
