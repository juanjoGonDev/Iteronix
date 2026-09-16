import { describe, expect, it } from "vitest";
import { ErrorMessage, HttpStatus } from "./constants";
import { ResultType } from "./result";
import {
  externalWorkflowOperationForRoute,
  parseSettingsUpdateRequest,
  redactExternalCredentialResponse,
} from "./server";
import { createDefaultApplicationState } from "./application-state";
import {
  ExternalApiKeyScopeKind,
  ExternalWorkflowOperation,
} from "../../../packages/domain/src/external-api-keys";

describe("settings API contract", () => {
  it("accepts typed settings updates", () => {
    const currentState = createDefaultApplicationState();

    const result = parseSettingsUpdateRequest(
      {
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
      currentState,
    );

    expect(result.type).toBe(ResultType.Ok);
    if (result.type !== ResultType.Ok) {
      throw new Error("Expected application update to parse.");
    }

    expect(result.value.workflowLimits.maxLoops).toBe(21);
    expect(result.value.notifications.webhookUrl).toBe(
      "https://hooks.example.com/iteronix",
    );
    expect(result.value).not.toHaveProperty("serverConnection");
  });

  it("rejects invalid settings update bodies as typed bad requests", () => {
    const result = parseSettingsUpdateRequest(
      null,
      createDefaultApplicationState(),
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
    const currentState = createDefaultApplicationState();

    const result = parseSettingsUpdateRequest(
      {
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
      currentState,
    );

    expect(result.type).toBe(ResultType.Ok);
    if (result.type !== ResultType.Ok) {
      return;
    }

    const profile = result.value.providerProfiles[0];
    expect(profile?.["apiKey"]).toBeUndefined();
    expect(profile?.["apiKeyEnvVar"]).toBe("WORKFLOW_PROVIDER_KEY");
  });

  it("maps only declared external routes to credential operations", () => {
    expect(externalWorkflowOperationForRoute("/external/workflows/read")).toBe(
      ExternalWorkflowOperation.WorkflowRead,
    );
    expect(
      externalWorkflowOperationForRoute("/external/workflows/invoke"),
    ).toBe(ExternalWorkflowOperation.WorkflowInvoke);
    expect(
      externalWorkflowOperationForRoute("/external/workflows/future"),
    ).toBeUndefined();
  });

  it("redacts credential verifier material from management responses", () => {
    const response = redactExternalCredentialResponse({
      id: "credential-1",
      name: "Deployments",
      secretHash: "server-only-verifier",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      operations: [ExternalWorkflowOperation.WorkflowRead],
      createdAt: "2026-07-28T00:00:00.000Z",
      rateLimitPerMinute: 60,
    });

    expect(response).toEqual({
      id: "credential-1",
      name: "Deployments",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      operations: [ExternalWorkflowOperation.WorkflowRead],
      createdAt: "2026-07-28T00:00:00.000Z",
      rateLimitPerMinute: 60,
    });
    expect(JSON.stringify(response)).not.toContain("server-only-verifier");
  });
});
