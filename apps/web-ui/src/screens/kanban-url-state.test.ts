import { describe, expect, it } from "vitest";

import { applyKanbanUrlPatch, readKanbanUrlState } from "./kanban-url-state.js";

describe("kanban url state", () => {
  it("reads and writes selected task id", () => {
    expect(readKanbanUrlState("http://localhost/kanban?task=t1")).toEqual({
      selectedTaskId: "t1",
    });

    expect(
      applyKanbanUrlPatch("http://localhost/kanban?task=t1", {
        selectedTaskId: null,
      }),
    ).toBe("/kanban");
  });
});
