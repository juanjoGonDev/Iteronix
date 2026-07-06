import { requestJson, streamText } from "./server-api-client.js";
import type {
  WorkflowAlertRecord,
  WorkflowAssetRecord,
  WorkflowAssetUpsertInput,
  WorkflowAssetUsageRecord,
  WorkflowDefinitionRecord,
  WorkflowDefinitionVersionRecord,
  WorkflowDefinitionUpsertInput,
  WorkflowExecutionRecord,
  WorkflowGuardrailFindingRecord,
  WorkflowNodeExecutionInputSourceRecord,
  WorkflowNodeKind,
  WorkflowProviderSelectionRecord,
  WorkflowUsageTotalsRecord,
} from "../screens/workflows-editor-state.js";

const EndpointPath = {
  DefinitionsList: "/workflows/definitions/list",
  DefinitionsGet: "/workflows/definitions/get",
  DefinitionsVersions: "/workflows/definitions/versions",
  DefinitionsRestoreVersion: "/workflows/definitions/restore-version",
  DefinitionsRestoreVersionPart: "/workflows/definitions/restore-version-part",
  DefinitionsCloneVersion: "/workflows/definitions/clone-version",
  DefinitionsExportVersion: "/workflows/definitions/export-version",
  DefinitionsImportVersion: "/workflows/definitions/import-version",
  DefinitionsCleanupVersions: "/workflows/definitions/cleanup-versions",
  DefinitionsUpsert: "/workflows/definitions/upsert",
  DefinitionsDelete: "/workflows/definitions/delete",
  AssetsList: "/workflows/assets/list",
  AssetsGet: "/workflows/assets/get",
  AssetsUpsert: "/workflows/assets/upsert",
  AssetsDelete: "/workflows/assets/delete",
  AssetsUsage: "/workflows/assets/usage",
  ExecutionsList: "/workflows/executions/list",
  ExecutionsGet: "/workflows/executions/get",
  ExecutionsDelete: "/workflows/executions/delete",
  ExecutionsCancel: "/workflows/executions/cancel",
  ExecutionsRun: "/workflows/executions/run",
  ExecutionsStream: "/workflows/executions/stream",
  ExecutionsRunNode: "/workflows/executions/run-node",
  ExecutionsStreamNode: "/workflows/executions/stream-node",
  ProvidersTest: "/workflows/providers/test",
} as const;

