import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSkillAssetsClient,
  createSkillAssetRecord,
  updateSkillAssetRecord,
  parseSkillAssetsResponse,
  selectEnabledSkillAssets,
} from "./skill-assets-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("skill assets client", () => {
  it("uses the HttpOnly IDE session when listing skill assets", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ assets: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "http://localhost:4000" } });

    await createSkillAssetsClient().list();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/assets/list"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("filters non-skill assets and keeps editable skill metadata", () => {
    expect(
      parseSkillAssetsResponse({
        assets: [
          { id: "prompt-1", kind: "prompt", name: "Prompt" },
          {
            id: "skill-1",
            kind: "skill",
            name: "Support policy",
            status: "enabled",
            permissions: ["workflow.read"],
            skill: { version: 2, lifecycle: "active", description: "Reply" },
          },
        ],
      }),
    ).toMatchObject([
      {
        id: "skill-1",
        name: "Support policy",
        status: "enabled",
        version: 2,
        lifecycle: "active",
        description: "Reply",
        permissions: ["workflow.read"],
      },
    ]);
  });

  it("creates an editable server-compatible skill asset", () => {
    expect(
      createSkillAssetRecord({
        id: "skill-1",
        name: "Support policy",
        description: "Reply with policy.",
        permissions: ["workflow.read"],
        now: "2026-07-21T12:00:00.000Z",
      }),
    ).toMatchObject({
      id: "skill-1",
      kind: "skill",
      status: "enabled",
      skill: { version: 1, lifecycle: "enabled" },
    });
  });

  it("appends an immutable skill version when editing its contract", () => {
    const asset = parseSkillAssetsResponse({
      assets: [
        {
          id: "skill-1",
          kind: "skill",
          name: "Support policy",
          status: "enabled",
          capabilities: [],
          permissions: ["workflow.read"],
          inputSchema: {
            id: "skill-input",
            version: 1,
            schema: { type: "object" },
          },
          outputSchema: {
            id: "skill-output",
            version: 1,
            schema: { type: "object" },
          },
          limits: { executions: 1, timeoutMs: 30000 },
          provenance: {
            source: "ide",
            artifactFingerprint: "skill-1",
            registeredAt: "2026-07-21T10:00:00.000Z",
          },
          skill: {
            version: 1,
            lifecycle: "enabled",
            versions: [
              {
                version: 1,
                capabilities: [],
                permissions: ["workflow.read"],
                inputSchema: {
                  id: "skill-input",
                  version: 1,
                  schema: { type: "object" },
                },
                outputSchema: {
                  id: "skill-output",
                  version: 1,
                  schema: { type: "object" },
                },
                limits: { executions: 1, timeoutMs: 30000 },
                provenance: {
                  source: "ide",
                  artifactFingerprint: "skill-1",
                  registeredAt: "2026-07-21T10:00:00.000Z",
                },
                createdAt: "2026-07-21T10:00:00.000Z",
              },
            ],
          },
        },
      ],
    })[0];
    if (!asset) throw new Error("Expected skill asset");

    expect(
      updateSkillAssetRecord({
        asset,
        name: "Support policy v2",
        description: "",
        permissions: ["workflow.read", "rag.query"],
        now: "2026-07-21T11:00:00.000Z",
      }),
    ).toMatchObject({
      name: "Support policy v2",
      permissions: ["workflow.read", "rag.query"],
      skill: {
        version: 2,
        lifecycle: "enabled",
        versions: [
          expect.objectContaining({ version: 1 }),
          expect.objectContaining({
            version: 2,
            permissions: ["workflow.read", "rag.query"],
            createdAt: "2026-07-21T11:00:00.000Z",
          }),
        ],
      },
    });
  });
});

describe("enabled skill selection", () => {
  it("excludes disabled and error skills from the workflow editor selector", () => {
    const skills = parseSkillAssetsResponse({
      assets: [
        {
          id: "enabled",
          kind: "skill",
          name: "Enabled",
          status: "enabled",
          permissions: [],
          skill: { version: 1, lifecycle: "active", description: "" },
        },
        {
          id: "disabled",
          kind: "skill",
          name: "Disabled",
          status: "disabled",
          permissions: [],
          skill: { version: 1, lifecycle: "disabled", description: "" },
        },
        {
          id: "error",
          kind: "skill",
          name: "Error",
          status: "error",
          permissions: [],
          skill: { version: 1, lifecycle: "error", description: "" },
        },
      ],
    });

    expect(selectEnabledSkillAssets(skills).map((skill) => skill.id)).toEqual([
      "enabled",
    ]);
  });
});
