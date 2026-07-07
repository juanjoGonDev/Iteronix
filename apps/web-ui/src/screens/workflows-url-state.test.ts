import { describe, expect, it } from "vitest";
import {
  WorkflowsUrlModal,
  WorkflowsUrlPanel,
  applyWorkflowsUrlPatch,
  readWorkflowsUrlState,
} from "./workflows-url-state.js";

describe("workflows URL state", () => {
  it("reads empty workflow URLs as default canvas state", () => {
    expect(readWorkflowsUrlState("http://localhost/workflows")).toEqual({
      panel: null,
      modal: null,
      nodeId: null,
      executionId: null,
      versionId: null,
    });
  });

  it("writes and reads edit history modal state", () => {
    const nextUrl = applyWorkflowsUrlPatch("http://localhost/workflows", {
      modal: WorkflowsUrlModal.EditHistory,
    });

    expect(nextUrl).toBe("/workflows?modal=edit-history");
    expect(readWorkflowsUrlState(`http://localhost${nextUrl}`)).toMatchObject({
      modal: WorkflowsUrlModal.EditHistory,
    });
  });

  it("writes node editor deep links with selected node id", () => {
    const nextUrl = applyWorkflowsUrlPatch("http://localhost/workflows", {
      modal: WorkflowsUrlModal.NodeEditor,
      nodeId: "node-1",
    });

    expect(nextUrl).toBe("/workflows?modal=node-editor&node=node-1");
    expect(readWorkflowsUrlState(`http://localhost${nextUrl}`)).toMatchObject({
      modal: WorkflowsUrlModal.NodeEditor,
      nodeId: "node-1",
    });
  });

  it("writes selected execution history context", () => {
    const nextUrl = applyWorkflowsUrlPatch("http://localhost/workflows", {
      panel: WorkflowsUrlPanel.History,
      executionId: "execution-1",
    });

    expect(nextUrl).toBe("/workflows?panel=history&execution=execution-1");
    expect(readWorkflowsUrlState(`http://localhost${nextUrl}`)).toMatchObject({
      panel: WorkflowsUrlPanel.History,
      executionId: "execution-1",
    });
  });

  it("clears modal scoped params without clearing the selected execution", () => {
    const nextUrl = applyWorkflowsUrlPatch(
      "http://localhost/workflows?panel=history&execution=execution-1&modal=node-editor&node=node-1",
      {
        modal: null,
        nodeId: null,
        versionId: null,
      },
    );

    expect(nextUrl).toBe("/workflows?panel=history&execution=execution-1");
  });
});