export type WorkflowVersionRestorePart =
  | {
      kind: "metadata" | "settings" | "edges";
    }
  | {
      kind: "nodes" | "output_contracts";
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

export type WorkflowNodeProviderTestResult = {
  definition: WorkflowDefinitionRecord;
  nodeId: string;
  status: "passed" | "failed";
  testedAt: string;
  message: string;
};

export const WorkflowRunStreamEventType = {
  WorkflowStarted: "workflow_started",
  NodeStarted: "node_started",
  NodeDelta: "node_delta",
  NodeCompleted: "node_completed",
  NodeFailed: "node_failed",
  WorkflowCompleted: "workflow_completed",
  WorkflowFailed: "workflow_failed",
} as const;

export type WorkflowRunStreamEvent =
  | {
      type: typeof WorkflowRunStreamEventType.WorkflowStarted;
      workflowId: string;
      workflowRunId: string;
      startedAt: string;
    }
  | {
      type: typeof WorkflowRunStreamEventType.NodeStarted;
      workflowId: string;
      workflowRunId: string;
      nodeId: string;
      nodeKind: WorkflowNodeKind;
      label: string;
      startedAt: string;
    }
  | {
      type: typeof WorkflowRunStreamEventType.NodeDelta;
      workflowId: string;
      workflowRunId: string;
      nodeId: string;
      delta: string;
      emittedAt: string;
    }
  | {
      type: typeof WorkflowRunStreamEventType.NodeCompleted;
      workflowId: string;
      workflowRunId: string;
      nodeId: string;
      nodeKind: WorkflowNodeKind;
      label: string;
      status: "completed" | "failed" | "awaiting_review";
      startedAt: string;
      finishedAt: string;
      outputSnapshot: unknown;
      alerts: ReadonlyArray<WorkflowAlertRecord>;
      guardrailFindings: ReadonlyArray<WorkflowGuardrailFindingRecord>;
      usage?: WorkflowUsageTotalsRecord;
      provider?: WorkflowProviderSelectionRecord;
    }
  | {
      type: typeof WorkflowRunStreamEventType.NodeFailed;
      workflowId: string;
      workflowRunId: string;
      nodeId: string;
      nodeKind: WorkflowNodeKind;
      label: string;
      startedAt: string;
      finishedAt: string;
      message: string;
    }
  | {
      type: typeof WorkflowRunStreamEventType.WorkflowCompleted;
      workflowId: string;
      workflowRunId: string;
      finishedAt: string;
      execution: WorkflowExecutionRecord;
    }
  | {
      type: typeof WorkflowRunStreamEventType.WorkflowFailed;
      workflowId: string;
      workflowRunId: string;
      finishedAt: string;
      error?: string;
      execution?: WorkflowExecutionRecord;
    };

export type WorkflowClient = {
  listDefinitions: (input: {
    projectId: string;
  }) => Promise<ReadonlyArray<WorkflowDefinitionRecord>>;
  getDefinition: (input: {
    workflowId: string;
  }) => Promise<WorkflowDefinitionRecord>;
  listDefinitionVersions: (input: {
    workflowId: string;
  }) => Promise<ReadonlyArray<WorkflowDefinitionVersionRecord>>;
  restoreDefinitionVersion: (input: {
    workflowId: string;
    versionId: string;
  }) => Promise<WorkflowDefinitionRecord>;
  restoreDefinitionVersionPart: (input: {
    workflowId: string;
    versionId: string;
    part: WorkflowVersionRestorePart;
  }) => Promise<WorkflowDefinitionRecord>;
  cloneDefinitionVersion: (input: {
    workflowId: string;
    versionId: string;
    name?: string;
  }) => Promise<WorkflowDefinitionRecord>;
  exportDefinitionVersion: (input: {
    workflowId: string;
    versionId: string;
  }) => Promise<WorkflowVersionExportRecord>;
  importDefinitionVersion: (input: {
    exported: WorkflowVersionExportRecord;
    name?: string;
  }) => Promise<WorkflowDefinitionRecord>;
  cleanupDefinitionVersions: (input: {
    workflowId: string;
    keepLatest: number;
  }) => Promise<{
    kept: ReadonlyArray<WorkflowDefinitionVersionRecord>;
    removed: ReadonlyArray<WorkflowDefinitionVersionRecord>;
  }>;
  upsertDefinition: (input: {
    projectId: string;
    definition: WorkflowDefinitionUpsertInput;
  }) => Promise<WorkflowDefinitionRecord>;
  deleteDefinition: (input: {
    workflowId: string;
  }) => Promise<WorkflowDefinitionRecord>;
  listAssets: (input: {
    projectId: string;
    workspaceId: string;
  }) => Promise<ReadonlyArray<WorkflowAssetRecord>>;
  getAsset: (input: { assetId: string }) => Promise<WorkflowAssetRecord>;
  upsertAsset: (input: {
    projectId: string;
    asset: WorkflowAssetUpsertInput;
  }) => Promise<WorkflowAssetRecord>;
  deleteAsset: (input: { assetId: string }) => Promise<WorkflowAssetRecord>;
  listAssetUsages: (input: {
    assetId?: string;
    workflowId?: string;
    projectId?: string;
  }) => Promise<ReadonlyArray<WorkflowAssetUsageRecord>>;
  listExecutions: (input: {
    projectId: string;
    workflowId?: string;
  }) => Promise<ReadonlyArray<WorkflowExecutionRecord>>;
  getExecution: (input: {
    executionId: string;
  }) => Promise<WorkflowExecutionRecord>;
  deleteExecution: (input: {
    executionId: string;
  }) => Promise<WorkflowExecutionRecord>;
  cancelExecution: (input: {
    executionId: string;
  }) => Promise<WorkflowExecutionRecord>;
  runWorkflow: (input: {
    workflowId: string;
  }) => Promise<WorkflowExecutionRecord>;
  streamWorkflow: (input: {
    workflowId: string;
    signal?: AbortSignal;
    onEvent: (event: WorkflowRunStreamEvent) => void;
  }) => Promise<void>;
  runNode: (input: {
    workflowId: string;
    nodeId: string;
    inputSource: WorkflowNodeExecutionInputSourceRecord;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
  }) => Promise<WorkflowExecutionRecord>;
  streamNode: (input: {
    workflowId: string;
    nodeId: string;
    inputSource: WorkflowNodeExecutionInputSourceRecord;
    seedNodeOutputs?: Readonly<Record<string, unknown>>;
    signal?: AbortSignal;
    onEvent: (event: WorkflowRunStreamEvent) => void;
  }) => Promise<void>;
  testNodeProvider: (input: {
    workflowId: string;
    nodeId: string;
  }) => Promise<WorkflowNodeProviderTestResult>;
};

export const createWorkflowClient = (): WorkflowClient => ({
  listDefinitions: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsList,
      body: {
        projectId: input.projectId,
      },
      parse: parseWorkflowDefinitionListResponse,
    }),
  getDefinition: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsGet,
      body: {
        workflowId: input.workflowId,
      },
      parse: parseWorkflowDefinitionResponse,
    }),
  listDefinitionVersions: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsVersions,
      body: {
        workflowId: input.workflowId,
      },
      parse: parseWorkflowDefinitionVersionListResponse,
    }),
  restoreDefinitionVersion: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsRestoreVersion,
      body: {
        workflowId: input.workflowId,
        versionId: input.versionId,
      },
      parse: parseWorkflowDefinitionResponse,
    }),
  restoreDefinitionVersionPart: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsRestoreVersionPart,
      body: {
        workflowId: input.workflowId,
        versionId: input.versionId,
        part: input.part,
      },
      parse: parseWorkflowDefinitionResponse,
    }),
  cloneDefinitionVersion: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsCloneVersion,
      body: {
        workflowId: input.workflowId,
        versionId: input.versionId,
        ...(input.name ? { name: input.name } : {}),
      },
      parse: parseWorkflowDefinitionResponse,
    }),
  exportDefinitionVersion: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsExportVersion,
      body: {
        workflowId: input.workflowId,
        versionId: input.versionId,
      },
      parse: parseWorkflowDefinitionExportResponse,
    }),
  importDefinitionVersion: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsImportVersion,
      body: {
        exported: input.exported,
        ...(input.name ? { name: input.name } : {}),
      },
      parse: parseWorkflowDefinitionResponse,
    }),
  cleanupDefinitionVersions: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsCleanupVersions,
      body: {
        workflowId: input.workflowId,
        keepLatest: input.keepLatest,
      },
      parse: parseWorkflowDefinitionCleanupResponse,
    }),
  upsertDefinition: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsUpsert,
      body: {
        projectId: input.projectId,
        definition: input.definition,
      },
      parse: parseWorkflowDefinitionResponse,
    }),
  deleteDefinition: (input) =>
    requestJson({
      path: EndpointPath.DefinitionsDelete,
      body: {
        workflowId: input.workflowId,
      },
      parse: parseWorkflowDefinitionResponse,
    }),
  listAssets: (input) =>
    requestJson({
      path: EndpointPath.AssetsList,
      body: {
        projectId: input.projectId,
        workspaceId: input.workspaceId,
      },
      parse: parseWorkflowAssetListResponse,
    }),
  getAsset: (input) =>
    requestJson({
      path: EndpointPath.AssetsGet,
      body: {
        assetId: input.assetId,
      },
      parse: parseWorkflowAssetResponse,
    }),
  upsertAsset: (input) =>
    requestJson({
      path: EndpointPath.AssetsUpsert,
      body: {
        projectId: input.projectId,
        asset: input.asset,
      },
      parse: parseWorkflowAssetResponse,
    }),
  deleteAsset: (input) =>
    requestJson({
      path: EndpointPath.AssetsDelete,
      body: {
        assetId: input.assetId,
      },
      parse: parseWorkflowAssetResponse,
    }),
  listAssetUsages: (input) =>
    requestJson({
      path: EndpointPath.AssetsUsage,
      body: {
        ...(input.assetId ? { assetId: input.assetId } : {}),
        ...(input.workflowId ? { workflowId: input.workflowId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      },
      parse: parseWorkflowAssetUsageListResponse,
    }),
  listExecutions: (input) =>
    requestJson({
      path: EndpointPath.ExecutionsList,
      body: {
        projectId: input.projectId,
        ...(input.workflowId ? { workflowId: input.workflowId } : {}),
      },
      parse: parseWorkflowExecutionListResponse,
    }),
  getExecution: (input) =>
    requestJson({
      path: EndpointPath.ExecutionsGet,
      body: {
        executionId: input.executionId,
      },
      parse: parseWorkflowExecutionResponse,
    }),
  deleteExecution: (input) =>
    requestJson({
      path: EndpointPath.ExecutionsDelete,
      body: {
        executionId: input.executionId,
      },
      parse: parseWorkflowExecutionResponse,
    }),
  cancelExecution: (input) =>
    requestJson({
      path: EndpointPath.ExecutionsCancel,
      body: {
        executionId: input.executionId,
      },
      parse: parseWorkflowExecutionResponse,
    }),
  runWorkflow: (input) =>
    requestJson({
      path: EndpointPath.ExecutionsRun,
      body: {
        workflowId: input.workflowId,
      },
      parse: parseWorkflowExecutionResponse,
    }),
  streamWorkflow: async (input) => {
    let buffer = "";

    await streamText({
      path: `${EndpointPath.ExecutionsStream}?workflowId=${encodeURIComponent(input.workflowId)}`,
      ...(input.signal ? { signal: input.signal } : {}),
      onChunk: (chunk) => {
        buffer += chunk;
        let boundaryIndex = buffer.indexOf("\n\n");

        while (boundaryIndex >= 0) {
          const rawBlock = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          const decoded = decodeServerSentEvents(`${rawBlock}\n\n`);

          for (const event of decoded) {
            input.onEvent(parseWorkflowRunStreamEvent(event.event, event.data));
          }

          boundaryIndex = buffer.indexOf("\n\n");
        }
      },
    });
  },
  runNode: (input) =>
    requestJson({
      path: EndpointPath.ExecutionsRunNode,
      body: {
        workflowId: input.workflowId,
        nodeId: input.nodeId,
        inputSource: input.inputSource,
        ...(input.seedNodeOutputs
          ? { seedNodeOutputs: input.seedNodeOutputs }
          : {}),
      },
      parse: parseWorkflowExecutionResponse,
    }),
  streamNode: async (input) => {
    let buffer = "";

    await streamText({
      path: readWorkflowNodeStreamPath(input),
      ...(input.signal ? { signal: input.signal } : {}),
      onChunk: (chunk) => {
        buffer += chunk;
        let boundaryIndex = buffer.indexOf("\n\n");

        while (boundaryIndex >= 0) {
          const rawBlock = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);
          const decoded = decodeServerSentEvents(`${rawBlock}\n\n`);

          for (const event of decoded) {
            input.onEvent(parseWorkflowRunStreamEvent(event.event, event.data));
          }

          boundaryIndex = buffer.indexOf("\n\n");
        }
      },
    });
  },
  testNodeProvider: (input) =>
    requestJson({
      path: EndpointPath.ProvidersTest,
      body: {
        workflowId: input.workflowId,
        nodeId: input.nodeId,
      },
      parse: parseWorkflowNodeProviderTestResponse,
    }),
});

