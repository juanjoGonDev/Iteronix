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
  readWorkflowExecutionNodeOpenState,
  readWorkflowNodeModalNavigationState,
  readWorkflowNodeStepLaunchState,
  readWorkflowRunControlState,
  readWorkflowPinnedOutputAction,
  readWorkflowPinnedNodeVisualState,
  parseWorkflowEditedOutputSnapshot,
  readWorkflowPinnedTestOutputFromDefinition,
  writeWorkflowPinnedTestOutputToDefinition,
  readWorkflowStepSeedOutputs,
  readWorkflowStepExecutionAvailability,
  shouldApplyWorkflowExecutionsRefresh,
  selectWorkflowCanvasExecution,
  selectWorkflowDraftAfterCatalogReload,
  shouldOpenNodeModalFromPointerDetail,
  shouldOpenNodeModalFromPointerSequence,
  selectWorkflowDebugExecution,
} from "./workflows-debug-state.js";
import {
  addWorkflowNode,
  connectWorkflowNodes,
  createEmptyWorkflowDefinition,
  WorkflowNodeKind,
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

  it("builds reusable step seed outputs from previous runs and one pinned output", () => {
    const definition = addWorkflowNode(
      createEmptyWorkflowDefinition({
        projectId: "project-1",
        name: "Debug",
      }),
      WorkflowNodeKind.AiAgent,
      () => "node-target",
    );
    const connected = connectWorkflowNodes(definition, {
      sourceNodeId: definition.nodes[0]?.id ?? "",
      sourcePortId: definition.nodes[0]?.outputPorts[0]?.id ?? "",
      targetNodeId: "node-target",
      targetPortId:
        definition.nodes.find((node) => node.id === "node-target")
          ?.inputPorts[0]?.id ?? "",
    });

    const seeds = readWorkflowStepSeedOutputs({
      workflow: connected,
      executionOutputs: new Map<string, unknown>([
        [connected.nodes[0]?.id ?? "", { result: "cached" }],
        ["node-target", { result: "old target" }],
      ]),
      pinnedOutput: {
        workflowId: "workflow-1",
        nodeId: connected.nodes[0]?.id ?? "",
        outputSnapshot: { result: "pinned" },
      },
      workflowId: "workflow-1",
      targetNodeId: "node-target",
    });

    expect(seeds).toEqual({
      [connected.nodes[0]?.id ?? ""]: { result: "pinned" },
    });
  });

  it("requires confirmation before replacing another pinned step output", () => {
    expect(
      readWorkflowPinnedOutputAction({
        currentPinnedOutput: null,
        nextNodeId: "node-a",
        hasOutput: true,
      }),
    ).toBe("pin");
    expect(
      readWorkflowPinnedOutputAction({
        currentPinnedOutput: {
          workflowId: "workflow-1",
          nodeId: "node-a",
          outputSnapshot: "cached",
        },
        nextNodeId: "node-b",
        hasOutput: true,
      }),
    ).toBe("confirm-overwrite");
    expect(
      readWorkflowPinnedOutputAction({
        currentPinnedOutput: {
          workflowId: "workflow-1",
          nodeId: "node-a",
          outputSnapshot: "cached",
        },
        nextNodeId: "node-a",
        hasOutput: true,
      }),
    ).toBe("unpin");
  });

  it("requires confirmation before replacing the same node with different output", () => {
    expect(
      readWorkflowPinnedOutputAction({
        currentPinnedOutput: {
          workflowId: "workflow-1",
          nodeId: "node-a",
          outputSnapshot: { result: "cached" },
        },
        nextNodeId: "node-a",
        nextOutputSnapshot: { result: "history" },
        hasOutput: true,
      }),
    ).toBe("confirm-overwrite");
  });

  it("marks pinned nodes for purple canvas rendering", () => {
    expect(
      readWorkflowPinnedNodeVisualState({
        pinnedOutput: {
          workflowId: "workflow-1",
          nodeId: "node-a",
          outputSnapshot: { ok: true },
        },
        workflowId: "workflow-1",
        nodeId: "node-a",
      }),
    ).toEqual({ pinned: true, tone: "pinned" });
    expect(
      readWorkflowPinnedNodeVisualState({
        pinnedOutput: null,
        workflowId: "workflow-1",
        nodeId: "node-a",
      }),
    ).toEqual({ pinned: false, tone: "normal" });
  });

  it("parses edited output snapshots as json when possible", () => {
    expect(parseWorkflowEditedOutputSnapshot('{"ok":true}')).toEqual({
      ok: true,
    });
    expect(parseWorkflowEditedOutputSnapshot("plain text")).toBe("plain text");
  });

  it("persists a single pinned test output in the workflow definition", () => {
    const definition = createEmptyWorkflowDefinition({
      projectId: "project-1",
      name: "Pinned",
    });
    const firstNodeId = definition.nodes[0]?.id ?? "";
    const secondNodeId = definition.nodes[1]?.id ?? "";
    const pinned = writeWorkflowPinnedTestOutputToDefinition(
      { ...definition, id: "workflow-1" },
      {
        workflowId: "workflow-1",
        nodeId: firstNodeId,
        outputSnapshot: { result: "first" },
      },
      "2026-07-03T10:00:00.000Z",
    );

    expect(readWorkflowPinnedTestOutputFromDefinition(pinned)).toEqual({
      workflowId: "workflow-1",
      nodeId: firstNodeId,
      outputSnapshot: { result: "first" },
    });

    const replaced = writeWorkflowPinnedTestOutputToDefinition(
      pinned,
      {
        workflowId: "workflow-1",
        nodeId: secondNodeId,
        outputSnapshot: { result: "second" },
      },
      "2026-07-03T10:01:00.000Z",
    );

    expect(replaced.nodes[0]?.config.pinnedTestOutput).toBeUndefined();
    expect(replaced.nodes[1]?.config.pinnedTestOutput).toEqual({
      outputSnapshot: { result: "second" },
      updatedAt: "2026-07-03T10:01:00.000Z",
    });
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

  it("keeps an explicit historical debug execution ahead of live session state", () => {
    const selected = selectWorkflowDebugExecution({
      workflowId: "workflow-1",
      activeExecutionId: "history-run",
      selectedExecutionId: null,
      liveExecutionId: "live-run",
      executions: [
        { id: "live-run", workflowId: "workflow-1" },
        { id: "history-run", workflowId: "workflow-1" },
      ],
    });

    expect(selected?.id).toBe("history-run");
  });

  it("does not reuse the latest persisted execution in a fresh editor session", () => {
    const selected = selectWorkflowDebugExecution({
      workflowId: "workflow-1",
      activeExecutionId: null,
      selectedExecutionId: null,
      liveExecutionId: null,
      executions: [
        { id: "latest-run", workflowId: "workflow-1" },
        { id: "older-run", workflowId: "workflow-1" },
      ],
    });

    expect(selected).toBeNull();
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

  it("opens executed nodes in the standard node editor modal", () => {
    expect(
      readWorkflowExecutionNodeOpenState({
        executionId: "run-1",
        nodeId: "node-1",
      }),
    ).toEqual({
      debugExecutionId: "run-1",
      editorModalOpen: true,
      executionNodeModal: null,
      selection: { type: "node", id: "node-1" },
    });
  });

  it("finds connected modal neighbors and keeps the active run when navigating", () => {
    const definition = addWorkflowNode(
      createEmptyWorkflowDefinition({
        projectId: "project-1",
        name: "Debug",
      }),
      WorkflowNodeKind.AiAgent,
      () => "node-next",
    );
    const sourceNode = definition.nodes[0];
    const targetNode = definition.nodes[1];
    const nextNode = definition.nodes.find((node) => node.id === "node-next");

    if (!sourceNode || !targetNode || !nextNode) {
      throw new Error("Expected workflow nodes.");
    }

    const upstreamConnected = connectWorkflowNodes(definition, {
      sourceNodeId: sourceNode.id,
      sourcePortId: sourceNode.outputPorts[0]?.id ?? "",
      targetNodeId: targetNode.id,
      targetPortId: targetNode.inputPorts[0]?.id ?? "",
    });
    const fullyConnected = connectWorkflowNodes(upstreamConnected, {
      sourceNodeId: targetNode.id,
      sourcePortId: targetNode.outputPorts[0]?.id ?? "",
      targetNodeId: nextNode.id,
      targetPortId: nextNode.inputPorts[0]?.id ?? "",
    });

    expect(
      readWorkflowNodeModalNavigationState({
        workflow: fullyConnected,
        nodeId: targetNode.id,
        executionId: "run-1",
      }),
    ).toEqual({
      previousNodeId: sourceNode.id,
      nextNodeId: nextNode.id,
      previousOpenState: {
        debugExecutionId: "run-1",
        editorModalOpen: true,
        executionNodeModal: null,
        selection: { type: "node", id: sourceNode.id },
      },
      nextOpenState: {
        debugExecutionId: "run-1",
        editorModalOpen: true,
        executionNodeModal: null,
        selection: { type: "node", id: nextNode.id },
      },
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
