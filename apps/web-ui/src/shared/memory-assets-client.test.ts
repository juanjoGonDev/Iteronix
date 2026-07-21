import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryAssetRecord,
  createMemoryAssetsClient,
  parseMemoryAssetsResponse,
  selectEnabledMemoryAssets,
} from "./memory-assets-client.js";

afterEach(() => vi.unstubAllGlobals());

describe("memory assets client", () => {
  it("uses the HttpOnly IDE session when listing memory sources", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ assets: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "http://localhost:4000" } });

    await createMemoryAssetsClient().list();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/assets/list"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("submits the server-compatible memory contract through the authenticated upsert boundary", async () => {
    const asset = createMemoryAssetRecord({
      id: "memory-1",
      name: "Knowledge",
      scope: "workflow",
      workflowId: "workflow-1",
      indexingEnabled: true,
      retentionDays: 14,
      redactionEnabled: true,
      now: "2026-07-21T12:00:00.000Z",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ asset }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "http://localhost:4000" } });

    await createMemoryAssetsClient().upsert(asset);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/assets/upsert"),
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });

  it("keeps bounded retrieval configuration and ignores other assets", () => {
    expect(
      parseMemoryAssetsResponse({
        assets: [
          { id: "skill-1", kind: "skill", name: "Ignore" },
          {
            id: "memory-1",
            kind: "memory-source",
            name: "Tenant knowledge",
            status: "enabled",
            permissions: ["rag.query"],
            memory: {
              tenantId: "workflow-1",
              workflowId: "workflow-1",
              optInIndexing: true,
              retentionDays: 30,
              redactRetrievals: true,
            },
          },
        ],
      }),
    ).toMatchObject([
      {
        id: "memory-1",
        scope: "workflow",
        indexingEnabled: true,
        retentionDays: 30,
        redactionEnabled: true,
        documents: [],
      },
    ]);
  });

  it("creates a server-compatible opt-in bounded memory source", () => {
    expect(
      createMemoryAssetRecord({
        id: "memory-1",
        name: "Knowledge",
        scope: "workflow",
        workflowId: "workflow-1",
        indexingEnabled: true,
        retentionDays: 14,
        redactionEnabled: true,
        now: "2026-07-21T12:00:00.000Z",
      }),
    ).toMatchObject({
      kind: "memory-source",
      status: "enabled",
      capabilities: ["rag"],
      permissions: ["rag.query"],
      memory: {
        tenantId: "workflow-1",
        workflowId: "workflow-1",
        optInIndexing: true,
        retentionDays: 14,
        redactRetrievals: true,
      },
    });
  });

  it("excludes disabled and error memory sources from agent selection", () => {
    const assets = parseMemoryAssetsResponse({
      assets: [
        {
          id: "on",
          kind: "memory-source",
          name: "On",
          status: "enabled",
          permissions: [],
          memory: {
            tenantId: "workflow",
            workflowId: "workflow",
            optInIndexing: false,
            retentionDays: 1,
            redactRetrievals: true,
          },
        },
        {
          id: "off",
          kind: "memory-source",
          name: "Off",
          status: "disabled",
          permissions: [],
          memory: {
            tenantId: "workflow",
            workflowId: "workflow",
            optInIndexing: false,
            retentionDays: 1,
            redactRetrievals: true,
          },
        },
      ],
    });
    expect(selectEnabledMemoryAssets(assets).map(({ id }) => id)).toEqual([
      "on",
    ]);
  });
});
