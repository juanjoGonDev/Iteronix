import { describe, expect, it } from "vitest";
import {
  WorkflowsEmulationFixture,
  createWorkflowsEmulationDefinition,
} from "./workflows-emulation-fixture.js";
import { WorkflowNodeKind } from "../src/screens/workflows-editor-state.js";

describe("workflows emulation fixture", () => {
  it("creates a deterministic reusable workflow for browser tests", () => {
    const definition = createWorkflowsEmulationDefinition({
      projectId: WorkflowsEmulationFixture.ProjectId,
      workspaceId: WorkflowsEmulationFixture.ProjectId,
    });

    expect(definition.id).toBe(WorkflowsEmulationFixture.WorkflowId);
    expect(definition.name).toBe(WorkflowsEmulationFixture.WorkflowName);
    expect(WorkflowsEmulationFixture.ProjectRootPath).toBeNull();
    expect(definition.nodes.map((node) => node.kind)).toEqual([
      WorkflowNodeKind.TriggerManual,
      WorkflowNodeKind.AiAgent,
      WorkflowNodeKind.LogicCondition,
      WorkflowNodeKind.TerminalResponse,
    ]);
    expect(definition.edges).toHaveLength(3);
    expect(definition.nodes[1]?.config.pinnedTestOutput).toEqual({
      outputSnapshot: {
        result: "fixture-output",
        source: "workflows-emulation",
      },
      updatedAt: WorkflowsEmulationFixture.Timestamp,
    });
  });
});