export const parseWorkflowDefinitionListResponse = (
  value: unknown,
): ReadonlyArray<WorkflowDefinitionRecord> =>
  readRequiredArray(value, "workflowDefinitionListResponse", "definitions").map(
    (item) =>
      parseWorkflowDefinitionRecord(
        ensureRecord(item, "workflowDefinitionRecord"),
      ),
  );

const parseWorkflowDefinitionResponse = (
  value: unknown,
): WorkflowDefinitionRecord =>
  parseWorkflowDefinitionRecord(
    readRequiredRecord(value, "workflowDefinitionResponse", "definition"),
  );

export const parseWorkflowDefinitionVersionListResponse = (
  value: unknown,
): ReadonlyArray<WorkflowDefinitionVersionRecord> =>
  readRequiredArray(
    value,
    "workflowDefinitionVersionListResponse",
    "versions",
  ).map((item) =>
    parseWorkflowDefinitionVersionRecord(
      ensureRecord(item, "workflowDefinitionVersionRecord"),
    ),
  );

export const parseWorkflowDefinitionExportResponse = (
  value: unknown,
): WorkflowVersionExportRecord => {
  const record = readRequiredRecord(
    value,
    "workflowDefinitionExportResponse",
    "exported",
  );
  const note = readOptionalString(record, "note");
  return {
    schemaVersion: readRequiredNumber(
      record,
      "workflowVersionExport",
      "schemaVersion",
    ) as 1,
    workflowId: readRequiredString(
      record,
      "workflowVersionExport",
      "workflowId",
    ),
    versionId: readRequiredString(record, "workflowVersionExport", "versionId"),
    version: readRequiredNumber(record, "workflowVersionExport", "version"),
    createdAt: readRequiredString(record, "workflowVersionExport", "createdAt"),
    checksum: readRequiredString(record, "workflowVersionExport", "checksum"),
    snapshot: parseWorkflowDefinitionRecord(
      readRequiredRecord(record, "workflowVersionExport", "snapshot"),
    ),
    ...(note ? { note } : {}),
    tags: readRequiredStringArray(record, "workflowVersionExport", "tags"),
  };
};

