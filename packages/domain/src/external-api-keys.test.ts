import { describe, expect, it } from "vitest";
import {
  ExternalApiKeyScopeKind,
  ExternalWorkflowOperation,
  ExternalWorkflowRateLimit,
  isExternalWorkflowCredentialAuthorized,
  isExternalWorkflowCredentialValid,
  isExternalApiKeyNameAvailable,
  isWorkflowAllowedForExternalApiKey,
  readWorkflowExternalApiKeyDependencies,
  revokeExternalApiKeysForWorkflow,
  type ExternalApiKeyRecord,
} from "./external-api-keys";

const createKey = (
  scope: ExternalApiKeyRecord["scope"],
): ExternalApiKeyRecord => ({
  id: "key-1",
  name: "Deployments",
  scope,
  secretHash: "scrypt$stored-hash",
  createdAt: "2026-07-15T10:00:00.000Z",
});

describe("external workflow API key policy", () => {
  it("allows every workflow only for all-workflows keys", () => {
    expect(
      isWorkflowAllowedForExternalApiKey(
        createKey({ kind: ExternalApiKeyScopeKind.AllWorkflows }),
        "workflow-other",
      ),
    ).toBe(true);
  });

  it("enforces selected-workflow scopes and key revocation", () => {
    const key = createKey({
      kind: ExternalApiKeyScopeKind.SelectedWorkflows,
      workflowIds: ["workflow-allowed"],
    });

    expect(isWorkflowAllowedForExternalApiKey(key, "workflow-allowed")).toBe(
      true,
    );
    expect(isWorkflowAllowedForExternalApiKey(key, "workflow-other")).toBe(
      false,
    );
    expect(
      isWorkflowAllowedForExternalApiKey(
        { ...key, revokedAt: "2026-07-15T11:00:00.000Z" },
        "workflow-allowed",
      ),
    ).toBe(false);
  });

  it("returns non-secret warning data and revokes dependencies for a deleted workflow", () => {
    const key = createKey({
      kind: ExternalApiKeyScopeKind.SelectedWorkflows,
      workflowIds: ["workflow-1"],
    });
    const dependencies = readWorkflowExternalApiKeyDependencies(
      [key],
      "workflow-1",
    );
    const revoked = revokeExternalApiKeysForWorkflow({
      keys: [key],
      workflowId: "workflow-1",
      revokedAt: "2026-07-15T11:00:00.000Z",
    });

    expect(dependencies).toEqual([
      expect.objectContaining({ id: "key-1", name: "Deployments" }),
    ]);
    expect(dependencies[0]).not.toHaveProperty("secretHash");
    expect(revoked.revoked).toHaveLength(1);
    expect(revoked.keys[0]?.revokedAt).toBe("2026-07-15T11:00:00.000Z");
  });

  it("keeps previously revoked and unrelated keys untouched for a deleted workflow", () => {
    const alreadyRevoked: ExternalApiKeyRecord = {
      ...createKey({
        kind: ExternalApiKeyScopeKind.SelectedWorkflows,
        workflowIds: ["workflow-1"],
      }),
      revokedAt: "2026-07-15T10:30:00.000Z",
    };
    const unrelated = createKey({
      kind: ExternalApiKeyScopeKind.AllWorkflows,
    });

    const revoked = revokeExternalApiKeysForWorkflow({
      keys: [alreadyRevoked, unrelated],
      workflowId: "workflow-1",
      revokedAt: "2026-07-15T11:00:00.000Z",
    });

    expect(revoked.revoked).toEqual([]);
    expect(revoked.keys).toEqual([alreadyRevoked, unrelated]);
  });

  it("accepts a key's own name but rejects another key's duplicate name", () => {
    const key = createKey({ kind: ExternalApiKeyScopeKind.AllWorkflows });

    expect(isExternalApiKeyNameAvailable([key], "deployments", key.id)).toBe(
      true,
    );
    expect(
      isExternalApiKeyNameAvailable([key], " DEPLOYMENTS ", "another-key"),
    ).toBe(false);
  });
});

describe("external workflow credential policy", () => {
  const credential: ExternalApiKeyRecord = {
    ...createKey({
      kind: ExternalApiKeyScopeKind.SelectedWorkflows,
      workflowIds: ["workflow-allowed"],
    }),
    operations: [
      ExternalWorkflowOperation.WorkflowRead,
      ExternalWorkflowOperation.WorkflowInvoke,
    ],
    rateLimitPerMinute: ExternalWorkflowRateLimit.DefaultPerMinute,
  };

  it("authorizes only declared operations and selected workflows", () => {
    expect(
      isExternalWorkflowCredentialAuthorized(
        credential,
        ExternalWorkflowOperation.WorkflowRead,
        "workflow-allowed",
      ),
    ).toBe(true);
    expect(
      isExternalWorkflowCredentialAuthorized(
        credential,
        ExternalWorkflowOperation.WorkflowInvoke,
        "workflow-allowed",
      ),
    ).toBe(true);
    expect(
      isExternalWorkflowCredentialAuthorized(
        credential,
        ExternalWorkflowOperation.RunTrace,
        "workflow-allowed",
      ),
    ).toBe(false);
    expect(
      isExternalWorkflowCredentialAuthorized(
        credential,
        "future.operation",
        "workflow-allowed",
      ),
    ).toBe(false);
    expect(
      isExternalWorkflowCredentialAuthorized(
        credential,
        ExternalWorkflowOperation.WorkflowRead,
        "workflow-other",
      ),
    ).toBe(false);
  });

  it("rejects expired and revoked credentials and validates the configured rate limit", () => {
    const now = "2026-07-28T12:00:00.000Z";
    expect(
      isExternalWorkflowCredentialValid(
        { ...credential, expiresAt: "2026-07-28T11:59:59.000Z" },
        now,
      ),
    ).toBe(false);
    expect(
      isExternalWorkflowCredentialValid({ ...credential, revokedAt: now }, now),
    ).toBe(false);
    expect(isExternalWorkflowCredentialValid(credential, now)).toBe(true);
    expect(ExternalWorkflowRateLimit.isValid(1)).toBe(true);
    expect(ExternalWorkflowRateLimit.isValid(600)).toBe(true);
    expect(ExternalWorkflowRateLimit.isValid(0)).toBe(false);
    expect(ExternalWorkflowRateLimit.isValid(601)).toBe(false);
  });
});
