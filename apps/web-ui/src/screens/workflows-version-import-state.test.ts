import { describe, expect, it } from "vitest";
import {
  readDefaultWorkflowVersionImportVersionId,
  readWorkflowVersionImportCandidates,
} from "./workflows-version-import-state.js";
import type {
  WorkflowVersionExportRecord,
  WorkflowVersionTimelineExportRecord,
} from "../shared/workflow-client.js";

describe("workflow version import state", () => {
  it("returns a single candidate for single-version snapshots", () => {
    const snapshot = createExport("version-1", 1, "Single workflow");

    const candidates = readWorkflowVersionImportCandidates(snapshot);

    expect(candidates).toEqual([
      {
        versionId: "version-1",
        version: 1,
        createdAt: "2026-05-06T08:01:00.000Z",
        snapshotName: "Single workflow",
        summary: "Snapshot export",
        tags: [],
      },
    ]);
    expect(readDefaultWorkflowVersionImportVersionId(snapshot)).toBeUndefined();
  });

  it("returns timeline candidates and defaults to the latest version", () => {
    const timeline: WorkflowVersionTimelineExportRecord = {
      schemaVersion: 1,
      workflowId: "workflow-1",
      exportedAt: "2026-05-06T09:00:00.000Z",
      versions: [
        createExport("version-1", 1, "Workflow v1"),
        createExport("version-2", 2, "Workflow v2"),
      ],
      timeline: [
        {
          versionId: "version-1",
          version: 1,
          createdAt: "2026-05-06T08:01:00.000Z",
          checksum: "1".repeat(64),
          changeSummary: "Initial save",
          tags: ["seed"],
        },
        {
          versionId: "version-2",
          version: 2,
          createdAt: "2026-05-06T08:02:00.000Z",
          checksum: "2".repeat(64),
          changeSummary: "Changed node",
          tags: ["release"],
        },
      ],
    };

    const candidates = readWorkflowVersionImportCandidates(timeline);

    expect(candidates.map((candidate) => candidate.summary)).toEqual([
      "Initial save",
      "Changed node",
    ]);
    expect(candidates[1]?.tags).toEqual(["release"]);
    expect(readDefaultWorkflowVersionImportVersionId(timeline)).toBe(
      "version-2",
    );
  });
});

const createExport = (
  versionId: string,
  version: number,
  name: string,
): WorkflowVersionExportRecord => ({
  schemaVersion: 1,
  workflowId: "workflow-1",
  versionId,
  version,
  createdAt: `2026-05-06T08:0${version.toString()}:00.000Z`,
  checksum: version.toString().repeat(64),
  snapshot: {
    id: "workflow-1",
    name,
    description: "",
    status: "draft",
    version,
    createdAt: "2026-05-06T08:00:00.000Z",
    updatedAt: `2026-05-06T08:0${version.toString()}:00.000Z`,
    trigger: {
      kind: "manual",
      enabled: true,
      config: {},
    },
    viewport: {
      x: 0,
      y: 0,
      zoom: 1,
    },
    nodes: [],
    edges: [],
    executionPolicy: {
      maxNodeRetries: 1,
      allowManualCheckpointResume: true,
    },
    defaultContextPolicy: {
      language: "en",
      carryMessagesLimit: 8,
      carryArtifactLimit: 8,
    },
    tags: [],
  },
  tags: [],
});