export const parseWorkflowDefinitionCleanupResponse = (
  value: unknown,
): {
  kept: ReadonlyArray<WorkflowDefinitionVersionRecord>;
  removed: ReadonlyArray<WorkflowDefinitionVersionRecord>;
} => ({
  kept: readRequiredArray(
    value,
    "workflowDefinitionCleanupResponse",
    "kept",
  ).map((item) =>
    parseWorkflowDefinitionVersionRecord(
      ensureRecord(item, "workflowDefinitionVersionRecord"),
    ),
  ),
  removed: readRequiredArray(
    value,
    "workflowDefinitionCleanupResponse",
    "removed",
  ).map((item) =>
    parseWorkflowDefinitionVersionRecord(
      ensureRecord(item, "workflowDefinitionVersionRecord"),
    ),
  ),
});

export const parseWorkflowAssetListResponse = (
  value: unknown,
): ReadonlyArray<WorkflowAssetRecord> =>
  readRequiredArray(value, "workflowAssetListResponse", "assets").map((item) =>
    parseWorkflowAssetRecord(ensureRecord(item, "workflowAssetRecord")),
  );

const parseWorkflowAssetResponse = (value: unknown): WorkflowAssetRecord =>
  parseWorkflowAssetRecord(
    readRequiredRecord(value, "workflowAssetResponse", "asset"),
  );

