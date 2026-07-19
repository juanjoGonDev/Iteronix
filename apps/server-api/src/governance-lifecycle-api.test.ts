import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { GovernanceTransitionKind } from "../../../packages/domain/src/governance-lifecycle";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import {
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
} from "../../../packages/shared/src/workflows";
import {
  createDefaultApplicationState,
  type ApplicationState,
  type ApplicationStateStore,
} from "./application-state";
import { createGovernanceLifecycleService } from "./governance-lifecycle-service";
import { createProviderStore } from "./providers";
import { createApiServer, createApplicationPersistence } from "./server";
import { createWorkflowRuntimeService } from "./workflow-runtime";

const AuthToken = "governance-lifecycle-api-token";
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("governance lifecycle API", () => {
  it("links an IDE workflow run to its persisted governed prompt trace", async () => {
    const testServer = createTestServer();
    testServer.workflowCatalog.upsertWorkflow(createWorkflow());
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const run = await request(url, "/workflows/executions/run", {
      workflowId: "workflow-governed-run",
    });

    expect(run.status).toBe(200);
    const execution = run.body.execution as Record<string, unknown>;
    expect(typeof execution["lifecycleId"]).toBe("string");
    const lifecycle = testServer.persistence
      .read()
      .governanceLifecycles.find(
        (entry) => entry.id === execution["lifecycleId"],
      );
    expect(lifecycle?.state).toBe("awaiting-user-approval");
  });

  it("reads and records approve, continue, and reject controls with persisted audit data", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const awaiting = await createAwaitingLifecycle(
      testServer.persistence,
      "awaiting",
    );

    const read = await request(url, "/governance/lifecycles/get", {
      lifecycleId: awaiting.id,
    });
    expect(read.status).toBe(200);
    expect(read.body.lifecycle).toEqual(
      expect.objectContaining({
        id: awaiting.id,
        state: "awaiting-user-approval",
        fingerprints: {
          scope: "scope-awaiting",
          evidence: "evidence-awaiting",
        },
        budgets: { execution: 1, repair: 0, review: 1 },
      }),
    );
    expect(read.body.lifecycle.transitions).toHaveLength(5);

    const approved = await request(url, "/governance/lifecycles/approve", {
      lifecycleId: awaiting.id,
      actorId: "user-1",
      reason: "Approved evidence.",
    });
    expect(approved.status).toBe(200);
    expect(approved.body.lifecycle.transitions.at(-1)).toEqual(
      expect.objectContaining({
        kind: "approve",
        actor: { kind: "user", id: "authenticated-bearer-client" },
      }),
    );

    const continuing = await createAwaitingLifecycle(
      testServer.persistence,
      "continuing",
    );
    const continued = await request(url, "/governance/lifecycles/continue", {
      lifecycleId: continuing.id,
      actorId: "user-1",
      reason: "Run one more bounded pass.",
    });
    expect(continued.status).toBe(200);
    expect(continued.body.lifecycle).toEqual(
      expect.objectContaining({ state: "planning", userAuthorizedPasses: 1 }),
    );

    const rejecting = await createAwaitingLifecycle(
      testServer.persistence,
      "rejecting",
    );
    const rejected = await request(url, "/governance/lifecycles/reject", {
      lifecycleId: rejecting.id,
      actorId: "user-1",
      feedback: "Use the source citations.",
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.lifecycle.transitions.at(-1)).toEqual(
      expect.objectContaining({
        kind: "reject-with-feedback",
        reason: "Use the source citations.",
      }),
    );
  });

  it("redacts sensitive prompt binding keys and values from the browser lifecycle response", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const lifecycle = await createAwaitingLifecycleWithSecret(
      testServer.persistence,
      "redacted",
    );

    const response = await request(url, "/governance/lifecycles/get", {
      lifecycleId: lifecycle.id,
    });
    const promptExecutions = response.body.lifecycle["promptExecutions"];

    expect(response.status).toBe(200);
    expect(JSON.stringify(promptExecutions)).not.toContain("apiKey");
    expect(JSON.stringify(promptExecutions)).not.toContain("api_key");
    expect(JSON.stringify(promptExecutions)).not.toContain("nestedToken");
    expect(JSON.stringify(promptExecutions)).not.toContain(
      "raw-browser-secret",
    );
    expect(JSON.stringify(promptExecutions)).not.toContain(
      "nested-browser-secret",
    );
    expect(JSON.stringify(promptExecutions)).toContain("[redacted]");
    expect(
      testServer.persistence
        .read()
        .governanceLifecycles.find((entry) => entry.id === lifecycle.id)
        ?.promptExecutions[0]?.bindings,
    ).toEqual({
      apiKey: "raw-browser-secret",
      api_key: "underscore-browser-secret",
      context: { nestedToken: "nested-browser-secret" },
      subject: "Visible",
    });
  });

  it("rejects a rerun request for an approved unchanged fingerprint", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const awaiting = await createAwaitingLifecycle(
      testServer.persistence,
      "approved",
    );
    await request(url, "/governance/lifecycles/approve", {
      lifecycleId: awaiting.id,
      actorId: "user-1",
      reason: "Approved.",
    });

    const rerun = await request(url, "/governance/lifecycles/begin", {
      lifecycleId: "rerun",
      workflowId: "workflow-1",
      fingerprints: { scope: "scope-approved", evidence: "evidence-approved" },
      limits: { execution: 1, repair: 1, review: 1 },
    });

    expect(rerun.status).toBe(400);
    expect(readErrorMessage(rerun.body.error)).toContain(
      "Approved fingerprints require a changed scope or evidence",
    );
  });

  it("rejects an Origin and Host forgery without the bearer token", async () => {
    const testServer = createTestServer();
    servers.push(testServer.server);
    const url = await listen(testServer.server);
    const response = await fetch(`${url}/governance/lifecycles/get`, {
      method: "POST",
      headers: {
        origin: url,
        host: url.replace("http://", ""),
        "content-type": "application/json",
      },
      body: JSON.stringify({ lifecycleId: "forged" }),
    });

    expect(response.status).toBe(401);
  });
});

