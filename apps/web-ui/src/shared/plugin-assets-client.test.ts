import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPluginAssetRecord,
  createPluginAssetsClient,
  parsePluginAssetsResponse,
  selectEnabledPluginAssets,
} from "./plugin-assets-client.js";

afterEach(() => vi.unstubAllGlobals());

describe("plugin assets client", () => {
  it("uses the HttpOnly IDE session when listing plugins", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ assets: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "http://localhost:4000" } });

    await createPluginAssetsClient().list();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/assets/list"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("reads only safe server-side plugin manifest metadata", () => {
    const plugins = parsePluginAssetsResponse({
      assets: [
        {
          id: "reference.echo",
          kind: "plugin",
          name: "Reference echo",
          status: "enabled",
          capabilities: ["tool-calls"],
          permissions: ["tool.invoke"],
          plugin: {
            runtime: "server",
            isolation: "process",
            auditEvents: [
              {
                at: "2026-07-21T00:00:00.000Z",
                action: "loaded",
                actorId: "system",
              },
            ],
          },
          entrypoint: "/private/plugin.js",
          secret: "must-not-reach-ui",
        },
      ],
    });

    expect(plugins).toEqual([
      {
        id: "reference.echo",
        name: "Reference echo",
        status: "enabled",
        runtime: "server",
        isolation: "process",
        permissions: ["tool.invoke"],
        auditEvents: [{ at: "2026-07-21T00:00:00.000Z", action: "loaded" }],
      },
    ]);
    expect(JSON.stringify(plugins)).not.toContain("secret");
    expect(JSON.stringify(plugins)).not.toContain("entrypoint");
  });

  it("creates only a server-isolated plugin manifest record", () => {
    const record = createPluginAssetRecord({
      id: "reference.echo",
      name: "Reference echo",
      now: "2026-07-21T12:00:00.000Z",
    });

    expect(record).toMatchObject({
      id: "reference.echo",
      kind: "plugin",
      capabilities: ["tool-calls"],
      permissions: ["tool.invoke"],
      plugin: { runtime: "server", isolation: "process", auditEvents: [] },
    });
    expect(
      selectEnabledPluginAssets(
        parsePluginAssetsResponse({ assets: [record] }),
      ),
    ).toHaveLength(1);
  });
});
