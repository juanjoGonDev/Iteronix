import { describe, expect, it } from "vitest";
import { ErrorMessage, HttpStatus } from "./constants";
import { ResultType } from "./result";
import { parseWorkspaceStateUpdateRequest } from "./server";
import { createDefaultWorkspaceState } from "./workspace-state";

describe("workspace state API contract", () => {
  it("accepts typed workspace state updates", () => {
    const currentState = createDefaultWorkspaceState();

    const result = parseWorkspaceStateUpdateRequest(
      {
        settings: {
          ...currentState.settings,
          workflowLimits: {
            infiniteLoops: true,
            maxLoops: 21,
            externalCalls: false,
          },
          notifications: {
            soundEnabled: false,
            webhookUrl: "https://hooks.example.com/iteronix",
          },
          serverConnection: {
            serverUrl: "https://server.example.com",
            authToken: "server-token",
          },
        },
      },
      currentState,
    );

    expect(result.type).toBe(ResultType.Ok);
    if (result.type !== ResultType.Ok) {
      throw new Error("Expected workspace update to parse.");
    }

    expect(result.value.settings?.workflowLimits.maxLoops).toBe(21);
    expect(result.value.settings?.notifications.webhookUrl).toBe(
      "https://hooks.example.com/iteronix",
    );
    expect(result.value.settings?.serverConnection.serverUrl).toBe(
      "https://server.example.com",
    );
  });

  it("rejects invalid workspace state update bodies as typed bad requests", () => {
    const result = parseWorkspaceStateUpdateRequest(
      null,
      createDefaultWorkspaceState(),
    );

    expect(result).toEqual({
      type: ResultType.Err,
      error: {
        status: HttpStatus.BadRequest,
        message: ErrorMessage.InvalidBody,
      },
    });
  });

  it("keeps provider environment references while dropping plaintext API keys", () => {
    const currentState = createDefaultWorkspaceState();

    const result = parseWorkspaceStateUpdateRequest(
      {
        settings: {
          ...currentState.settings,
          providerProfiles: [
            {
              id: "openai",
              providerKind: "openai",
              apiKey: "raw-provider-key",
              apiKeyEnvVar: "WORKFLOW_PROVIDER_KEY",
            },
          ],
        },
      },
      currentState,
    );

    expect(result.type).toBe(ResultType.Ok);
    if (result.type !== ResultType.Ok) {
      return;
    }

    const profile = result.value.settings?.providerProfiles[0];
    expect(profile?.["apiKey"]).toBeUndefined();
    expect(profile?.["apiKeyEnvVar"]).toBe("WORKFLOW_PROVIDER_KEY");
  });
});
