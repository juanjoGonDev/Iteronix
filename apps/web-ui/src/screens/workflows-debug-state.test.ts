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
  readWorkflowPinnedTestOutputsFromDefinition,
  readWorkflowTestRunSeedOutputs,
  writeWorkflowPinnedTestOutputToDefinition,
  writeWorkflowPinnedTestOutputsToDefinition,
  readWorkflowStepRunSeedOutputs,
  readWorkflowStepExecutionAvailability,
  shouldApplyWorkflowExecutionsRefresh,
  selectWorkflowCanvasExecution,
  selectWorkflowDraftAfterCatalogReload,
  shouldOpenNodeModalFromPointerDetail,
  shouldOpenNodeModalFromPointerSequence,
  selectWorkflowDebugExecution,
  selectGovernanceLifecycleControlState,
} from "./workflows-debug-state.js";
import {
  addWorkflowNode,
  connectWorkflowNodes,
  createEmptyWorkflowDefinition,
  WorkflowNodeKind,
} from "./workflows-editor-state.js";

describe("workflows debug state", () => {
  it("derives lifecycle approval controls and audit evidence for the inspector", () => {
    expect(
      selectGovernanceLifecycleControlState({
        state: "awaiting-user-approval",
        budgets: { execution: 1, repair: 0, review: 2 },
        fingerprints: {
          scope: "scope-fingerprint",
          evidence: "evidence-fingerprint",
        },
        transitionCount: 5,
        feedback: "",
        pending: false,
      }),
    ).toEqual({
      controlsDisabled: false,
      rejectDisabled: true,
      budgetSummary: "execution 1 · repair 0 · review 2",
      fingerprintSummary: "scope-fingerprint · evidence-fingerprint",
      historyLabel: "5 decisions",
    });
    expect(
      selectGovernanceLifecycleControlState({
        state: "approved",
        budgets: {},
        fingerprints: { scope: "scope", evidence: "evidence" },
        transitionCount: 6,
        feedback: "Needs revision",
        pending: false,
      }).controlsDisabled,
    ).toBe(true);
  });
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

  it("uses only persisted selected upstream defaults for test step runs", () => {
    const definition = addWorkflowNode(
      createEmptyWorkflowDefinition({
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

    const sourceNodeId = connected.nodes[0]?.id ?? "";
    const configured = {
      ...connected,
      id: "workflow-1",
      nodes: connected.nodes.map((node) =>
        node.id === sourceNodeId
          ? {
              ...node,
              config: {
                ...node.config,
                pinnedTestOutput: {
                  outputSnapshot: { result: "legacy" },
                  updatedAt: "2026-07-15T15:00:00.000Z",
                },
                pinnedTestOutputs: [
                  {
                    id: "unselected",
                    name: "Earlier fixture",
                    outputSnapshot: { result: "unselected" },
                    updatedAt: "2026-07-15T15:00:00.000Z",
                  },
                  {
                    id: "selected",
                    name: "Approved fixture",
                    outputSnapshot: { result: "selected" },
                    updatedAt: "2026-07-15T15:00:00.000Z",
                  },
                ],
                defaultPinnedTestOutputId: "selected",
              },
            }
          : node,
      ),
    };

    expect(
      readWorkflowStepRunSeedOutputs({
        mode: "normal",
        workflow: configured,
        targetNodeId: "node-target",
      }),
    ).toBeUndefined();

    const seeds = readWorkflowStepRunSeedOutputs({
      mode: "test",
      workflow: configured,
      targetNodeId: "node-target",
    });

    expect(seeds).toEqual({
      [sourceNodeId]: { result: "selected" },
    });
  });

  it("does not reuse a legacy-only persisted upstream pin for test step runs", () => {
    const definition = addWorkflowNode(
      createEmptyWorkflowDefinition({
        name: "Legacy debug",
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
    const sourceNodeId = connected.nodes[0]?.id ?? "";
    const configured = {
      ...connected,
      nodes: connected.nodes.map((node) =>
        node.id === sourceNodeId
          ? {
              ...node,
              config: {
                ...node.config,
                pinnedTestOutput: {
                  outputSnapshot: { result: "legacy" },
                  updatedAt: "2026-07-15T15:00:00.000Z",
                },
              },
            }
          : node,
      ),
    };

    expect(
      readWorkflowStepRunSeedOutputs({
        mode: "test",
        workflow: configured,
        targetNodeId: "node-target",
      }),
    ).toEqual({});
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

    expect(replaced.nodes[0]?.config.pinnedTestOutputs).toBeUndefined();
    expect(replaced.nodes[1]?.config.pinnedTestOutputs).toEqual([
      {
        id: `pinned-${secondNodeId}`,
        name: "Pinned output 1",
        outputSnapshot: { result: "second" },
        updatedAt: "2026-07-03T10:01:00.000Z",
      },
    ]);
    expect(replaced.nodes[1]?.config.defaultPinnedTestOutputId).toBe(
      `pinned-${secondNodeId}`,
    );
  });

  it("persists several pinned outputs per node and exposes only each selected default to test runs", () => {
    const definition = createEmptyWorkflowDefinition({
      name: "Pinned test fixtures",
    });
    const firstNodeId = definition.nodes[0]?.id ?? "";
    const secondNodeId = definition.nodes[1]?.id ?? "";
    const pinned = writeWorkflowPinnedTestOutputsToDefinition(
      { ...definition, id: "workflow-1" },
      [
        {
          id: "first-response",
          workflowId: "workflow-1",
          nodeId: firstNodeId,
          name: "Initial response",
          outputSnapshot: { result: "first" },
        },
        {
          id: "selected-response",
          workflowId: "workflow-1",
          nodeId: firstNodeId,
          name: "Approved response",
          outputSnapshot: { result: "selected" },
        },
        {
          id: "second-node-response",
          workflowId: "workflow-1",
          nodeId: secondNodeId,
          name: "Fallback response",
          outputSnapshot: { result: "second" },
        },
      ],
      {
        [firstNodeId]: "selected-response",
        [secondNodeId]: "second-node-response",
      },
      "2026-07-15T14:00:00.000Z",
    );

    expect(readWorkflowPinnedTestOutputsFromDefinition(pinned)).toEqual([
      {
        id: "first-response",
        workflowId: "workflow-1",
        nodeId: firstNodeId,
        name: "Initial response",
        outputSnapshot: { result: "first" },
      },
      {
        id: "selected-response",
        workflowId: "workflow-1",
        nodeId: firstNodeId,
        name: "Approved response",
        outputSnapshot: { result: "selected" },
      },
      {
        id: "second-node-response",
        workflowId: "workflow-1",
        nodeId: secondNodeId,
        name: "Fallback response",
        outputSnapshot: { result: "second" },
      },
    ]);
    expect(
      readWorkflowTestRunSeedOutputs({
        workflow: pinned,
        workflowId: "workflow-1",
      }),
    ).toEqual({
      [firstNodeId]: { result: "selected" },
      [secondNodeId]: { result: "second" },
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
