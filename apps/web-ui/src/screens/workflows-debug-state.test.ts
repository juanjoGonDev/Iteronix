import { describe, expect, it } from "vitest";
import {
  buildWorkflowDebugInputSources,
  readWorkflowDebugItemCount,
  readWorkflowDebugItemLabel,
  readWorkflowDebugSchemaEntries,
  readWorkflowDebugStatusTone,
  readExecutionRefreshPollingAction,
  readWorkflowExecutionIsActive,
  readWorkflowNodeHoverRunControlState,
  readWorkflowNodeStepLaunchState,
  readWorkflowRunControlState,
  readWorkflowStepExecutionAvailability,
  shouldApplyWorkflowExecutionsRefresh,
  selectWorkflowCanvasExecution,
  selectWorkflowDraftAfterCatalogReload,
  shouldOpenNodeModalFromPointerDetail,
  shouldOpenNodeModalFromPointerSequence,
  selectWorkflowDebugExecution,
} from "./workflows-debug-state.js";
import {
  connectWorkflowNodes,
  createEmptyWorkflowDefinition,
} from "./workflows-editor-state.js";

describe("workflows debug state", () => {
  it("counts n8n-like items for arrays and single object outputs", () => {
    expect(readWorkflowDebugItemCount([{ id: 1 }, { id: 2 }])).toBe(2);
    expect(readWorkflowDebugItemLabel({ ok: true })).toBe("1 item");
    expect(readWorkflowDebugItemLabel(undefined)).toBe("0 items");
  });

  it("maps node run states to debug status tones", () => {
    expect(
      readWorkflowDebugStatusTone({
        status: "completed",
        alertsCount: 0,
        findingsCount: 0,
      }),
    ).toBe("success");
    expect(
      readWorkflowDebugStatusTone({
        status: "completed",
        alertsCount: 1,
        findingsCount: 0,
      }),
    ).toBe("warning");
    expect(
      readWorkflowDebugStatusTone({
        status: "failed",
        alertsCount: 0,
        findingsCount: 0,
      }),
    ).toBe("failed");
  });

  it("builds selectable input sources from previous connected outputs", () => {
    const definition = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Debug",
    });
    const sourceNode = definition.nodes[0];
    const targetNode = definition.nodes[1];

    if (!sourceNode || !targetNode) {
      throw new Error("Expected default workflow nodes.");
    }

    const connected = connectWorkflowNodes(definition, {
      sourceNodeId: sourceNode.id,
      sourcePortId: sourceNode.outputPorts[0]?.id ?? "",
      targetNodeId: targetNode.id,
      targetPortId: targetNode.inputPorts[0]?.id ?? "",
    });
    const sources = buildWorkflowDebugInputSources({
      workflow: connected,
      nodeId: targetNode.id,
      outputsByNodeId: new Map([[sourceNode.id, [{ result: "ok" }]]]),
    });

    expect(sources.map((source) => source.label)).toEqual([
      "Last upstream response",
      sourceNode.label,
    ]);
    expect(sources[0]?.detail).toContain("1 item");
  });

  it("keeps a selected historical execution when the node modal changes selection", () => {
    const selected = selectWorkflowDebugExecution({
      workflowId: "workflow-1",
      activeExecutionId: "old-run",
      selectedExecutionId: null,
      liveExecutionId: null,
      executions: [
        { id: "latest-run", workflowId: "workflow-1" },
        { id: "old-run", workflowId: "workflow-1" },
      ],
    });

    expect(selected?.id).toBe("old-run");
  });

  it("detects node double-clicks from pointer detail before drag starts", () => {
    expect(shouldOpenNodeModalFromPointerDetail(1)).toBe(false);
    expect(shouldOpenNodeModalFromPointerDetail(2)).toBe(true);
  });

  it("detects node double-clicks from repeated pointer downs when detail is unavailable", () => {
    expect(
      shouldOpenNodeModalFromPointerSequence({
        nodeId: "node-1",
        eventDetail: 0,
        eventTime: 1_200,
        previousNodeId: "node-1",
        previousEventTime: 1_000,
      }),
    ).toBe(true);
    expect(
      shouldOpenNodeModalFromPointerSequence({
        nodeId: "node-2",
        eventDetail: 0,
        eventTime: 1_200,
        previousNodeId: "node-1",
        previousEventTime: 1_000,
      }),
    ).toBe(false);
    expect(
      shouldOpenNodeModalFromPointerSequence({
        nodeId: "node-1",
        eventDetail: 0,
        eventTime: 1_800,
        previousNodeId: "node-1",
        previousEventTime: 1_000,
      }),
    ).toBe(false);
  });

  it("preserves dirty canvas edits while execution auto-refresh reloads catalog data", () => {
    const serverWorkflow = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Saved",
    });
    const savedWorkflow = { ...serverWorkflow, id: "workflow-1" };
    const dirtyWorkflow = {
      ...savedWorkflow,
      name: "Unsaved local edit",
    };

    const result = selectWorkflowDraftAfterCatalogReload({
      currentDraftWorkflow: dirtyWorkflow,
      currentWorkflow: savedWorkflow,
      hasDirtyWorkflow: true,
      dirtyAssetIds: [],
      toDraftWorkflow: (workflow) => workflow,
    });

    expect(result.draftWorkflow?.name).toBe("Unsaved local edit");
    expect(result.dirtyWorkflow).toBe(true);
  });

  it("accepts the server workflow after catalog reload when the local draft is clean", () => {
    const serverWorkflow = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Server update",
    });

    const result = selectWorkflowDraftAfterCatalogReload({
      currentDraftWorkflow: null,
      currentWorkflow: { ...serverWorkflow, id: "workflow-1" },
      hasDirtyWorkflow: false,
      dirtyAssetIds: [],
      toDraftWorkflow: (workflow) => workflow,
    });

    expect(result.draftWorkflow?.name).toBe("Server update");
    expect(result.dirtyWorkflow).toBe(false);
  });

  it("keeps execution auto-refresh polling enabled when the toggle is on", () => {
    expect(
      readExecutionRefreshPollingAction({
        autoRefreshEnabled: true,
        isPolling: false,
      }),
    ).toBe("start");
    expect(
      readExecutionRefreshPollingAction({
        autoRefreshEnabled: false,
        isPolling: true,
      }),
    ).toBe("stop");
    expect(
      readExecutionRefreshPollingAction({
        autoRefreshEnabled: true,
        isPolling: true,
      }),
    ).toBe("keep");
  });

  it("skips execution auto-refresh updates when the execution catalog did not change", () => {
    const current = [
      {
        id: "run-1",
        workflowId: "workflow-1",
        status: "running",
        startedAt: "2026-07-01T10:00:00.000Z",
        nodeRuns: [],
      },
    ];

    expect(shouldApplyWorkflowExecutionsRefresh(current, [...current])).toBe(
      false,
    );
    expect(
      shouldApplyWorkflowExecutionsRefresh(current, [
        { ...current[0], status: "completed" },
      ]),
    ).toBe(true);
  });

  it("keeps active running execution visuals after returning to editor mode", () => {
    const selected = selectWorkflowCanvasExecution({
      workflowId: "workflow-1",
      liveExecutionId: null,
      selectedExecutionId: null,
      executions: [
        {
          id: "historic-run",
          workflowId: "workflow-1",
          status: "completed",
          startedAt: "2026-06-30T10:00:00.000Z",
        },
        {
          id: "running-run",
          workflowId: "workflow-1",
          status: "running",
          startedAt: "2026-06-30T10:01:00.000Z",
        },
      ],
    });

    expect(selected?.id).toBe("running-run");
  });

  it("keeps selected historic execution visuals while inspecting history", () => {
    const selected = selectWorkflowCanvasExecution({
      workflowId: "workflow-1",
      liveExecutionId: null,
      selectedExecutionId: "historic-run",
      executions: [
        {
          id: "historic-run",
          workflowId: "workflow-1",
          status: "completed",
          startedAt: "2026-06-30T10:00:00.000Z",
        },
        {
          id: "running-run",
          workflowId: "workflow-1",
          status: "running",
          startedAt: "2026-06-30T10:01:00.000Z",
        },
      ],
    });

    expect(selected?.id).toBe("historic-run");
  });

  it("disables step execution while a workflow execution is active", () => {
    expect(
      readWorkflowStepExecutionAvailability({
        hasNodeSelection: true,
        hasCurrentProject: true,
        hasCurrentWorkflow: true,
        hasDirtyWorkflow: false,
        dirtyAssetCount: 0,
        hasPendingAction: false,
        hasActiveExecution: true,
      }),
    ).toEqual({
      disabled: true,
      label: "Executing",
    });
    expect(readWorkflowExecutionIsActive("running")).toBe(true);
    expect(readWorkflowExecutionIsActive("queued")).toBe(true);
    expect(readWorkflowExecutionIsActive("completed")).toBe(false);
  });

  it("exposes hover node run as execute-step instead of provider smoke test", () => {
    expect(
      readWorkflowNodeHoverRunControlState({
        hasTargetNode: true,
        hasCurrentProject: true,
        hasCurrentWorkflow: true,
        hasDirtyWorkflow: false,
        dirtyAssetCount: 0,
        hasPendingAction: false,
        hasActiveExecution: false,
      }),
    ).toEqual({
      disabled: false,
      icon: "play_arrow",
      title: "Execute workflow up to this node",
    });
  });

  it("keeps hover node execution on the canvas without opening the editor modal", () => {
    expect(readWorkflowNodeStepLaunchState("hover")).toEqual({
      editorModalOpen: false,
    });
    expect(readWorkflowNodeStepLaunchState("modal")).toEqual({
      editorModalOpen: true,
    });
  });

  it("turns the global run button into stop while execution is active", () => {
    expect(
      readWorkflowRunControlState({
        hasCurrentWorkflow: true,
        hasPendingAction: false,
        hasUnsavedChanges: false,
        hasActiveExecution: true,
        canStopActiveExecution: true,
      }),
    ).toEqual({
      disabled: false,
      icon: "stop",
      label: "Stop",
      mode: "stop",
      title: undefined,
      variant: "danger",
    });
    expect(
      readWorkflowRunControlState({
        hasCurrentWorkflow: true,
        hasPendingAction: false,
        hasUnsavedChanges: false,
        hasActiveExecution: true,
        canStopActiveExecution: false,
      }),
    ).toMatchObject({
      disabled: true,
      label: "Stop",
      mode: "stop",
    });
  });

  it("creates a compact schema tree with item counts", () => {
    const schema = readWorkflowDebugSchemaEntries([
      { id: 1, nested: { ok: true } },
      { id: 2, nested: { ok: false } },
    ]);

    expect(
      schema.map((entry) => `${entry.path}:${entry.type}:${entry.items}`),
    ).toContain("$:array:2");
    expect(schema.map((entry) => entry.path)).toContain("$[].nested.ok");
  });
});
