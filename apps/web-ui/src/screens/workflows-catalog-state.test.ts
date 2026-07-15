import { describe, expect, it } from "vitest";
import {
  WorkflowRecordStatus,
  type WorkflowDefinitionRecord,
  type WorkflowExecutionRecord,
} from "./workflows-editor-state.js";
import {
  WorkflowCatalogSort,
  readWorkflowEditorTarget,
  readWorkflowCatalogRows,
} from "./workflows-catalog-state.js";

describe("workflow catalog state", () => {
  it("filters by name and sorts deterministically with execution summaries", () => {
    const rows = readWorkflowCatalogRows({
      workflows: [
        createWorkflow({
          id: "alpha",
          name: "Alpha deploy",
          updatedAt: "2026-07-15T12:00:00.000Z",
        }),
        createWorkflow({
          id: "beta",
          name: "Beta deploy",
          updatedAt: "2026-07-15T12:00:00.000Z",
        }),
        createWorkflow({
          id: "other",
          name: "Research",
          updatedAt: "2026-07-15T13:00:00.000Z",
        }),
      ],
      executions: [
        createExecution({
          id: "run-old",
          workflowId: "alpha",
          status: "failed",
          startedAt: "2026-07-15T10:00:00.000Z",
        }),
        createExecution({
          id: "run-new",
          workflowId: "alpha",
          status: "completed",
          startedAt: "2026-07-15T11:00:00.000Z",
        }),
      ],
      query: "deploy",
      sort: WorkflowCatalogSort.UpdatedDescending,
    });

    expect(rows.map((row) => row.workflow.id)).toEqual(["alpha", "beta"]);
    expect(rows[0]?.execution.total).toBe(2);
    expect(rows[0]?.execution.latest?.status).toBe("completed");
    expect(rows[1]?.execution).toEqual({ total: 0, latest: null });
  });

  it("returns no editor target for a deleted or invalid workflow id", () => {
    const workflows = [
      createWorkflow({
        id: "present",
        name: "Present",
        updatedAt: "2026-07-15T12:00:00.000Z",
      }),
    ];

    expect(readWorkflowEditorTarget(workflows, "missing")).toBeNull();
    expect(readWorkflowEditorTarget(workflows, "present")?.name).toBe(
      "Present",
    );
  });
});

const createWorkflow = (input: {
  id: string;
  name: string;
  updatedAt: string;
}): WorkflowDefinitionRecord => ({
  id: input.id,
  name: input.name,
  description: "",
  status: WorkflowRecordStatus.Draft,
  version: 1,
  createdAt: input.updatedAt,
  updatedAt: input.updatedAt,
  trigger: { kind: "manual", enabled: true, config: {} },
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [],
  edges: [],
  executionPolicy: { maxNodeRetries: 0, allowManualCheckpointResume: true },
  defaultContextPolicy: {
    language: "en",
    carryMessagesLimit: 0,
    carryArtifactLimit: 0,
  },
  tags: [],
});

const createExecution = (input: {
  id: string;
  workflowId: string;
  status: WorkflowExecutionRecord["status"];
  startedAt: string;
}): WorkflowExecutionRecord => ({
  id: input.id,
  workflowId: input.workflowId,
  triggerKind: "manual",
  status: input.status,
  startedAt: input.startedAt,
  finishedAt: input.startedAt,
  durationMs: 0,
  warningsCount: 0,
  errorsCount: input.status === "failed" ? 1 : 0,
  totals: {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostEur: 0,
    latencyMs: 0,
  },
  contextSessionId: "session",
  nodeRuns: [],
});
