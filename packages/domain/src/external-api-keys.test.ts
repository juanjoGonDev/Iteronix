import { describe, expect, it } from "vitest";
import {
  ExternalApiKeyScopeKind,
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
