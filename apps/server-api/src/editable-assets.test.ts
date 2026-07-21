import { describe, expect, it } from "vitest";
import {
  AssetKind,
  AssetStatus,
  createEditableAssetCatalog,
  parseEditableAssetCatalog,
  upsertEditableAsset,
  type EditableAssetRecord,
} from "./editable-assets";

describe("editable asset catalog", () => {
  it("persists every editable Phase 4 asset with safe lifecycle defaults", () => {
    const catalog = createEditableAssetCatalog();
    const assets = [
      AssetKind.Agent,
      AssetKind.McpTool,
      AssetKind.Skill,
      AssetKind.MemorySource,
      AssetKind.Plugin,
    ].reduce(
      (current, kind) => upsertEditableAsset(current, createAsset(kind)),
      catalog,
    );

    expect(assets.records).toHaveLength(5);
    expect(
      assets.records.every((asset) => asset.status === AssetStatus.Enabled),
    ).toBe(true);
    expect(
      assets.records.find((asset) => asset.kind === AssetKind.MemorySource),
    ).toMatchObject({
      memory: {
        optInIndexing: false,
        retentionDays: 0,
        redactRetrievals: true,
      },
    });
    expect(
      assets.records.find((asset) => asset.kind === AssetKind.Plugin),
    ).toMatchObject({
      plugin: { isolation: "process", auditEvents: [] },
    });
  });

  it("rejects malformed security fields instead of persisting unsafe assets", () => {
    expect(
      parseEditableAssetCatalog({ records: [{ id: "unsafe" }] }).records,
    ).toEqual([]);
  });

  it("preserves immutable prompt versions and only permits a sequential append", () => {
    const first = createPromptAsset();
    const catalog = upsertEditableAsset(createEditableAssetCatalog(), first);
    const second = upsertEditableAsset(catalog, {
      ...first,
      prompt: {
        activeVersion: 2,
        versions: [
          ...first.prompt!.versions,
          createPromptVersion(2, "Hello {{name}}"),
        ],
      },
    });
    expect(second.records[0]?.prompt?.activeVersion).toBe(2);
    expect(() =>
      upsertEditableAsset(second, {
        ...first,
        prompt: {
          activeVersion: 2,
          versions: [
            createPromptVersion(1, "Mutated"),
            createPromptVersion(2, "Hello {{name}}"),
          ],
        },
      }),
    ).toThrow("Prompt versions are immutable");
  });

  it("preserves immutable skill versions and only permits a sequential append", () => {
    const first = createSkillAsset();
    const catalog = upsertEditableAsset(createEditableAssetCatalog(), first);
    const second = upsertEditableAsset(catalog, {
      ...first,
      provenance: {
        ...first.provenance,
        artifactFingerprint: "skill-2-fingerprint",
      },
      skill: {
        version: 2,
        lifecycle: AssetStatus.Enabled,
        versions: [
          ...(first.skill!.versions ?? []),
          createSkillVersion(first, 2, "skill-2-fingerprint"),
        ],
      },
    });

    expect(second.records[0]?.skill?.version).toBe(2);
    expect(() =>
      upsertEditableAsset(second, {
        ...first,
        provenance: {
          ...first.provenance,
          artifactFingerprint: "skill-2-fingerprint",
        },
        skill: {
          version: 2,
          lifecycle: AssetStatus.Enabled,
          versions: [
            createSkillVersion(first, 1, "mutated-fingerprint"),
            createSkillVersion(first, 2, "skill-2-fingerprint"),
          ],
        },
      }),
    ).toThrow("Skill versions are immutable");
  });
});

const createAsset = (
  kind: (typeof AssetKind)[keyof typeof AssetKind],
): EditableAssetRecord => ({
  id: `${kind}-1`,
  kind,
  name: `${kind} reference`,
  status: AssetStatus.Enabled,
  capabilities: ["tool-calls"],
  permissions: ["tool.invoke"],
  inputSchema: schema(`${kind}.input`),
  outputSchema: schema(`${kind}.output`),
  limits: { executions: 1, timeoutMs: 1000 },
  provenance: {
    source: "test",
    artifactFingerprint: `${kind}-fingerprint`,
    registeredAt: "2026-07-18T00:00:00.000Z",
  },
});

const schema = (id: string) => ({
  id,
  version: 1,
  schema: { type: "object" as const, additionalProperties: false },
});

const createPromptAsset = (): EditableAssetRecord => ({
  ...createAsset(AssetKind.Prompt),
  id: "prompt-1",
  name: "Greeting",
  prompt: {
    activeVersion: 1,
    versions: [createPromptVersion(1, "Hello {{name}}")],
  },
});

const createPromptVersion = (version: number, template: string) => ({
  version,
  template,
  variables: [{ name: "name", required: true, schema: schema("prompt.name") }],
  provenance: {
    source: "test",
    artifactFingerprint: `prompt-${version}`,
    registeredAt: "2026-07-18T00:00:00.000Z",
  },
  createdAt: "2026-07-18T00:00:00.000Z",
});

const createSkillAsset = (): EditableAssetRecord => {
  const asset = createAsset(AssetKind.Skill);
  return {
    ...asset,
    provenance: {
      ...asset.provenance,
      artifactFingerprint: "skill-1-fingerprint",
    },
    skill: {
      version: 1,
      lifecycle: AssetStatus.Enabled,
      versions: [createSkillVersion(asset, 1, "skill-1-fingerprint")],
    },
  };
};

const createSkillVersion = (
  asset: EditableAssetRecord,
  version: number,
  artifactFingerprint: string,
) => ({
  version,
  capabilities: [...asset.capabilities],
  permissions: [...asset.permissions],
  inputSchema: asset.inputSchema,
  outputSchema: asset.outputSchema,
  limits: asset.limits,
  provenance: {
    ...asset.provenance,
    artifactFingerprint,
  },
  createdAt: "2026-07-21T00:00:00.000Z",
});
