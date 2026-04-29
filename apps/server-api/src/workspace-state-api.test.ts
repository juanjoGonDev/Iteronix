import { describe, expect, it } from "vitest";
import { ErrorMessage, HttpStatus } from "./constants";
import { ResultType } from "./result";
import { parseWorkspaceStateUpdateRequest } from "./server";
import { createDefaultWorkspaceState } from "./workspace-state";

describe("workspace state API contract", () => {
  it("accepts typed workspace state updates", () => {
    const currentState = {
      ...createDefaultWorkspaceState(),
      projects: [
        {
          id: "project-1",
          name: "Iteronix",
          rootPath: "D:/projects/Iteronix",
          createdAt: "2026-04-29T10:00:00.000Z",
          updatedAt: "2026-04-29T10:00:00.000Z"
        }
      ]
    };

    const result = parseWorkspaceStateUpdateRequest({
      activeProjectId: "project-1",
      workbenchHistory: {
        runs: [
          {
            id: "run-1",
            kind: "skill"
          }
        ],
        evals: []
      }
    }, currentState);

    expect(result.type).toBe(ResultType.Ok);
    if (result.type !== ResultType.Ok) {
      throw new Error("Expected workspace update to parse.");
    }

    expect(result.value.activeProjectId).toBe("project-1");
    expect(result.value.workbenchHistory?.runs).toHaveLength(1);
    expect(result.value.settings).toBeUndefined();
  });

  it("rejects invalid workspace state update bodies as typed bad requests", () => {
    const result = parseWorkspaceStateUpdateRequest(null, createDefaultWorkspaceState());

    expect(result).toEqual({
      type: ResultType.Err,
      error: {
        status: HttpStatus.BadRequest,
        message: ErrorMessage.InvalidBody
      }
    });
  });
});
