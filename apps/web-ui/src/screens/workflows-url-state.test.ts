import { describe, expect, it } from "vitest";
import {
  WorkflowsUrlModal,
  WorkflowsUrlDebugPanelTab,
  WorkflowsUrlEditor,
  WorkflowsUrlPanel,
  WorkflowsUrlVersionAction,
  applyWorkflowsUrlPatch,
  readWorkflowsUrlState,
} from "./workflows-url-state.js";

describe("workflows URL state", () => {
  it("preserves the selected editor route while updating URL state", () => {
    expect(
      applyWorkflowsUrlPatch("http://localhost/workflows/workflow-1", {
        panel: WorkflowsUrlPanel.Nodes,
      }),
    ).toBe("/workflows/workflow-1?panel=nodes");
  });

  it("reads empty workflow URLs as default canvas state", () => {
    expect(readWorkflowsUrlState("http://localhost/workflows")).toEqual({
      panel: null,
      modal: null,
      nodeId: null,
      assetId: null,
      executionId: null,
      versionId: null,
      compareVersionId: null,
      diffQuery: null,
      debugInputTab: null,
      debugOutputTab: null,
      debugInputSourceId: null,
      editor: null,
      pinnedOutputId: null,
      deepEditorTab: null,
      deepEditorOutputTab: null,
      regexPattern: null,
      regexFlags: null,
      versionAction: null,
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

  it("writes asset editor deep links with selected asset id", () => {
    const nextUrl = applyWorkflowsUrlPatch("http://localhost/workflows", {
      modal: WorkflowsUrlModal.AssetEditor,
      assetId: "asset-1",
    });

    expect(nextUrl).toBe("/workflows?modal=asset-editor&asset=asset-1");
    expect(readWorkflowsUrlState(`http://localhost${nextUrl}`)).toMatchObject({
      modal: WorkflowsUrlModal.AssetEditor,
      assetId: "asset-1",
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

  it("writes node editor debug tabs and input source", () => {
    const nextUrl = applyWorkflowsUrlPatch("http://localhost/workflows", {
      modal: WorkflowsUrlModal.NodeEditor,
      nodeId: "node-1",
      debugInputTab: WorkflowsUrlDebugPanelTab.Table,
      debugOutputTab: WorkflowsUrlDebugPanelTab.Schema,
      debugInputSourceId: "node:trigger-1",
    });

    expect(nextUrl).toBe(
      "/workflows?modal=node-editor&node=node-1&inputTab=table&outputTab=schema&inputSource=node%3Atrigger-1",
    );
    expect(readWorkflowsUrlState(`http://localhost${nextUrl}`)).toMatchObject({
      debugInputTab: WorkflowsUrlDebugPanelTab.Table,
      debugOutputTab: WorkflowsUrlDebugPanelTab.Schema,
      debugInputSourceId: "node:trigger-1",
    });
  });

  it("writes nested editor state for output and deep editor tabs", () => {
    const outputUrl = applyWorkflowsUrlPatch("http://localhost/workflows", {
      modal: WorkflowsUrlModal.NodeEditor,
      nodeId: "node-1",
      editor: WorkflowsUrlEditor.OutputEditor,
      pinnedOutputId: "pinned-output-1",
    });
    const deepEditorUrl = applyWorkflowsUrlPatch(
      `http://localhost${outputUrl}`,
      {
        editor: WorkflowsUrlEditor.DeepEditor,
        deepEditorTab: "output",
        deepEditorOutputTab: "json",
      },
    );

    expect(
      readWorkflowsUrlState(`http://localhost${deepEditorUrl}`),
    ).toMatchObject({
      editor: WorkflowsUrlEditor.DeepEditor,
      deepEditorTab: "output",
      deepEditorOutputTab: "json",
      pinnedOutputId: "pinned-output-1",
    });
  });

  it("writes regex tester modal state without persisting test input", () => {
    const nextUrl = applyWorkflowsUrlPatch("http://localhost/workflows", {
      modal: WorkflowsUrlModal.NodeEditor,
      nodeId: "node-1",
      editor: WorkflowsUrlEditor.RegexTester,
      regexPattern: "^foo$",
      regexFlags: "i",
    });

    expect(readWorkflowsUrlState(`http://localhost${nextUrl}`)).toMatchObject({
      editor: WorkflowsUrlEditor.RegexTester,
      regexPattern: "^foo$",
      regexFlags: "i",
    });
  });

  it("writes restore and clone version action dialog state", () => {
    const nextUrl = applyWorkflowsUrlPatch("http://localhost/workflows", {
      modal: WorkflowsUrlModal.EditHistory,
      versionId: "version-1",
      versionAction: WorkflowsUrlVersionAction.Clone,
    });

    expect(nextUrl).toBe(
      "/workflows?modal=edit-history&version=version-1&action=clone",
    );
    expect(readWorkflowsUrlState(`http://localhost${nextUrl}`)).toMatchObject({
      versionId: "version-1",
      versionAction: WorkflowsUrlVersionAction.Clone,
    });
  });

  it("writes version compare and diff query state", () => {
    const nextUrl = applyWorkflowsUrlPatch("http://localhost/workflows", {
      modal: WorkflowsUrlModal.VersionDetails,
      versionId: "version-2",
      compareVersionId: "version-1",
      diffQuery: "pinned output",
    });

    expect(nextUrl).toBe(
      "/workflows?modal=version-details&version=version-2&compare=version-1&diff=pinned+output",
    );
    expect(readWorkflowsUrlState(`http://localhost${nextUrl}`)).toMatchObject({
      modal: WorkflowsUrlModal.VersionDetails,
      versionId: "version-2",
      compareVersionId: "version-1",
      diffQuery: "pinned output",
    });
  });

  it("clears modal scoped params without clearing the selected execution", () => {
    const nextUrl = applyWorkflowsUrlPatch(
      "http://localhost/workflows?panel=history&execution=execution-1&modal=node-editor&node=node-1",
      {
        modal: null,
        nodeId: null,
        assetId: null,
        versionId: null,
        compareVersionId: null,
        diffQuery: null,
        editor: null,
        pinnedOutputId: null,
        debugInputTab: null,
        debugOutputTab: null,
        debugInputSourceId: null,
        deepEditorTab: null,
        deepEditorOutputTab: null,
        regexPattern: null,
        regexFlags: null,
        versionAction: null,
      },
    );

    expect(nextUrl).toBe("/workflows?panel=history&execution=execution-1");
  });
});
