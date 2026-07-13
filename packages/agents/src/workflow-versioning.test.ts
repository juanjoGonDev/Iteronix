import { describe, expect, it } from "vitest";
import {
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
  type WorkflowDefinitionRecord,
} from "../../shared/src/workflows";
import {
  compareWorkflowVersions,
  computeWorkflowVersionChecksum,
  exportWorkflowVersionSnapshot,
  exportWorkflowVersionTimeline,
  importWorkflowVersionSnapshot,
  migrateWorkflowVersionExport,
  migrateWorkflowVersionImportSource,
  previewWorkflowVersionImport,
  readWorkflowVersionChangeSummary,
  restoreWorkflowVersionPart,
  trimWorkflowVersionsByRetention,
  validateWorkflowVersionChecksum,
} from "./workflow-versioning";

const BaseWorkflow = "workflow-1";

describe("workflow versioning", () => {
  it("computes structured diffs and change summaries", () => {
    const before = createWorkflow({
      name: "Before",
      tags: ["stable"],
      nodes: [createNode("node-a", "A")],
    });
    const after = createWorkflow({
      name: "After",
      tags: ["stable", "prod"],
      nodes: [createNode("node-a", "A changed"), createNode("node-b", "B")],
      edges: [
        {
          id: "edge-a-b",
          sourceNodeId: "node-a",
          sourcePortId: "output",
          targetNodeId: "node-b",
          targetPortId: "input",
          mapping: {
            mode: "object",
            entries: [
              {
                targetPath: "$.value",
                source: {
                  kind: "node_output",
                  nodeId: "node-a",
                  path: "$.result",
                },
              },
            ],
          },
        },
      ],
    });

    const diff = compareWorkflowVersions(before, after);

    expect(diff.totals.changed).toBeGreaterThan(0);
    expect(diff.sections.metadata.changed).toBeGreaterThan(0);
    expect(diff.sections.nodes.added).toBe(1);
    expect(diff.sections.nodes.modified).toBe(1);
    expect(diff.sections.edges.added).toBe(1);
    expect(diff.sections.mappings.added).toBe(1);
    expect(readWorkflowVersionChangeSummary(diff)).toContain("1 node added");
  });

  it("validates deterministic snapshot checksums", () => {
    const workflow = createWorkflow({
      name: "Checksum",
      nodes: [createNode("node-a", "A")],
    });
    const checksum = computeWorkflowVersionChecksum(workflow);

    expect(validateWorkflowVersionChecksum(workflow, checksum)).toBe(true);
    expect(
      validateWorkflowVersionChecksum(
        {
          ...workflow,
          name: "Checksum changed",
        },
        checksum,
      ),
    ).toBe(false);
  });

  it("restores selected workflow parts only", () => {
    const current = createWorkflow({
      name: "Current",
      description: "Current description",
      nodes: [
        createNode("node-a", "Current A"),
        createNode("node-b", "Current B"),
      ],
      edges: [],
    });
    const version = createWorkflow({
      name: "Version",
      description: "Version description",
      nodes: [
        createNode("node-a", "Version A", {
          pinnedTestOutput: {
            outputSnapshot: { result: "pinned" },
            updatedAt: "2026-05-06T08:00:00.000Z",
          },
        }),
      ],
      edges: [
        {
          id: "edge-version",
          sourceNodeId: "node-a",
          sourcePortId: "output",
          targetNodeId: "node-b",
          targetPortId: "input",
          mapping: {
            mode: "passthrough",
            entries: [],
          },
        },
      ],
    });

    const metadataOnly = restoreWorkflowVersionPart(current, version, {
      kind: "metadata",
    });
    const nodeOnly = restoreWorkflowVersionPart(current, version, {
      kind: "nodes",
      nodeIds: ["node-a"],
    });
    const pinnedOnly = restoreWorkflowVersionPart(current, version, {
      kind: "pinned_outputs",
    });

    expect(metadataOnly.name).toBe("Version");
    expect(metadataOnly.nodes[0]?.label).toBe("Current A");
    expect(nodeOnly.name).toBe("Current");
    expect(nodeOnly.nodes[0]?.label).toBe("Version A");
    expect(nodeOnly.nodes).toHaveLength(2);
    expect(
      pinnedOnly.nodes[0]?.config.pinnedTestOutput?.outputSnapshot,
    ).toEqual({
      result: "pinned",
    });
  });

  it("exports and imports versioned workflow snapshots", () => {
    const workflow = createWorkflow({
      name: "Exported",
      nodes: [createNode("node-a", "A")],
    });
    const exported = exportWorkflowVersionSnapshot({
      workflowId: workflow.id,
      id: "version-1",
      version: 1,
      createdAt: workflow.updatedAt,
      snapshot: workflow,
      note: "release",
      tags: ["release"],
    });
    const imported = importWorkflowVersionSnapshot(exported);

    expect(imported.snapshot.name).toBe("Exported");
    expect(imported.note).toBe("release");
    expect(imported.tags).toEqual(["release"]);
    expect(imported.checksum).toBe(exported.checksum);
  });

  it("exports a timeline range with version metadata and deterministic checksums", () => {
    const workflow = createWorkflow({
      name: "Timeline",
      nodes: [createNode("node-a", "A")],
    });
    const versions = [1, 2, 3].map((version) => ({
      workflowId: workflow.id,
      id: `version-${version.toString()}`,
      version,
      createdAt: `2026-05-06T08:0${version.toString()}:00.000Z`,
      snapshot: {
        ...workflow,
        version,
        name: `Timeline ${version.toString()}`,
      },
      tags: version === 2 ? ["middle"] : [],
      changeType: version === 1 ? ("manual" as const) : ("autosave" as const),
      changeSummary: `Change ${version.toString()}`,
    }));

    const timeline = exportWorkflowVersionTimeline({
      workflowId: workflow.id,
      versions,
      versionIds: ["version-1", "version-3"],
      exportedAt: "2026-05-06T09:00:00.000Z",
    });

    expect(timeline.schemaVersion).toBe(1);
    expect(timeline.workflowId).toBe(workflow.id);
    expect(timeline.exportedAt).toBe("2026-05-06T09:00:00.000Z");
    expect(timeline.versions.map((version) => version.versionId)).toEqual([
      "version-1",
      "version-3",
    ]);
    expect(timeline.timeline.map((entry) => entry.changeSummary)).toEqual([
      "Change 1",
      "Change 3",
    ]);
    expect(
      timeline.versions.every((version) =>
        validateWorkflowVersionChecksum(version.snapshot, version.checksum),
      ),
    ).toBe(true);
  });

  it("migrates timeline exports into a selected importable version", () => {
    const workflow = createWorkflow({
      name: "Timeline import",
      nodes: [createNode("node-a", "A")],
    });
    const versions = [1, 2].map((version) => ({
      workflowId: workflow.id,
      id: `version-${version.toString()}`,
      version,
      createdAt: `2026-05-06T08:0${version.toString()}:00.000Z`,
      snapshot: {
        ...workflow,
        version,
        name: `Timeline import ${version.toString()}`,
      },
      tags: [],
    }));
    const timeline = exportWorkflowVersionTimeline({
      workflowId: workflow.id,
      versions,
      exportedAt: "2026-05-06T09:00:00.000Z",
    });

    const latest = migrateWorkflowVersionImportSource(timeline);
    const selected = migrateWorkflowVersionImportSource(timeline, "version-1");

    expect(latest.versionId).toBe("version-2");
    expect(selected.versionId).toBe("version-1");
    expect(selected.snapshot.name).toBe("Timeline import 1");
  });

  it("migrates legacy single-version exports into the current schema", () => {
    const workflow = createWorkflow({
      name: "Legacy",
      nodes: [createNode("node-a", "A")],
    });
    const legacy = {
      workflowId: workflow.id,
      versionId: "legacy-version",
      version: 4,
      createdAt: "2026-05-06T08:00:00.000Z",
      snapshot: workflow,
      checksum: computeWorkflowVersionChecksum(workflow),
    };

    const migrated = migrateWorkflowVersionExport(legacy);

    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.versionId).toBe("legacy-version");
    expect(migrated.tags).toEqual([]);
    expect(migrated.snapshot.name).toBe("Legacy");
  });

  it("previews import risks before creating a workflow", () => {
    const workflow = createWorkflow({
      name: "Imported",
      nodes: [createNode("node-a", "A")],
    });
    const exported = exportWorkflowVersionSnapshot({
      workflowId: workflow.id,
      id: "version-1",
      version: 1,
      createdAt: workflow.updatedAt,
      snapshot: workflow,
      tags: [],
    });
    const preview = previewWorkflowVersionImport({
      exported,
      existingWorkflowIds: [workflow.id],
    });

    expect(preview.status).toBe("warning");
    expect(preview.checksumValid).toBe(true);
    expect(preview.workflowIdCollision).toBe(true);
    expect(preview.recommendedIdMode).toBe("regenerate_ids");
    expect(preview.messages.map((message) => message.code)).toEqual([
      "workflow_id_collision",
    ]);
  });

  it("redacts sensitive fields and can omit pinned outputs from exports", () => {
    const workflow: WorkflowDefinitionRecord = {
      ...createWorkflow({
        name: "Exported",
        nodes: [
          createNode("node-a", "A", {
            pinnedTestOutput: {
              outputSnapshot: { result: "pinned" },
              updatedAt: "2026-05-06T08:00:00.000Z",
            },
          }),
        ],
      }),
      trigger: {
        kind: WorkflowTriggerKind.Manual,
        enabled: true,
        config: {
          authorization: "Bearer secret",
          nested: {
            password: "secret-password",
          },
        },
      },
    };
    const exported = exportWorkflowVersionSnapshot(
      {
        workflowId: workflow.id,
        id: "version-1",
        version: 1,
        createdAt: workflow.updatedAt,
        snapshot: workflow,
        tags: [],
      },
      {
        includePinnedOutputs: false,
        redactSecrets: true,
      },
    );
    const exportedNode = exported.snapshot.nodes[0];

    expect(exported.snapshot.trigger.config["authorization"]).toBe(
      "[redacted]",
    );
    expect(exported.snapshot.trigger.config["nested"]).toEqual({
      password: "[redacted]",
    });
    expect(exportedNode?.config.pinnedTestOutput).toBeUndefined();
    expect(
      validateWorkflowVersionChecksum(exported.snapshot, exported.checksum),
    ).toBe(true);
  });

  it("marks corrupt or unsupported imports as invalid", () => {
    const workflow = createWorkflow({
      name: "Unsupported",
      nodes: [createNode("node-a", "A")],
    });
    const exported = exportWorkflowVersionSnapshot({
      workflowId: workflow.id,
      id: "version-1",
      version: 1,
      createdAt: workflow.updatedAt,
      snapshot: workflow,
      tags: [],
    });
    const unsupported = {
      ...exported,
      schemaVersion: 999,
      checksum: "0".repeat(64),
    };
    const preview = previewWorkflowVersionImport({
      exported: unsupported,
      existingWorkflowIds: [],
    });

    expect(preview.status).toBe("invalid");
    expect(preview.schemaSupported).toBe(false);
    expect(preview.checksumValid).toBe(false);
    expect(preview.messages.map((message) => message.code)).toEqual([
      "unsupported_schema_version",
      "checksum_mismatch",
    ]);
  });

  it("trims old versions with a retention policy", () => {
    const workflow = createWorkflow({ name: "Retention", nodes: [] });
    const versions = [1, 2, 3, 4].map((version) => ({
      id: `version-${version.toString()}`,
      workflowId: workflow.id,
      version,
      createdAt: `2026-05-06T08:0${version.toString()}:00.000Z`,
      snapshot: {
        ...workflow,
        version,
      },
    }));

    const trimmed = trimWorkflowVersionsByRetention(versions, {
      keepLatest: 2,
    });

    expect(trimmed.kept.map((version) => version.version)).toEqual([4, 3]);
    expect(trimmed.removed.map((version) => version.version)).toEqual([2, 1]);
  });
});

