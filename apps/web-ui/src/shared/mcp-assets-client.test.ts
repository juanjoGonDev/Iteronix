import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMcpAssetRecord,
  createMcpAssetsClient,
  parseMcpAssetsResponse,
  selectEnabledMcpAssets,
} from "./mcp-assets-client.js";

afterEach(() => vi.unstubAllGlobals());

describe("MCP assets client", () => {
  it("uses the HttpOnly IDE session when listing MCP connections", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ assets: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "http://localhost:4000" } });

    await createMcpAssetsClient().list();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/assets/list"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("keeps only safe MCP connection metadata", () => {
    expect(
      parseMcpAssetsResponse({
        assets: [
          {
            id: "mcp-1",
            kind: "mcp-tool",
            name: "Search",
            status: "enabled",
            capabilities: ["mcp"],
            permissions: ["mcp.invoke"],
            mcp: {
              serverId: "search-server",
              toolVersion: "2.0.0",
              auditEvents: [],
            },
          },
        ],
      }),
    ).toMatchObject([
      {
        id: "mcp-1",
        serverId: "search-server",
        toolVersion: "2.0.0",
      },
    ]);
  });

  it("creates an MCP connection without credentials or remote response content", () => {
    const record = createMcpAssetRecord({
      id: "mcp-1",
      name: "Search",
      serverId: "search-server",
      toolVersion: "1.0.0",
      now: "2026-07-21T12:00:00.000Z",
    });

    expect(record).toMatchObject({
      id: "mcp-1",
      kind: "mcp-tool",
      capabilities: ["mcp"],
      permissions: ["mcp.invoke"],
    });
    expect(JSON.stringify(record)).not.toContain("token");
    expect(
      selectEnabledMcpAssets(parseMcpAssetsResponse({ assets: [record] })),
    ).toHaveLength(1);
  });
});
