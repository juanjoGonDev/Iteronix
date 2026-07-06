import { createHash } from "node:crypto";
import type {
  WorkflowDefinitionRecord,
  WorkflowDefinitionVersionRecord,
  WorkflowEdgeRecord,
  WorkflowNodeRecord,
} from "../../shared/src/workflows";

type WorkflowVersionDiffSection = {
  added: number;
  removed: number;
  modified: number;
  changed: number;
  details: ReadonlyArray<string>;
};

export type WorkflowVersionDiffRecord = {
  sections: {
    metadata: WorkflowVersionDiffSection;
    settings: WorkflowVersionDiffSection;
    nodes: WorkflowVersionDiffSection;
    edges: WorkflowVersionDiffSection;
    mappings: WorkflowVersionDiffSection;
    outputContracts: WorkflowVersionDiffSection;
    pinnedOutputs: WorkflowVersionDiffSection;
  };
  totals: {
    added: number;
    removed: number;
    modified: number;
    changed: number;
  };
  mappingWarnings: ReadonlyArray<string>;
  outputContractWarnings: ReadonlyArray<string>;
};

export type WorkflowVersionRestorePart =
  | {
      kind: "metadata";
    }
  | {
      kind: "settings";
    }
  | {
      kind: "nodes";
      nodeIds: ReadonlyArray<string>;
    }
  | {
      kind: "edges";
    }
  | {
      kind: "output_contracts";
      nodeIds: ReadonlyArray<string>;
    }
  | {
      kind: "pinned_outputs";
      nodeIds?: ReadonlyArray<string>;
    };

export type WorkflowVersionExportRecord = {
  schemaVersion: 1;
  workflowId: string;
  versionId: string;
  version: number;
  createdAt: string;
  checksum: string;
  snapshot: WorkflowDefinitionRecord;
  note?: string;
  tags: ReadonlyArray<string>;
};

export type WorkflowVersionRetentionPolicy = {
  keepLatest: number;
};

export const compareWorkflowVersions = (
  left: WorkflowDefinitionRecord,
  right: WorkflowDefinitionRecord,
): WorkflowVersionDiffRecord => {
  const sections = {
    metadata: compareMetadata(left, right),
    settings: compareSettings(left, right),
    nodes: compareNodes(left.nodes, right.nodes),
    edges: compareEdges(left.edges, right.edges),
    mappings: compareEdgeMappings(left.edges, right.edges),
    outputContracts: compareNodeOutputContracts(left.nodes, right.nodes),
    pinnedOutputs: compareNodePinnedOutputs(left.nodes, right.nodes),
  };
  const mappingWarnings = readMappingWarnings(right);
  const outputContractWarnings = readOutputContractWarnings(left, right);

  return {
    sections,
    totals: Object.values(sections).reduce(
      (totals, section) => ({
        added: totals.added + section.added,
        removed: totals.removed + section.removed,
        modified: totals.modified + section.modified,
        changed: totals.changed + section.changed,
      }),
      {
        added: 0,
        removed: 0,
        modified: 0,
        changed: 0,
      },
    ),
    mappingWarnings,
    outputContractWarnings,
  };
};

export const readWorkflowVersionChangeSummary = (
  diff: WorkflowVersionDiffRecord,
): string => {
  const parts = [
    formatSummaryPart(diff.sections.nodes.added, "node added", "nodes added"),
    formatSummaryPart(
      diff.sections.nodes.removed,
      "node removed",
      "nodes removed",
    ),
    formatSummaryPart(
      diff.sections.nodes.modified,
      "node changed",
      "nodes changed",
    ),
    formatSummaryPart(diff.sections.edges.added, "edge added", "edges added"),
    formatSummaryPart(
      diff.sections.edges.removed,
      "edge removed",
      "edges removed",
    ),
    formatSummaryPart(
      diff.sections.mappings.changed,
      "mapping changed",
      "mappings changed",
    ),
    formatSummaryPart(
      diff.sections.outputContracts.changed,
      "contract changed",
      "contracts changed",
    ),
    formatSummaryPart(
      diff.sections.pinnedOutputs.changed,
      "pinned output changed",
      "pinned outputs changed",
    ),
  ].filter((part) => part.length > 0);

  if (parts.length === 0 && diff.totals.changed > 0) {
    return `${diff.totals.changed.toString()} workflow changes`;
  }

  return parts.length === 0 ? "No changes" : parts.join(", ");
};

export const computeWorkflowVersionChecksum = (
  workflow: WorkflowDefinitionRecord,
): string =>
  createHash("sha256")
    .update(stableStringify(normalizeWorkflowForChecksum(workflow)))
    .digest("hex");

export const validateWorkflowVersionChecksum = (
  workflow: WorkflowDefinitionRecord,
  checksum: string,
): boolean => computeWorkflowVersionChecksum(workflow) === checksum;