const createTestServer = (): {
  server: Server;
  persistence: ReturnType<typeof createApplicationPersistence>;
  workflowCatalog: ReturnType<typeof createWorkflowCatalogStore>;
} => {
  const initialState = createDefaultApplicationState();
  const providerStore = createProviderStore();
  const workflowCatalog = createWorkflowCatalogStore();
  const persistence = createApplicationPersistence({
    stateStore: createMemoryStore(initialState),
    initialState,
    providerStore,
    workflowCatalog,
  });
  return {
    persistence,
    workflowCatalog,
    server: createApiServer({
      config: {
        port: 0,
        host: "127.0.0.1",
        authToken: AuthToken,
        databaseUrl: "postgresql://test",
      },
      providerStore,
      workflowRuntime: createWorkflowRuntimeService({
        readApplicationState: persistence.read,
      }),
      applicationPersistence: persistence,
      workflowCatalog,
    }),
  };
};

const createWorkflow = () => ({
  id: "workflow-governed-run",
  name: "Governed IDE run",
  description: "Persists lifecycle provenance for an IDE run.",
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
  nodes: [
    {
      id: "review",
      kind: WorkflowNodeKind.HumanReview,
      label: "Review",
      position: { x: 0, y: 0 },
      width: 320,
      collapsed: false,
      config: {},
      inputPorts: [],
      outputPorts: [],
      attachedGuardrails: [],
    },
  ],
  edges: [],
});

const createAwaitingLifecycle = async (
  persistence: ReturnType<typeof createApplicationPersistence>,
  id: string,
) => {
  const service = createGovernanceLifecycleService(persistence);
  const draft = await service.begin({
    id,
    workflowId: "workflow-1",
    fingerprints: { scope: `scope-${id}`, evidence: `evidence-${id}` },
    limits: { execution: 1, repair: 1, review: 1 },
    now: readNow(0),
  });
  const planning = await transition(
    service,
    draft.id,
    GovernanceTransitionKind.StartPlanning,
    1,
  );
  const executing = await transition(
    service,
    planning.id,
    GovernanceTransitionKind.StartExecuting,
    2,
  );
  const verifying = await transition(
    service,
    executing.id,
    GovernanceTransitionKind.StartVerifying,
    3,
  );
  const reviewing = await transition(
    service,
    verifying.id,
    GovernanceTransitionKind.StartReviewing,
    4,
  );
  return transition(
    service,
    reviewing.id,
    GovernanceTransitionKind.AwaitUserApproval,
    5,
  );
};

const createAwaitingLifecycleWithSecret = async (
  persistence: ReturnType<typeof createApplicationPersistence>,
  id: string,
) => {
  const service = createGovernanceLifecycleService(persistence);
  const draft = await service.begin({
    id,
    workflowId: "workflow-1",
    fingerprints: { scope: `scope-${id}`, evidence: `evidence-${id}` },
    limits: { execution: 1, repair: 1, review: 1 },
    now: readNow(0),
  });
  const planning = await transition(
    service,
    draft.id,
    GovernanceTransitionKind.StartPlanning,
    1,
  );
  const executing = await transition(
    service,
    planning.id,
    GovernanceTransitionKind.StartExecuting,
    2,
  );
  await service.recordPromptExecution({
    id: `${id}:prompt:1:0`,
    lifecycleId: executing.id,
    assetId: "prompt-secret",
    version: 1,
    bindings: {
      apiKey: "raw-browser-secret",
      api_key: "underscore-browser-secret",
      context: { nestedToken: "nested-browser-secret" },
      subject: "Visible",
    },
    renderedFingerprint: "fingerprint",
    validation: "passed",
    timestamp: readNow(3),
  });
  const verifying = await transition(
    service,
    executing.id,
    GovernanceTransitionKind.StartVerifying,
    4,
  );
  const reviewing = await transition(
    service,
    verifying.id,
    GovernanceTransitionKind.StartReviewing,
    5,
  );
  return transition(
    service,
    reviewing.id,
    GovernanceTransitionKind.AwaitUserApproval,
    6,
  );
};

const transition = (
  service: ReturnType<typeof createGovernanceLifecycleService>,
  lifecycleId: string,
  kind: GovernanceTransitionKind,
  step: number,
) =>
  service.transition({
    lifecycleId,
    kind,
    actorId: "runtime",
    reason: "Lifecycle transition.",
    now: readNow(step),
  });

const request = async (
  url: string,
  path: string,
  body: unknown,
): Promise<{
  status: number;
  body: {
    lifecycle: { transitions: ReadonlyArray<unknown> } & Record<
      string,
      unknown
    >;
    execution?: unknown;
    error?: unknown;
  };
}> => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${AuthToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      lifecycle: { transitions: ReadonlyArray<unknown> } & Record<
        string,
        unknown
      >;
      execution?: unknown;
      error?: unknown;
    },
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

const readNow = (step: number): string =>
  `2026-07-17T00:00:0${step.toString()}.000Z`;

const readErrorMessage = (value: unknown): string =>
  isRecord(value) && typeof value["message"] === "string"
    ? value["message"]
    : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
