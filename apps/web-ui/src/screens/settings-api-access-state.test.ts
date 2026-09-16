import { describe, expect, it } from "vitest";
import {
  ExternalApiKeyScopeSelection,
  createExternalWorkflowCredentialDraft,
  dismissExternalWorkflowCredentialSecret,
  readExternalApiKeyScope,
  readExternalWorkflowCredentialCreateInput,
  showExternalWorkflowCredentialSecret,
} from "./settings-api-access-state.js";
import { canManageExternalWorkflowCredentials } from "./Settings.js";

describe("external API key scope selector", () => {
  it("allows credential management only for administrator sessions", () => {
    expect(canManageExternalWorkflowCredentials("admin")).toBe(true);
    expect(canManageExternalWorkflowCredentials("member")).toBe(false);
  });

  it("defaults to every workflow", () => {
    expect(
      readExternalApiKeyScope(ExternalApiKeyScopeSelection.AllWorkflows, []),
    ).toEqual({ kind: "all_workflows" });
  });

  it("uses only the workflow IDs selected in the selector", () => {
    expect(
      readExternalApiKeyScope(ExternalApiKeyScopeSelection.SelectedWorkflows, [
        "workflow-a",
        "workflow-b",
        "workflow-a",
      ]),
    ).toEqual({
      kind: "selected_workflows",
      workflowIds: ["workflow-a", "workflow-b"],
    });
  });

  it("builds a scoped credential request with explicit operations, expiry, and rate limit", () => {
    const input = readExternalWorkflowCredentialCreateInput({
      ...createExternalWorkflowCredentialDraft(),
      name: " Deploy automation ",
      scope: ExternalApiKeyScopeSelection.SelectedWorkflows,
      workflowIds: ["workflow-a", "workflow-a", "workflow-b"],
      operations: ["workflow.read", "workflow.invoke"],
      expiresAt: "2026-08-28T00:00:00.000Z",
      rateLimitPerMinute: 25,
    });

    expect(input).toEqual({
      name: "Deploy automation",
      scope: {
        kind: "selected_workflows",
        workflowIds: ["workflow-a", "workflow-b"],
      },
      operations: ["workflow.read", "workflow.invoke"],
      expiresAt: "2026-08-28T00:00:00.000Z",
      rateLimitPerMinute: 25,
    });
  });

  it("normalizes the value from a native local date-time picker before sending it to the API", () => {
    const pickerValue = "2026-08-28T09:30";

    const input = readExternalWorkflowCredentialCreateInput({
      ...createExternalWorkflowCredentialDraft(),
      name: "Scheduled automation",
      expiresAt: pickerValue,
    });

    expect(input.expiresAt).toBe(new Date(pickerValue).toISOString());
  });

  it("omits the expiry for never-expiring credentials and forwards unparsable dates untouched", () => {
    const neverExpires = readExternalWorkflowCredentialCreateInput({
      ...createExternalWorkflowCredentialDraft(),
      name: "Never expires",
      expiresAt: "   ",
    });
    expect(neverExpires).not.toHaveProperty("expiresAt");

    const unparsable = readExternalWorkflowCredentialCreateInput({
      ...createExternalWorkflowCredentialDraft(),
      name: "Loose expiry",
      expiresAt: "not-a-date",
    });
    expect(unparsable.expiresAt).toBe("not-a-date");
  });

  it("keeps a newly issued plaintext credential in volatile display state only until dismissed", () => {
    const secret = showExternalWorkflowCredentialSecret({
      credentialId: "credential-1",
      plaintextCredential: "itx_wf_once_only",
    });

    expect(secret).toEqual({
      credentialId: "credential-1",
      plaintextCredential: "itx_wf_once_only",
    });
    expect(dismissExternalWorkflowCredentialSecret(secret)).toBeNull();
  });
});
