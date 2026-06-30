import { describe, expect, it } from "vitest";
import {
  buildWorkflowDebugInputSources,
  readWorkflowDebugItemCount,
  readWorkflowDebugItemLabel,
  readWorkflowDebugSchemaEntries,
  readWorkflowDebugStatusTone,
  readExecutionRefreshPollingAction,
  shouldOpenNodeModalFromPointerDetail,
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
