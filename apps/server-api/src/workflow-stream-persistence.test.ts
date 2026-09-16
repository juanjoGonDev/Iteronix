import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import {
  WorkflowNodeExecutionInputSourceKind,
  WorkflowNodeKind,
  WorkflowRecordStatus,
  WorkflowTriggerKind,
} from "../../../packages/shared/src/workflows";
import { createProviderStore } from "./providers";
import { createApiServer, createApplicationPersistence } from "./server";
import { createWorkflowRuntimeService } from "./workflow-runtime";
import {
  createDefaultApplicationState,
  type ApplicationStateStore,
} from "./application-state";

const AuthToken = "workflow-stream-test-token";
const Timestamp = "2026-07-13T15:30:00.000Z";

describe("workflow stream persistence failures", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(closeServer));
  });

  it.each([
    {
      name: "workflow execution stream",
      path: "/workflows/executions/stream?workflowId=workflow-stream",
    },
    {
      name: "workflow node stream",
      path: `/workflows/executions/stream-node?workflowId=workflow-stream&nodeId=review-node&inputSourceKind=${WorkflowNodeExecutionInputSourceKind.LastUpstream}`,
    },
  ])(
    "reports PostgreSQL failure instead of success for $name",
    async ({ path }) => {
      const server = createFailingPersistenceServer();
      servers.push(server);
      const url = await listen(server);

      const response = await fetch(`${url}${path}`, {
        headers: {
          authorization: `Bearer ${AuthToken}`,
        },
      });
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toContain("event: workflow_failed");
      expect(body).not.toContain("event: workflow_completed");
      expect(body).toContain("PostgreSQL persistence failed.");
    },
  );
});

const createFailingPersistenceServer = (): Server => {
  const initialState = createDefaultApplicationState();
  const workflowCatalog = createWorkflowCatalogStore({
    now: () => new Date(Timestamp),
  });
  workflowCatalog.upsertWorkflow({
    id: "workflow-stream",
    name: "Persistence stream workflow",
    description: "Reports durable state failures to SSE clients.",
    status: WorkflowRecordStatus.Draft,
    trigger: {
      kind: WorkflowTriggerKind.Manual,
      enabled: true,
      config: {},
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    executionPolicy: {
      maxNodeRetries: 0,
      allowManualCheckpointResume: false,
    },
    defaultContextPolicy: {
      language: "en",
      carryMessagesLimit: 1,
      carryArtifactLimit: 1,
    },
    tags: [],
    nodes: [
      {
        id: "review-node",
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
  const providerStore = createProviderStore();
  const applicationPersistence = createApplicationPersistence({
    stateStore: createFailingApplicationStateStore(initialState),
    initialState,
    providerStore,
    workflowCatalog,
  });
  const workflowRuntime = createWorkflowRuntimeService({
    readApplicationState: applicationPersistence.read,
    now: () => new Date(Timestamp),
  });

  return createApiServer({
    config: {
      port: 0,
      host: "127.0.0.1",
      authToken: AuthToken,
      databaseUrl: "postgresql://workflow-stream-test",
    },
    providerStore,
    workflowRuntime,
    applicationPersistence,
    workflowCatalog,
  });
};

const createFailingApplicationStateStore = (
  initialState: ReturnType<typeof createDefaultApplicationState>,
): ApplicationStateStore => ({
  load: async () => initialState,
  save: async () => {
    throw new Error("PostgreSQL persistence failed.");
  },
  update: async (updater) => updater(initialState),
});

const listen = async (server: Server): Promise<string> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected the test server to bind to a TCP port."));
        return;
      }

      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
