import type {
  WorkflowVersionImportSourceRecord,
  WorkflowVersionTimelineExportRecord,
} from "../shared/workflow-client.js";

export type WorkflowVersionImportCandidateRecord = {
  versionId: string;
  version: number;
  createdAt: string;
  snapshotName: string;
  summary: string;
  tags: ReadonlyArray<string>;
};

const SnapshotExportSummary = "Snapshot export";

export const readWorkflowVersionImportCandidates = (
  source: WorkflowVersionImportSourceRecord,
): ReadonlyArray<WorkflowVersionImportCandidateRecord> => {
  if (isWorkflowVersionTimelineImportSource(source)) {
    return source.versions.map((version) => {
      const timelineEntry = source.timeline.find(
        (entry) => entry.versionId === version.versionId,
      );
      return {
        versionId: version.versionId,
        version: version.version,
        createdAt: version.createdAt,
        snapshotName: version.snapshot.name,
        summary: timelineEntry?.changeSummary ?? SnapshotExportSummary,
        tags: timelineEntry?.tags ?? version.tags,
      };
    });
  }

  return [
    {
      versionId: source.versionId,
      version: source.version,
      createdAt: source.createdAt,
      snapshotName: source.snapshot.name,
      summary: SnapshotExportSummary,
      tags: source.tags,
    },
  ];
};

export const readDefaultWorkflowVersionImportVersionId = (
  source: WorkflowVersionImportSourceRecord,
): string | undefined => {
  if (!isWorkflowVersionTimelineImportSource(source)) {
    return undefined;
  }

  return source.versions.reduce((latest, version) =>
    version.version > latest.version ? version : latest,
  ).versionId;
};

export const isWorkflowVersionTimelineImportSource = (
  source: WorkflowVersionImportSourceRecord,
): source is WorkflowVersionTimelineExportRecord => "versions" in source;
