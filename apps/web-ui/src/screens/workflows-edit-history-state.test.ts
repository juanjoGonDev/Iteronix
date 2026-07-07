import { describe, expect, it } from "vitest";
import {
  createWorkflowEditHistoryEntry,
  readWorkflowEditHistoryHash,
  redoWorkflowEditHistory,
  restoreWorkflowEditHistoryEntry,
  undoWorkflowEditHistory,
  type WorkflowEditHistoryEntry,
} from "./workflows-edit-history-state.js";

describe("workflow edit history state", () => {
  it("creates stable automatic hashes for workflow snapshots", () => {
    const workflow = createWorkflow("First");

    const entry = createWorkflowEditHistoryEntry(
      workflow,
      "2026-07-07T08:00:00.000Z",
    );

    expect(entry.hash).toBe(readWorkflowEditHistoryHash(workflow));
    expect(entry.id).toContain(entry.hash);
    expect(entry.changedAt).toBe("2026-07-07T08:00:00.000Z");
  });

  it("undoes and redoes local workflow edits without losing snapshots", () => {
    const first = createWorkflow("First");
    const second = createWorkflow("Second");
    const third = createWorkflow("Third");
    const history = [
      createWorkflowEditHistoryEntry(second, "2026-07-07T08:02:00.000Z"),
      createWorkflowEditHistoryEntry(first, "2026-07-07T08:01:00.000Z"),
    ];

    const undone = undoWorkflowEditHistory({
      current: third,
      history,
      future: [],
    });

    expect(undone.current.name).toBe("Second");
    expect(undone.history.map((entry) => entry.workflow.name)).toEqual([
      "First",
    ]);
    expect(undone.future.map((entry) => entry.workflow.name)).toEqual([
      "Third",
    ]);

    const redone = redoWorkflowEditHistory(undone);

    expect(redone.current.name).toBe("Third");
    expect(redone.history.map((entry) => entry.workflow.name)).toEqual([
      "Second",
      "First",
    ]);
    expect(redone.future).toEqual([]);
  });

  it("restores an arbitrary edit entry and records the replaced draft for undo", () => {
    const first = createWorkflow("First");
    const second = createWorkflow("Second");
    const third = createWorkflow("Third");
    const entry = createWorkflowEditHistoryEntry(
      first,
      "2026-07-07T08:01:00.000Z",
    );
    const history: ReadonlyArray<WorkflowEditHistoryEntry<TestWorkflow>> = [
      createWorkflowEditHistoryEntry(second, "2026-07-07T08:02:00.000Z"),
      entry,
    ];

    const restored = restoreWorkflowEditHistoryEntry({
      current: third,
      entry,
      history,
      future: [],
    });

    expect(restored.current.name).toBe("First");
    expect(restored.history[0]?.workflow.name).toBe("Third");
    expect(restored.future).toEqual([]);
  });
});

type TestWorkflow = {
  id: string;
  name: string;
  nodes: ReadonlyArray<unknown>;
  edges: ReadonlyArray<unknown>;
};

const createWorkflow = (name: string): TestWorkflow => ({
  id: "workflow-1",
  name,
  nodes: [],
  edges: [],
});
