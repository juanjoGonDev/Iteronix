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