const createWorkflow = (input: {
  name: string;
  description?: string;
  tags?: ReadonlyArray<string>;
  nodes: WorkflowDefinitionRecord["nodes"];
  edges?: WorkflowDefinitionRecord["edges"];
}): WorkflowDefinitionRecord => ({
  id: BaseWorkflow,
  name: input.name,
  description: input.description ?? "Description",
  status: WorkflowRecordStatus.Draft,
  version: 1,
  createdAt: "2026-05-06T08:00:00.000Z",
  updatedAt: "2026-05-06T08:00:00.000Z",
  trigger: {
    kind: WorkflowTriggerKind.Manual,
    enabled: true,
    config: {},
  },
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
  nodes: input.nodes,
  edges: input.edges ?? [],
  executionPolicy: {
    maxNodeRetries: 1,
    allowManualCheckpointResume: true,
  },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 8,
    carryArtifactLimit: 8,
  },
  tags: input.tags ?? [],
});

const createNode = (
  id: string,
  label: string,
  config: WorkflowDefinitionRecord["nodes"][number]["config"] = {},
): WorkflowDefinitionRecord["nodes"][number] => ({
  id,
  kind: WorkflowNodeKind.AiAgent,
  label,
  position: {
    x: 0,
    y: 0,
  },
  width: 220,
  collapsed: false,
  config,
  inputPorts: [
    {
      id: "input",
      name: "input",
      acceptsMany: false,
    },
  ],
  outputPorts: [
    {
      id: "output",
      name: "output",
      acceptsMany: true,
    },
  ],
  attachedGuardrails: [],
});