export const restoreWorkflowVersionPart = (
  current: WorkflowDefinitionRecord,
  version: WorkflowDefinitionRecord,
  part: WorkflowVersionRestorePart,
): WorkflowDefinitionRecord => {
  if (part.kind === "metadata") {
    return {
      ...current,
      name: version.name,
      description: version.description,
      status: version.status,
      tags: version.tags,
    };
  }

  if (part.kind === "settings") {
    return {
      ...current,
      trigger: version.trigger,
      executionPolicy: version.executionPolicy,
      defaultContextPolicy: version.defaultContextPolicy,
    };
  }

  if (part.kind === "edges") {
    return {
      ...current,
      edges: version.edges,
    };
  }

  return restoreNodeScopedPart(current, version, part);
};

export const exportWorkflowVersionSnapshot = (
  version: WorkflowDefinitionVersionRecord,
): WorkflowVersionExportRecord => ({
  schemaVersion: 1,
  workflowId: version.workflowId,
  versionId: version.id,
  version: version.version,
  createdAt: version.createdAt,
  checksum:
    version.checksum ?? computeWorkflowVersionChecksum(version.snapshot),
  snapshot: version.snapshot,
  ...(version.note ? { note: version.note } : {}),
  tags: version.tags ?? [],
});

export const importWorkflowVersionSnapshot = (
  exported: WorkflowVersionExportRecord,
): WorkflowDefinitionVersionRecord => {
  if (!validateWorkflowVersionChecksum(exported.snapshot, exported.checksum)) {
    throw new Error("Workflow version checksum mismatch");
  }

  return {
    id: exported.versionId,
    workflowId: exported.workflowId,
    projectId: exported.snapshot.projectId,
    version: exported.version,
    createdAt: exported.createdAt,
    snapshot: exported.snapshot,
    checksum: exported.checksum,
    ...(exported.note ? { note: exported.note } : {}),
    tags: exported.tags,
  };
};

export const trimWorkflowVersionsByRetention = (
  versions: ReadonlyArray<WorkflowDefinitionVersionRecord>,
  policy: WorkflowVersionRetentionPolicy,
): {
  kept: ReadonlyArray<WorkflowDefinitionVersionRecord>;
  removed: ReadonlyArray<WorkflowDefinitionVersionRecord>;
} => {
  const sorted = [...versions].sort(
    (left, right) => right.version - left.version,
  );
  return {
    kept: sorted.slice(0, policy.keepLatest),
    removed: sorted.slice(policy.keepLatest),
  };
};

const compareMetadata = (
  left: WorkflowDefinitionRecord,
  right: WorkflowDefinitionRecord,
): WorkflowVersionDiffSection =>
  compareFields([
    ["Name", left.name, right.name],
    ["Description", left.description, right.description],
    ["Status", left.status, right.status],
    ["Tags", left.tags, right.tags],
  ]);

const compareSettings = (
  left: WorkflowDefinitionRecord,
  right: WorkflowDefinitionRecord,
): WorkflowVersionDiffSection =>
  compareFields([
    ["Trigger", left.trigger, right.trigger],
    ["Execution policy", left.executionPolicy, right.executionPolicy],
    ["Context policy", left.defaultContextPolicy, right.defaultContextPolicy],
  ]);

const compareNodes = (
  left: ReadonlyArray<WorkflowNodeRecord>,
  right: ReadonlyArray<WorkflowNodeRecord>,
): WorkflowVersionDiffSection =>
  compareIdentifiedRecords(
    left,
    right,
    (node) => node.id,
    (node) => node.label,
  );

const compareEdges = (
  left: ReadonlyArray<WorkflowEdgeRecord>,
  right: ReadonlyArray<WorkflowEdgeRecord>,
): WorkflowVersionDiffSection =>
  compareIdentifiedRecords(
    left,
    right,
    (edge) => edge.id,
    (edge) => `${edge.sourceNodeId} → ${edge.targetNodeId}`,
  );

const compareEdgeMappings = (
  left: ReadonlyArray<WorkflowEdgeRecord>,
  right: ReadonlyArray<WorkflowEdgeRecord>,
): WorkflowVersionDiffSection => {
  const leftById = new Map(left.map((edge) => [edge.id, edge]));
  const added = right.filter(
    (edge) =>
      !leftById.has(edge.id) &&
      (edge.mapping.entries.length > 0 || edge.mapping.mode !== "passthrough"),
  );
  const modified = right.filter((edge) => {
    const previous = leftById.get(edge.id);
    return previous
      ? stableStringify(previous.mapping) !== stableStringify(edge.mapping)
      : false;
  });

  return {
    added: added.length,
    removed: 0,
    modified: modified.length,
    changed: added.length + modified.length,
    details: [
      ...added.map((edge) => `Added mapping ${edge.id}`),
      ...modified.map((edge) => `Changed mapping ${edge.id}`),
    ],
  };
};