const parseWorkflowAssetUsageListResponse = (
  value: unknown,
): ReadonlyArray<WorkflowAssetUsageRecord> =>
  readRequiredArray(value, "workflowAssetUsageListResponse", "usages").map(
    (item) =>
      parseWorkflowAssetUsageRecord(
        ensureRecord(item, "workflowAssetUsageRecord"),
      ),
  );

export const parseWorkflowExecutionListResponse = (
  value: unknown,
): ReadonlyArray<WorkflowExecutionRecord> =>
  readRequiredArray(value, "workflowExecutionListResponse", "executions").map(
    (item) =>
      parseWorkflowExecutionRecord(
        ensureRecord(item, "workflowExecutionRecord"),
      ),
  );

const parseWorkflowExecutionResponse = (
  value: unknown,
): WorkflowExecutionRecord =>
  parseWorkflowExecutionRecord(
    readRequiredRecord(value, "workflowExecutionResponse", "execution"),
  );

const readWorkflowNodeStreamPath = (input: {
  workflowId: string;
  nodeId: string;
  inputSource: WorkflowNodeExecutionInputSourceRecord;
  seedNodeOutputs?: Readonly<Record<string, unknown>>;
}): string => {
  const params = new URLSearchParams({
    workflowId: input.workflowId,
    nodeId: input.nodeId,
    inputSourceKind: input.inputSource.kind,
  });
  if ("nodeId" in input.inputSource) {
    params.set("sourceNodeId", input.inputSource.nodeId);
  }
  if (input.seedNodeOutputs) {
    params.set("seedNodeOutputs", JSON.stringify(input.seedNodeOutputs));
  }

  return `${EndpointPath.ExecutionsStreamNode}?${params.toString()}`;
};

export const parseWorkflowNodeProviderTestResponse = (
  value: unknown,
): WorkflowNodeProviderTestResult => {
  const record = ensureRecord(value, "workflowNodeProviderTestResponse");
  return {
    definition: parseWorkflowDefinitionRecord(
      readRequiredRecord(
        record,
        "workflowNodeProviderTestResponse",
        "definition",
      ),
    ),
    nodeId: readRequiredString(
      record,
      "workflowNodeProviderTestResponse",
      "nodeId",
    ),
    status: readRequiredString(
      record,
      "workflowNodeProviderTestResponse",
      "status",
    ) as WorkflowNodeProviderTestResult["status"],
    testedAt: readRequiredString(
      record,
      "workflowNodeProviderTestResponse",
      "testedAt",
    ),
    message: readRequiredString(
      record,
      "workflowNodeProviderTestResponse",
      "message",
    ),
  };
};

export const decodeServerSentEvents = (
  value: string,
): ReadonlyArray<{
  event: string;
  data: unknown;
  id?: string;
}> => {
  const blocks = value
    .split(/\n\n/u)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return blocks
    .map((block) => {
      const lines = block.split(/\n/u);
      let id: string | undefined;
      let eventName = "";
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith("id:")) {
          id = line.slice(3).trim();
          continue;
        }

        if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
          continue;
        }

        if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (eventName.length === 0 || dataLines.length === 0) {
        return null;
      }

      return {
        event: eventName,
        data: JSON.parse(dataLines.join("\n")) as unknown,
        ...(id ? { id } : {}),
      };
    })
    .filter(
      (event): event is { event: string; data: unknown; id?: string } =>
        event !== null,
    );
};

