import { describe, expect, it } from "vitest";
import { isWorkflowOnlyRoute } from "./server";

describe("workflow-only server boundary", () => {
  it("admits retained workflow paths", () => {
    expect(isWorkflowOnlyRoute("/workflows/definitions/list")).toBe(true);
    expect(isWorkflowOnlyRoute("/settings/get")).toBe(true);
  });

  it("rejects the removed workspace state API", () => {
    expect(isWorkflowOnlyRoute("/workspace/state/get")).toBe(false);
    expect(isWorkflowOnlyRoute("/workspace/state/update")).toBe(false);
  });

  it("rejects every removed product API family", () => {
    for (const path of [
      "/projects/open",
      "/files/tree",
      "/git/status",
      "/history/list",
      "/kanban/boards/list",
      "/logs/query",
      "/quality-gates/run",
      "/sessions/start",
      "/ai/skills/run",
    ]) {
      expect(isWorkflowOnlyRoute(path)).toBe(false);
    }
  });
});