const compareNodeOutputContracts = (
  left: ReadonlyArray<WorkflowNodeRecord>,
  right: ReadonlyArray<WorkflowNodeRecord>,
): WorkflowVersionDiffSection =>
  compareFields(
    right.map((node) => [
      `Output contract ${node.label}`,
      left.find((candidate) => candidate.id === node.id)?.outputContract,
      node.outputContract,
    ]),
  );

const compareNodePinnedOutputs = (
  left: ReadonlyArray<WorkflowNodeRecord>,
  right: ReadonlyArray<WorkflowNodeRecord>,
): WorkflowVersionDiffSection =>
  compareFields(
    right.map((node) => [
      `Pinned output ${node.label}`,
      left.find((candidate) => candidate.id === node.id)?.config
        .pinnedTestOutput,
      node.config.pinnedTestOutput,
    ]),
  );

const compareFields = (
  fields: ReadonlyArray<readonly [string, unknown, unknown]>,
): WorkflowVersionDiffSection => {
  const details = fields
    .filter(
      ([, left, right]) => stableStringify(left) !== stableStringify(right),
    )
    .map(([label]) => label);
  return {
    added: 0,
    removed: 0,
    modified: details.length,
    changed: details.length,
    details,
  };
};

const compareIdentifiedRecords = <TRecord>(
  left: ReadonlyArray<TRecord>,
  right: ReadonlyArray<TRecord>,
  readId: (record: TRecord) => string,
  readLabel: (record: TRecord) => string,
): WorkflowVersionDiffSection => {
  const leftById = new Map(left.map((record) => [readId(record), record]));
  const rightById = new Map(right.map((record) => [readId(record), record]));
  const added = right.filter((record) => !leftById.has(readId(record)));
  const removed = left.filter((record) => !rightById.has(readId(record)));
  const modified = right.filter((record) => {
    const previous = leftById.get(readId(record));
    return previous
      ? stableStringify(previous) !== stableStringify(record)
      : false;
  });

  return {
    added: added.length,
    removed: removed.length,
    modified: modified.length,
    changed: added.length + removed.length + modified.length,
    details: [
      ...added.map((record) => `Added ${readLabel(record)}`),
      ...removed.map((record) => `Removed ${readLabel(record)}`),
      ...modified.map((record) => `Changed ${readLabel(record)}`),
    ],
  };
};

const readMappingWarnings = (
  workflow: WorkflowDefinitionRecord,
): ReadonlyArray<string> => {
  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  return workflow.edges
    .filter(
      (edge) =>
        !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId),
    )
    .map((edge) => `Connection ${edge.id} references a missing node.`);
};

const readOutputContractWarnings = (
  left: WorkflowDefinitionRecord,
  right: WorkflowDefinitionRecord,
): ReadonlyArray<string> =>
  right.nodes
    .filter((node) => {
      const previous = left.nodes.find((candidate) => candidate.id === node.id);
      return (
        previous?.outputContract &&
        node.outputContract &&
        stableStringify(previous.outputContract.schema) !==
          stableStringify(node.outputContract.schema)
      );
    })
    .map((node) => `${node.label} output contract changed.`);

const restoreNodeScopedPart = (
  current: WorkflowDefinitionRecord,
  version: WorkflowDefinitionRecord,
  part: Exclude<
    WorkflowVersionRestorePart,
    { kind: "metadata" | "settings" | "edges" }
  >,
): WorkflowDefinitionRecord => {
  const nodeIds =
    "nodeIds" in part && part.nodeIds ? new Set(part.nodeIds) : undefined;
  const versionNodesById = new Map(
    version.nodes.map((node) => [node.id, node]),
  );

  return {
    ...current,
    nodes: current.nodes.map((node) => {
      if (nodeIds && !nodeIds.has(node.id)) {
        return node;
      }

      const versionNode = versionNodesById.get(node.id);
      if (!versionNode) {
        return node;
      }

      if (part.kind === "nodes") {
        return versionNode;
      }

      if (part.kind === "output_contracts") {
        return {
          ...node,
          ...(versionNode.outputContract
            ? { outputContract: versionNode.outputContract }
            : {}),
        };
      }

      return {
        ...node,
        config: {
          ...node.config,
          ...(versionNode.config.pinnedTestOutput
            ? { pinnedTestOutput: versionNode.config.pinnedTestOutput }
            : {}),
        },
      };
    }),
  };
};

const formatSummaryPart = (
  count: number,
  singular: string,
  plural: string,
): string => {
  if (count === 0) {
    return "";
  }

  return `${count.toString()} ${count === 1 ? singular : plural}`;
};

const normalizeWorkflowForChecksum = (
  workflow: WorkflowDefinitionRecord,
): unknown => ({
  workspaceId: workflow.workspaceId,
  projectId: workflow.projectId,
  name: workflow.name,
  description: workflow.description,
  status: workflow.status,
  trigger: workflow.trigger,
  nodes: workflow.nodes,
  edges: workflow.edges,
  executionPolicy: workflow.executionPolicy,
  defaultContextPolicy: workflow.defaultContextPolicy,
  tags: workflow.tags,
});

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};
