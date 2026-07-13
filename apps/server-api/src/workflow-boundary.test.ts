import { describe, expect, it } from "vitest";
import { isWorkflowOnlyRoute } from "./server";

describe("workflow-only server boundary", () => {
  it("admits retained workflow paths", () => {
    expect(isWorkflowOnlyRoute("/workflows/definitions/list")).toBe(true);
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
