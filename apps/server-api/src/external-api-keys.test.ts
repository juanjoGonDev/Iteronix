import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { ExternalApiKeyScopeKind } from "../../../packages/domain/src/external-api-keys";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import {
  WorkflowRecordStatus,
  WorkflowTriggerKind,
} from "../../../packages/shared/src/workflows";
import {
  createExternalApiKey,
  verifyExternalApiKey,
} from "./external-api-keys";
import { createProviderStore } from "./providers";
import { createApiServer, createWorkspacePersistence } from "./server";
import { createWorkflowRuntimeService } from "./workflow-runtime";
import {
  createDefaultWorkspaceState,
  redactWorkspaceState,
  type WorkspaceState,
  type WorkspaceStateStore,
} from "./workspace-state";

const AuthToken = "internal-test-token";
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("external workflow API keys", () => {
  it("hashes generated keys and never stores their plaintext", () => {
    const created = createExternalApiKey({
      name: "Automation",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date("2026-07-15T10:00:00.000Z"),
    });

    expect(created.key.secretHash).not.toBe(created.plaintext);
    expect(created.key.secretHash).not.toContain(created.plaintext);
    expect(
      verifyExternalApiKey(created.plaintext, created.key.secretHash),
    ).toBe(true);
    const persisted = JSON.stringify(
      redactWorkspaceState({
        ...createDefaultWorkspaceState(),
        externalApiKeys: [created.key],
      }),
    );
    expect(persisted).not.toContain(created.plaintext);
    expect(persisted).toContain(created.key.secretHash);
  });

  it("rejects missing, invalid, revoked, and out-of-scope external keys", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const scoped = createExternalApiKey({
      name: "Scoped",
      scope: {
        kind: ExternalApiKeyScopeKind.SelectedWorkflows,
        workflowIds: ["workflow-allowed"],
      },
      now: new Date(),
    });
    const revoked = createExternalApiKey({
      name: "Revoked",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.persistence.updateExternalApiKeys([
      scoped.key,
      { ...revoked.key, revokedAt: new Date().toISOString() },
    ]);

    await expectExternalStatus(url, undefined, "workflow-allowed", 401);
    await expectExternalStatus(url, "invalid", "workflow-allowed", 401);
    await expectExternalStatus(url, scoped.plaintext, "workflow-other", 403);
    await expectExternalStatus(url, revoked.plaintext, "workflow-allowed", 401);
  });

  it("allows scoped reads, records last use, and keeps hashes out of management responses", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const created = createExternalApiKey({
      name: "Automation",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.persistence.updateExternalApiKeys([created.key]);

    const external = await fetch(`${url}/external/workflows/read`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${created.plaintext}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ workflowId: "workflow-allowed" }),
    });
    expect(external.status).toBe(200);
    expect(JSON.stringify(await external.json())).toContain("workflow-allowed");
    expect(
      testServer.persistence.read().externalApiKeys[0]?.lastUsedAt,
    ).toBeDefined();

    const internal = await fetch(`${url}/settings/api-keys/list`, {
      method: "POST",
      headers: { authorization: `Bearer ${AuthToken}` },
    });
    const payload = (await internal.json()) as {
      keys: ReadonlyArray<Record<string, unknown>>;
    };
    expect(internal.status).toBe(200);
    expect(payload.keys[0]).not.toHaveProperty("secretHash");
    expect(JSON.stringify(payload)).not.toContain(created.plaintext);
  });

  it("updates an existing key name and scope without rotating its secret or allowing duplicates", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const editable = createExternalApiKey({
      name: "Deployments",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    const existing = createExternalApiKey({
      name: "Reports",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.persistence.updateExternalApiKeys([
      editable.key,
      existing.key,
    ]);

    const updated = await fetch(`${url}/settings/api-keys/update`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        keyId: editable.key.id,
        name: "Deployment automation",
        scope: {
          kind: ExternalApiKeyScopeKind.SelectedWorkflows,
          workflowIds: ["workflow-allowed"],
        },
      }),
    });

    expect(updated.status).toBe(200);
    expect(testServer.persistence.read().externalApiKeys[0]).toEqual(
      expect.objectContaining({
        id: editable.key.id,
        name: "Deployment automation",
        secretHash: editable.key.secretHash,
        scope: {
          kind: ExternalApiKeyScopeKind.SelectedWorkflows,
          workflowIds: ["workflow-allowed"],
        },
      }),
    );

    const duplicate = await fetch(`${url}/settings/api-keys/update`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        keyId: editable.key.id,
        name: "reports",
        scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      }),
    });

    expect(duplicate.status).toBe(400);
    expect(testServer.persistence.read().externalApiKeys[0]?.name).toBe(
      "Deployment automation",
    );
  });
});

const createTestServer = (): {
  server: Server;
  persistence: ReturnType<typeof createWorkspacePersistence>;
} => {
  const initialState = createDefaultWorkspaceState();
  const workflowCatalog = createWorkflowCatalogStore();
  workflowCatalog.upsertWorkflow({
    id: "workflow-allowed",
    name: "Allowed workflow",
    description: "Test workflow",
    status: WorkflowRecordStatus.Draft,
    trigger: { kind: WorkflowTriggerKind.Manual, enabled: true, config: {} },
    viewport: { x: 0, y: 0, zoom: 1 },
    executionPolicy: { maxNodeRetries: 0, allowManualCheckpointResume: false },
    defaultContextPolicy: {
      language: "en",
      carryMessagesLimit: 1,
      carryArtifactLimit: 1,
    },
    tags: [],
    nodes: [],
    edges: [],
  });
  const providerStore = createProviderStore();
  const persistence = createWorkspacePersistence({
    stateStore: createMemoryStore(initialState),
    initialState,
    providerStore,
    workflowCatalog,
  });
  const workflowRuntime = createWorkflowRuntimeService({
    readWorkspaceState: persistence.read,
  });
  return {
    persistence,
    server: createApiServer({
      config: {
        port: 0,
        host: "127.0.0.1",
        authToken: AuthToken,
        databaseUrl: "postgresql://test",
      },
      providerStore,
      workflowRuntime,
      workspacePersistence: persistence,
      workflowCatalog,
    }),
  };
};

const createMemoryStore = (initial: WorkspaceState): WorkspaceStateStore => {
  let state = initial;
  return {
    load: async () => state,
    save: async (next) => {
      state = next;
      return state;
    },
    update: async (updater) => {
      state = updater(state);
      return state;
    },
  };
};

const expectExternalStatus = async (
  url: string,
  apiKey: string | undefined,
  workflowId: string,
  status: number,
): Promise<void> => {
  const response = await fetch(`${url}/external/workflows/read`, {
    method: "POST",
    headers: {
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify({ workflowId }),
  });
  expect(response.status).toBe(status);
};

const listen = async (server: Server): Promise<string> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected TCP address."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
