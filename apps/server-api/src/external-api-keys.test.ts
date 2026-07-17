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
import { createApiServer, createApplicationPersistence } from "./server";
import { createWorkflowRuntimeService } from "./workflow-runtime";
import {
  createDefaultApplicationState,
  parseApplicationState,
  redactApplicationState,
  type ApplicationState,
  type ApplicationStateStore,
} from "./application-state";

const AuthToken = "internal-test-token";
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("external workflow API keys", () => {
  it("resumes one persisted retryable external lifecycle pass and preserves its audit query", async () => {
    const testServer = createTestServer({
      failureCount: 1,
      maxNodeRetries: 1,
      failureMessage: "Provider timeout.",
    });
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const apiKey = createExternalApiKey({
      name: "Retryable invoke",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.persistence.updateExternalApiKeys([apiKey.key]);

    const failed = await invokeExternalWorkflow(url, apiKey.plaintext);
    expect(failed.status).toBe(500);
    const paused = testServer.persistence.read().governanceLifecycles.at(-1);
    expect(paused).toMatchObject({
      state: "planning",
      budgets: { execution: 1, repair: 1, review: 0 },
    });
    expect(paused?.transitions.at(-1)).toMatchObject({
      kind: "auto-repair",
      failure: { classification: "retryable" },
    });
    expect(
      parseApplicationState(
        JSON.parse(JSON.stringify(testServer.persistence.read())),
      ).governanceLifecycles.at(-1),
    ).toEqual(paused);

    const resumed = await requestGovernanceLifecycle(url, "resume", paused?.id);
    expect(resumed.status).toBe(200);
    const resumedLifecycle = readLifecycle(resumed.body);
    expect(resumedLifecycle).toMatchObject({
      id: paused?.id,
      state: "awaiting-user-approval",
      budgets: { execution: 2, repair: 1, review: 1 },
    });
    expect(testServer.readRunCalls()).toBe(2);
    expect(
      testServer.workflowCatalog.listExecutions({
        workflowId: "workflow-allowed",
      }),
    ).toHaveLength(1);

    const audited = await requestGovernanceLifecycle(url, "get", paused?.id);
    expect(audited.status).toBe(200);
    expect(readLifecycle(audited.body)).toEqual(resumedLifecycle);

    const duplicate = await requestGovernanceLifecycle(
      url,
      "resume",
      paused?.id,
    );
    expect(duplicate.status).toBe(400);
    expect(testServer.readRunCalls()).toBe(2);
  });

  it("rejects retry resumption when the persisted workflow scope changes", async () => {
    const testServer = createTestServer({
      failureCount: 1,
      maxNodeRetries: 1,
      failureMessage: "Provider timeout.",
    });
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const apiKey = createExternalApiKey({
      name: "Scope-bound retry",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.persistence.updateExternalApiKeys([apiKey.key]);
    await invokeExternalWorkflow(url, apiKey.plaintext);
    const paused = testServer.persistence.read().governanceLifecycles.at(-1);
    const current = testServer.workflowCatalog.getWorkflow("workflow-allowed");
    if (!current) {
      throw new Error("Expected workflow fixture.");
    }
    testServer.workflowCatalog.upsertWorkflow({
      ...current,
      name: "Changed workflow",
    });

    const rejected = await requestGovernanceLifecycle(
      url,
      "resume",
      paused?.id,
    );
    expect(rejected.status).toBe(400);
    expect(testServer.readRunCalls()).toBe(1);
    expect(testServer.persistence.read().governanceLifecycles.at(-1)).toEqual(
      paused,
    );
  });

  it("rejects non-retryable external lifecycle resumption", async () => {
    const testServer = createTestServer({
      failureCount: 1,
      maxNodeRetries: 1,
      failureMessage: "Schema mismatch.",
    });
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const apiKey = createExternalApiKey({
      name: "Terminal invoke",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.persistence.updateExternalApiKeys([apiKey.key]);
    await invokeExternalWorkflow(url, apiKey.plaintext);
    const failed = testServer.persistence.read().governanceLifecycles.at(-1);

    expect(failed?.state).toBe("failed");
    const rejected = await requestGovernanceLifecycle(
      url,
      "resume",
      failed?.id,
    );
    expect(rejected.status).toBe(400);
    expect(testServer.readRunCalls()).toBe(1);
  });

  it("persists and reloads the external invocation lifecycle audit checkpoint", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const apiKey = createExternalApiKey({
      name: "Invoke",
      scope: { kind: ExternalApiKeyScopeKind.AllWorkflows },
      now: new Date(),
    });
    await testServer.persistence.updateExternalApiKeys([apiKey.key]);

    const response = await fetch(`${url}/external/workflows/invoke`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey.plaintext}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ workflowId: "workflow-allowed" }),
    });
    expect(response.status).toBe(200);
    const lifecycle = testServer.persistence.read().governanceLifecycles.at(-1);
    expect(lifecycle).toMatchObject({
      workflowId: "workflow-allowed",
      state: "awaiting-user-approval",
    });
    expect(lifecycle?.transitions.map((transition) => transition.kind)).toEqual(
      [
        "start-planning",
        "start-executing",
        "start-verifying",
        "start-reviewing",
        "await-user-approval",
      ],
    );
    expect(
      parseApplicationState(
        JSON.parse(JSON.stringify(testServer.persistence.read())),
      ).governanceLifecycles.at(-1),
    ).toEqual(lifecycle);
    const audited = await fetch(`${url}/governance/lifecycles/get`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${AuthToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ lifecycleId: lifecycle?.id }),
    });
    expect(audited.status).toBe(200);
    const auditedBody: unknown = await audited.json();
    const auditedTransitions =
      isRecord(auditedBody) && isRecord(auditedBody["lifecycle"])
        ? auditedBody["lifecycle"]["transitions"]
        : undefined;
    expect(auditedTransitions).toEqual(lifecycle?.transitions);
    const concurrent = await Promise.all(
      [1, 2].map(() =>
        fetch(`${url}/external/workflows/invoke`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey.plaintext}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ workflowId: "workflow-allowed" }),
        }),
      ),
    );
    expect(concurrent.map((item) => item.status)).toEqual([200, 200]);
    expect(
      new Set(
        testServer.persistence
          .read()
          .governanceLifecycles.map((item) => item.id),
      ).size,
    ).toBe(3);
  });

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
      redactApplicationState({
        ...createDefaultApplicationState(),
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

const createTestServer = (
  input: {
    failureCount?: number;
    failureMessage?: string;
    maxNodeRetries?: number;
  } = {},
): {
  server: Server;
  persistence: ReturnType<typeof createApplicationPersistence>;
  workflowCatalog: ReturnType<typeof createWorkflowCatalogStore>;
  readRunCalls: () => number;
} => {
  const initialState = createDefaultApplicationState();
  const workflowCatalog = createWorkflowCatalogStore();
  workflowCatalog.upsertWorkflow({
    id: "workflow-allowed",
    name: "Allowed workflow",
    description: "Test workflow",
    status: WorkflowRecordStatus.Draft,
    trigger: { kind: WorkflowTriggerKind.Manual, enabled: true, config: {} },
    viewport: { x: 0, y: 0, zoom: 1 },
    executionPolicy: {
      maxNodeRetries: input.maxNodeRetries ?? 0,
      allowManualCheckpointResume: false,
    },
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
  const persistence = createApplicationPersistence({
    stateStore: createMemoryStore(initialState),
    initialState,
    providerStore,
    workflowCatalog,
  });
  const baseWorkflowRuntime = createWorkflowRuntimeService({
    readApplicationState: persistence.read,
  });
  let runCalls = 0;
  const workflowRuntime = {
    ...baseWorkflowRuntime,
    runWorkflow: async (
      request: Parameters<typeof baseWorkflowRuntime.runWorkflow>[0],
    ) => {
      runCalls += 1;
      if (runCalls <= (input.failureCount ?? 0)) {
        throw new Error(input.failureMessage ?? "Provider timeout.");
      }
      return baseWorkflowRuntime.runWorkflow(request);
    },
  };
  return {
    persistence,
    workflowCatalog,
    readRunCalls: () => runCalls,
    server: createApiServer({
      config: {
        port: 0,
        host: "127.0.0.1",
        authToken: AuthToken,
        databaseUrl: "postgresql://test",
      },
      providerStore,
      workflowRuntime,
      applicationPersistence: persistence,
      workflowCatalog,
    }),
  };
};

const createMemoryStore = (
  initial: ApplicationState,
): ApplicationStateStore => {
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

const invokeExternalWorkflow = async (
  url: string,
  apiKey: string,
): Promise<Response> =>
  fetch(`${url}/external/workflows/invoke`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ workflowId: "workflow-allowed" }),
  });

const requestGovernanceLifecycle = async (
  url: string,
  action: "get" | "resume",
  lifecycleId: string | undefined,
): Promise<{ status: number; body: unknown }> => {
  const response = await fetch(`${url}/governance/lifecycles/${action}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${AuthToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ lifecycleId }),
  });
  return { status: response.status, body: await response.json() };
};

const readLifecycle = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) && isRecord(value["lifecycle"])
    ? value["lifecycle"]
    : undefined;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
