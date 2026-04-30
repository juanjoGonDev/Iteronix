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
      settings: {
        ...currentState.settings,
        workflowLimits: {
          infiniteLoops: true,
          maxLoops: 21,
          externalCalls: false
        },
        notifications: {
          soundEnabled: false,
          webhookUrl: "https://hooks.example.com/iteronix"
        },
        serverConnection: {
          serverUrl: "https://server.example.com",
          authToken: "server-token"
        }
      },
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
    expect(result.value.settings?.workflowLimits.maxLoops).toBe(21);
    expect(result.value.settings?.notifications.webhookUrl).toBe("https://hooks.example.com/iteronix");
    expect(result.value.settings?.serverConnection.serverUrl).toBe("https://server.example.com");
    expect(result.value.workbenchHistory?.runs).toHaveLength(1);
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