export const parseWorkflowRunStreamEvent = (
  eventName: string,
  value: unknown,
): WorkflowRunStreamEvent => {
  const record = ensureRecord(value, "workflowRunStreamEvent");

  if (eventName === WorkflowRunStreamEventType.WorkflowStarted) {
    return {
      type: WorkflowRunStreamEventType.WorkflowStarted,
      workflowId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowId",
      ),
      workflowRunId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowRunId",
      ),
      startedAt: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "startedAt",
      ),
    };
  }

  if (eventName === WorkflowRunStreamEventType.NodeStarted) {
    return {
      type: WorkflowRunStreamEventType.NodeStarted,
      workflowId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowId",
      ),
      workflowRunId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowRunId",
      ),
      nodeId: readRequiredString(record, "workflowRunStreamEvent", "nodeId"),
      nodeKind: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "nodeKind",
      ) as WorkflowNodeKind,
      label: readRequiredString(record, "workflowRunStreamEvent", "label"),
      startedAt: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "startedAt",
      ),
    };
  }

  if (eventName === WorkflowRunStreamEventType.NodeDelta) {
    return {
      type: WorkflowRunStreamEventType.NodeDelta,
      workflowId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowId",
      ),
      workflowRunId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowRunId",
      ),
      nodeId: readRequiredString(record, "workflowRunStreamEvent", "nodeId"),
      delta: readRequiredString(record, "workflowRunStreamEvent", "delta"),
      emittedAt: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "emittedAt",
      ),
    };
  }

  if (eventName === WorkflowRunStreamEventType.NodeCompleted) {
    return {
      type: WorkflowRunStreamEventType.NodeCompleted,
      workflowId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowId",
      ),
      workflowRunId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowRunId",
      ),
      nodeId: readRequiredString(record, "workflowRunStreamEvent", "nodeId"),
      nodeKind: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "nodeKind",
      ) as WorkflowNodeKind,
      label: readRequiredString(record, "workflowRunStreamEvent", "label"),
      status: readRequiredString(record, "workflowRunStreamEvent", "status") as
        | "completed"
        | "failed"
        | "awaiting_review",
      startedAt: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "startedAt",
      ),
      finishedAt: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "finishedAt",
      ),
      outputSnapshot: record["outputSnapshot"],
      alerts: readRequiredArray(
        record,
        "workflowRunStreamEvent",
        "alerts",
      ) as ReadonlyArray<WorkflowAlertRecord>,
      guardrailFindings: readRequiredArray(
        record,
        "workflowRunStreamEvent",
        "guardrailFindings",
      ) as ReadonlyArray<WorkflowGuardrailFindingRecord>,
      ...(record["usage"]
        ? { usage: record["usage"] as WorkflowUsageTotalsRecord }
        : {}),
      ...(record["provider"]
        ? { provider: record["provider"] as WorkflowProviderSelectionRecord }
        : {}),
    };
  }

  if (eventName === WorkflowRunStreamEventType.NodeFailed) {
    return {
      type: WorkflowRunStreamEventType.NodeFailed,
      workflowId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowId",
      ),
      workflowRunId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowRunId",
      ),
      nodeId: readRequiredString(record, "workflowRunStreamEvent", "nodeId"),
      nodeKind: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "nodeKind",
      ) as WorkflowNodeKind,
      label: readRequiredString(record, "workflowRunStreamEvent", "label"),
      startedAt: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "startedAt",
      ),
      finishedAt: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "finishedAt",
      ),
      message: readRequiredString(record, "workflowRunStreamEvent", "message"),
    };
  }

  if (eventName === WorkflowRunStreamEventType.WorkflowCompleted) {
    return {
      type: WorkflowRunStreamEventType.WorkflowCompleted,
      workflowId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowId",
      ),
      workflowRunId: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "workflowRunId",
      ),
      finishedAt: readRequiredString(
        record,
        "workflowRunStreamEvent",
        "finishedAt",
      ),
      execution: parseWorkflowExecutionRecord(
        readRequiredRecord(record, "workflowRunStreamEvent", "execution"),
      ),
    };
  }

  return {
    type: WorkflowRunStreamEventType.WorkflowFailed,
    workflowId: readRequiredString(
      record,
      "workflowRunStreamEvent",
      "workflowId",
    ),
    workflowRunId: readRequiredString(
      record,
      "workflowRunStreamEvent",
      "workflowRunId",
    ),
    finishedAt: readRequiredString(
      record,
      "workflowRunStreamEvent",
      "finishedAt",
    ),
    ...(typeof record["error"] === "string" ? { error: record["error"] } : {}),
    ...(record["execution"]
      ? {
          execution: parseWorkflowExecutionRecord(
            readRequiredRecord(record, "workflowRunStreamEvent", "execution"),
          ),
        }
      : {}),
  };
};

