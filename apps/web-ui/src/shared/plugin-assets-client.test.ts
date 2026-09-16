import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPluginRecordFromSummary,
  buildPluginRegistrationRecord,
  createPluginAssetRecord,
  createPluginAssetsClient,
  parsePluginAssetsCatalog,
  parsePluginAssetsResponse,
  selectEnabledPluginAssets,
} from "./plugin-assets-client.js";

afterEach(() => vi.unstubAllGlobals());

const fullAsset = () => ({
  id: "reference.echo",
  kind: "plugin",
  name: "Reference echo",
  status: "enabled",
  capabilities: ["tool-calls"],
  permissions: ["tool.invoke"],
  inputSchema: {
    id: "reference.echo.input",
    version: 1,
    schema: { type: "object" },
  },
  outputSchema: {
    id: "reference.echo.output",
    version: 1,
    schema: { type: "object" },
  },
  limits: { executions: 1, timeoutMs: 30_000 },
  provenance: {
    source: "ide",
    artifactFingerprint: "reference.echo",
    registeredAt: "2026-07-21T00:00:00.000Z",
  },
  plugin: {
    runtime: "server",
    isolation: "process",
    auditEvents: [
      { at: "2026-07-21T00:00:00.000Z", action: "loaded", actorId: "system" },
    ],
  },
  entrypoint: "/private/plugin.js",
  secret: "must-not-reach-ui",
});

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

  it("lists the server-owned trusted plugin keys alongside the catalog", () => {
    const catalog = parsePluginAssetsCatalog({
      assets: [fullAsset()],
      pluginRegistry: { trustedKeys: ["reference.echo", "acme.knowledge"] },
    });

    expect(catalog.trustedKeys).toEqual(["reference.echo", "acme.knowledge"]);
    expect(catalog.plugins).toHaveLength(1);
  });

  it("keeps the plugin catalog usable when a server predates the registry field", () => {
    expect(parsePluginAssetsCatalog({ assets: [] }).trustedKeys).toEqual([]);
  });

  it("reads only safe server-side plugin manifest metadata", () => {
    const plugins = parsePluginAssetsResponse({ assets: [fullAsset()] });

    expect(plugins).toEqual([
      {
        id: "reference.echo",
        name: "Reference echo",
        status: "enabled",
        runtime: "server",
        isolation: "process",
        capabilities: ["tool-calls"],
        permissions: ["tool.invoke"],
        limits: { executions: 1, timeoutMs: 30_000 },
        inputSchema: {
          id: "reference.echo.input",
          version: 1,
          schema: { type: "object" },
        },
        outputSchema: {
          id: "reference.echo.output",
          version: 1,
          schema: { type: "object" },
        },
        provenance: {
          source: "ide",
          artifactFingerprint: "reference.echo",
          registeredAt: "2026-07-21T00:00:00.000Z",
        },
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

  it("maps the registration form onto the persisted manifest record", () => {
    const record = buildPluginRegistrationRecord(
      {
        trustedKey: " acme.knowledge ",
        name: "  ",
        enabled: false,
        capabilities: ["tool-calls", "structured-output"],
        permissions: ["tool.invoke"],
        executions: 2,
        timeoutMs: 45_000,
        inputSchemaJson: '{ "type": "object", "additionalProperties": false }',
        outputSchemaJson: " ",
      },
      { now: "2026-09-16T00:00:00.000Z" },
    );

    expect(record).toMatchObject({
      id: "acme.knowledge",
      name: "acme.knowledge",
      status: "disabled",
      capabilities: ["tool-calls", "structured-output"],
      inputSchema: {
        id: "acme.knowledge.input",
        version: 1,
        schema: { type: "object", additionalProperties: false },
      },
      outputSchema: {
        id: "acme.knowledge.output",
        version: 1,
        schema: { type: "object" },
      },
      limits: { executions: 2, timeoutMs: 45_000 },
      provenance: {
        source: "ide",
        artifactFingerprint: "acme.knowledge",
        registeredAt: "2026-09-16T00:00:00.000Z",
      },
    });
  });

  it("keeps the original provenance when an operator edits a manifest", () => {
    const record = buildPluginRegistrationRecord(
      {
        trustedKey: "reference.echo",
        name: "Echo",
        enabled: true,
        capabilities: ["tool-calls"],
        permissions: ["tool.invoke"],
        executions: 1,
        timeoutMs: 1000,
        inputSchemaJson: "",
        outputSchemaJson: "",
      },
      {
        now: "2026-09-16T00:00:00.000Z",
        existing: {
          provenance: {
            source: "ide",
            artifactFingerprint: "original-fingerprint",
            registeredAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    );

    expect(record["provenance"]).toEqual({
      source: "ide",
      artifactFingerprint: "original-fingerprint",
      registeredAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("rebuilds a complete record from a summary when toggling status", () => {
    const [summary] = parsePluginAssetsResponse({ assets: [fullAsset()] });
    if (!summary) throw new Error("Expected a parsed plugin.");

    const record = buildPluginRecordFromSummary(summary, {
      status: "disabled",
    });

    expect(record).toMatchObject({
      id: "reference.echo",
      kind: "plugin",
      status: "disabled",
      capabilities: ["tool-calls"],
      permissions: ["tool.invoke"],
      limits: { executions: 1, timeoutMs: 30_000 },
      inputSchema: { id: "reference.echo.input", version: 1 },
      outputSchema: { id: "reference.echo.output", version: 1 },
      provenance: { artifactFingerprint: "reference.echo" },
      plugin: { runtime: "server", isolation: "process", auditEvents: [] },
    });
    expect(JSON.stringify(record)).not.toContain("secret");
  });

  it("rejects invalid execution limits before touching the network", () => {
    expect(() =>
      buildPluginRegistrationRecord(
        {
          trustedKey: "reference.echo",
          name: "Echo",
          enabled: true,
          capabilities: ["tool-calls"],
          permissions: ["tool.invoke"],
          executions: 0,
          timeoutMs: 1000,
          inputSchemaJson: "",
          outputSchemaJson: "",
        },
        { now: "2026-09-16T00:00:00.000Z" },
      ),
    ).toThrow("The execution limit must be a positive integer.");
  });

  it("sends form payloads through upsert and delete endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/assets/upsert")) {
        return new Response(JSON.stringify({ asset: fullAsset() }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({ assetId: "reference.echo" }), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "http://localhost:4000" } });
    const client = createPluginAssetsClient();

    const saved = await client.upsert(
      createPluginAssetRecord({
        id: "reference.echo",
        name: "Reference echo",
        now: "2026-09-16T00:00:00.000Z",
      }),
    );
    await client.delete("reference.echo");

    expect(saved.id).toBe("reference.echo");
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining("/assets/upsert"),
      expect.stringContaining("/assets/delete"),
    ]);
  });
});
