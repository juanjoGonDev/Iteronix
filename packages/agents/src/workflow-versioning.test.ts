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
  importWorkflowVersionSnapshot,
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
      projectId: workflow.projectId,
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

  it("trims old versions with a retention policy", () => {
    const workflow = createWorkflow({ name: "Retention", nodes: [] });
    const versions = [1, 2, 3, 4].map((version) => ({
      id: `version-${version.toString()}`,
      workflowId: workflow.id,
      projectId: workflow.projectId,
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
  workspaceId: "workspace-1",
  projectId: "project-1",
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