const parseWorkflowDefinitionRecord = (
  value: Record<string, unknown>,
): WorkflowDefinitionRecord => ({
  id: readRequiredString(value, "workflowDefinitionRecord", "id"),
  workspaceId: readRequiredString(
    value,
    "workflowDefinitionRecord",
    "workspaceId",
  ),
  projectId: readRequiredString(value, "workflowDefinitionRecord", "projectId"),
  name: readRequiredString(value, "workflowDefinitionRecord", "name"),
  description: readRequiredString(
    value,
    "workflowDefinitionRecord",
    "description",
  ),
  status: readRequiredString(
    value,
    "workflowDefinitionRecord",
    "status",
  ) as WorkflowDefinitionRecord["status"],
  version: readRequiredNumber(value, "workflowDefinitionRecord", "version"),
  createdAt: readRequiredString(value, "workflowDefinitionRecord", "createdAt"),
  updatedAt: readRequiredString(value, "workflowDefinitionRecord", "updatedAt"),
  trigger: readRequiredRecord(
    value,
    "workflowDefinitionRecord",
    "trigger",
  ) as WorkflowDefinitionRecord["trigger"],
  viewport: readRequiredRecord(
    value,
    "workflowDefinitionRecord",
    "viewport",
  ) as WorkflowDefinitionRecord["viewport"],
  nodes: readRequiredArray(
    value,
    "workflowDefinitionRecord",
    "nodes",
  ) as WorkflowDefinitionRecord["nodes"],
  edges: readRequiredArray(
    value,
    "workflowDefinitionRecord",
    "edges",
  ) as WorkflowDefinitionRecord["edges"],
  executionPolicy: readRequiredRecord(
    value,
    "workflowDefinitionRecord",
    "executionPolicy",
  ) as WorkflowDefinitionRecord["executionPolicy"],
  defaultContextPolicy: readRequiredRecord(
    value,
    "workflowDefinitionRecord",
    "defaultContextPolicy",
  ) as WorkflowDefinitionRecord["defaultContextPolicy"],
  tags: readRequiredStringArray(value, "workflowDefinitionRecord", "tags"),
});

const parseWorkflowDefinitionVersionRecord = (
  value: Record<string, unknown>,
): WorkflowDefinitionVersionRecord => {
  const checksum = readOptionalString(value, "checksum");
  const author = readOptionalString(value, "author");
  const note = readOptionalString(value, "note");
  const changeType = parseWorkflowVersionChangeType(
    readOptionalString(value, "changeType"),
  );
  const changeSummary = readOptionalString(value, "changeSummary");
  return {
    id: readRequiredString(value, "workflowDefinitionVersionRecord", "id"),
    workflowId: readRequiredString(
      value,
      "workflowDefinitionVersionRecord",
      "workflowId",
    ),
    projectId: readRequiredString(
      value,
      "workflowDefinitionVersionRecord",
      "projectId",
    ),
    version: readRequiredNumber(
      value,
      "workflowDefinitionVersionRecord",
      "version",
    ),
    createdAt: readRequiredString(
      value,
      "workflowDefinitionVersionRecord",
      "createdAt",
    ),
    snapshot: parseWorkflowDefinitionRecord(
      readRequiredRecord(value, "workflowDefinitionVersionRecord", "snapshot"),
    ),
    ...(checksum ? { checksum } : {}),
    ...(author ? { author } : {}),
    ...(note ? { note } : {}),
    ...(Array.isArray(value["tags"])
      ? {
          tags: readRequiredStringArray(
            value,
            "workflowDefinitionVersionRecord",
            "tags",
          ),
        }
      : {}),
    ...(changeType ? { changeType } : {}),
    ...(changeSummary ? { changeSummary } : {}),
  };
};

const parseWorkflowVersionChangeType = (
  value: string | undefined,
): WorkflowDefinitionVersionRecord["changeType"] | undefined => {
  if (
    value === "manual" ||
    value === "autosave" ||
    value === "restore" ||
    value === "clone" ||
    value === "import"
  ) {
    return value;
  }

  return undefined;
};

const parseWorkflowAssetRecord = (
  value: Record<string, unknown>,
): WorkflowAssetRecord => {
  const projectId = readOptionalString(value, "projectId");
  const archivedAt = readOptionalString(value, "archivedAt");
  const outputContract = hasDefinedProperty(value, "outputContract")
    ? (readRequiredRecord(
        value,
        "workflowAssetRecord",
        "outputContract",
      ) as NonNullable<WorkflowAssetRecord["outputContract"]>)
    : undefined;
  const guardrail = hasDefinedProperty(value, "guardrail")
    ? (readRequiredRecord(
        value,
        "workflowAssetRecord",
        "guardrail",
      ) as NonNullable<WorkflowAssetRecord["guardrail"]>)
    : undefined;

  return {
    id: readRequiredString(value, "workflowAssetRecord", "id"),
    workspaceId: readRequiredString(
      value,
      "workflowAssetRecord",
      "workspaceId",
    ),
    ...(projectId ? { projectId } : {}),
    kind: readRequiredString(
      value,
      "workflowAssetRecord",
      "kind",
    ) as WorkflowAssetRecord["kind"],
    scope: readRequiredString(
      value,
      "workflowAssetRecord",
      "scope",
    ) as WorkflowAssetRecord["scope"],
    name: readRequiredString(value, "workflowAssetRecord", "name"),
    slug: readRequiredString(value, "workflowAssetRecord", "slug"),
    description: readRequiredString(
      value,
      "workflowAssetRecord",
      "description",
    ),
    body: readRequiredString(value, "workflowAssetRecord", "body"),
    language: readRequiredString(value, "workflowAssetRecord", "language"),
    version: readRequiredNumber(value, "workflowAssetRecord", "version"),
    tags: readRequiredStringArray(value, "workflowAssetRecord", "tags"),
    ...(outputContract ? { outputContract } : {}),
    ...(guardrail ? { guardrail } : {}),
    createdAt: readRequiredString(value, "workflowAssetRecord", "createdAt"),
    updatedAt: readRequiredString(value, "workflowAssetRecord", "updatedAt"),
    ...(archivedAt ? { archivedAt } : {}),
  };
};

const parseWorkflowAssetUsageRecord = (
  value: Record<string, unknown>,
): WorkflowAssetUsageRecord => ({
  assetId: readRequiredString(value, "workflowAssetUsageRecord", "assetId"),
  workflowId: readRequiredString(
    value,
    "workflowAssetUsageRecord",
    "workflowId",
  ),
  projectId: readRequiredString(value, "workflowAssetUsageRecord", "projectId"),
  nodeId: readRequiredString(value, "workflowAssetUsageRecord", "nodeId"),
  nodeKind: readRequiredString(
    value,
    "workflowAssetUsageRecord",
    "nodeKind",
  ) as WorkflowAssetUsageRecord["nodeKind"],
  role: readRequiredString(
    value,
    "workflowAssetUsageRecord",
    "role",
  ) as WorkflowAssetUsageRecord["role"],
  createdAt: readRequiredString(value, "workflowAssetUsageRecord", "createdAt"),
});

const parseWorkflowExecutionRecord = (
  value: Record<string, unknown>,
): WorkflowExecutionRecord => {
  const finishedAt = readOptionalString(value, "finishedAt");
  const durationMs = readOptionalNumber(value, "durationMs");

  return {
    id: readRequiredString(value, "workflowExecutionRecord", "id"),
    workflowId: readRequiredString(
      value,
      "workflowExecutionRecord",
      "workflowId",
    ),
    projectId: readRequiredString(
      value,
      "workflowExecutionRecord",
      "projectId",
    ),
    triggerKind: readRequiredString(
      value,
      "workflowExecutionRecord",
      "triggerKind",
    ) as WorkflowExecutionRecord["triggerKind"],
    status: readRequiredString(
      value,
      "workflowExecutionRecord",
      "status",
    ) as WorkflowExecutionRecord["status"],
    startedAt: readRequiredString(
      value,
      "workflowExecutionRecord",
      "startedAt",
    ),
    ...(finishedAt ? { finishedAt } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    warningsCount: readRequiredNumber(
      value,
      "workflowExecutionRecord",
      "warningsCount",
    ),
    errorsCount: readRequiredNumber(
      value,
      "workflowExecutionRecord",
      "errorsCount",
    ),
    totals: readRequiredRecord(
      value,
      "workflowExecutionRecord",
      "totals",
    ) as WorkflowExecutionRecord["totals"],
    contextSessionId: readRequiredString(
      value,
      "workflowExecutionRecord",
      "contextSessionId",
    ),
    nodeRuns: readRequiredArray(
      value,
      "workflowExecutionRecord",
      "nodeRuns",
    ) as WorkflowExecutionRecord["nodeRuns"],
  };
};

const ensureRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readRequiredRecord = (
  value: unknown,
  label: string,
  key: string,
): Record<string, unknown> => {
  const record = ensureRecord(value, label);
  return ensureRecord(record[key], `${label}.${key}`);
};

const readRequiredArray = (
  value: unknown,
  label: string,
  key: string,
): ReadonlyArray<unknown> => {
  const record = ensureRecord(value, label);
  const nested = record[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredStringArray = (
  value: Record<string, unknown>,
  label: string,
  key: string,
): ReadonlyArray<string> => {
  const nested = value[key];
  if (
    !Array.isArray(nested) ||
    nested.some((item) => typeof item !== "string")
  ) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested as ReadonlyArray<string>;
};

const readRequiredString = (
  value: Record<string, unknown>,
  label: string,
  key: string,
): string => {
  const nested = value[key];
  if (typeof nested !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readOptionalString = (
  value: Record<string, unknown>,
  key: string,
): string | undefined => {
  const nested = value[key];
  return typeof nested === "string" ? nested : undefined;
};

const readRequiredNumber = (
  value: Record<string, unknown>,
  label: string,
  key: string,
): number => {
  const nested = value[key];
  if (typeof nested !== "number" || Number.isNaN(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readOptionalNumber = (
  value: Record<string, unknown>,
  key: string,
): number | undefined => {
  const nested = value[key];
  return typeof nested === "number" && !Number.isNaN(nested)
    ? nested
    : undefined;
};

const hasDefinedProperty = (
  value: Record<string, unknown>,
  key: string,
): boolean => value[key] !== undefined;
