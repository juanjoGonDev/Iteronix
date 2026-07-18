import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultApplicationState,
  type ApplicationState,
  type ApplicationStateStore,
} from "./application-state";
import type { EditableAssetRecord } from "./editable-assets";
import { createProviderStore } from "./providers";
import { createApiServer, createApplicationPersistence } from "./server";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import { createWorkflowRuntimeService } from "./workflow-runtime";

const AuthToken = "editable-assets-api-token";
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("editable assets API", () => {
  it("authenticates list, persists upserts through reload, and deletes assets", async () => {
    const stateStore = createMemoryStore(createDefaultApplicationState());
    const first = createTestServer(stateStore);
    servers.push(first.server);
    const firstUrl = await listen(first.server);

    const unauthorized = await request(firstUrl, "/assets/list", {}, "");
    expect(unauthorized.status).toBe(401);

    const upserted = await request(firstUrl, "/assets/upsert", createAsset());
    expect(upserted.status).toBe(200);
    expect(upserted.body["asset"]).toMatchObject({
      id: "agent-reference",
      kind: "agent",
    });

    await closeServer(first.server);
    servers.splice(servers.indexOf(first.server), 1);
    const reloaded = createTestServer(stateStore, await stateStore.load());
    servers.push(reloaded.server);
    const reloadedUrl = await listen(reloaded.server);

    const listed = await request(reloadedUrl, "/assets/list", {});
    expect(listed.status).toBe(200);
    expect(listed.body["assets"]).toEqual([
      expect.objectContaining({ id: "agent-reference" }),
    ]);

    const deleted = await request(reloadedUrl, "/assets/delete", {
      assetId: "agent-reference",
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ assetId: "agent-reference" });
    expect(
      (await request(reloadedUrl, "/assets/list", {})).body["assets"],
    ).toEqual([]);
  });

  it("rejects malformed asset requests without persisting an unsafe record", async () => {
    const testServer = createTestServer(
      createMemoryStore(createDefaultApplicationState()),
    );
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const malformed = await request(url, "/assets/upsert", { id: "unsafe" });
    expect(malformed.status).toBe(400);
    expect((await request(url, "/assets/list", {})).body["assets"]).toEqual([]);
    expect(
      (await request(url, "/assets/delete", { assetId: "missing" })).status,
    ).toBe(404);
  });

  it("requires a bearer token when Origin and Host impersonate the local UI", async () => {
    const testServer = createTestServer(
      createMemoryStore(createDefaultApplicationState()),
    );
    servers.push(testServer.server);
    const url = await listen(testServer.server);

    const forged = await request(url, "/assets/upsert", createAsset(), "", {
      host: "127.0.0.1:4000",
      origin: "http://127.0.0.1:4000",
    });

    expect(forged.status).toBe(401);
    expect((await request(url, "/assets/list", {})).body["assets"]).toEqual([]);
  });
});

const createTestServer = (
  stateStore: ApplicationStateStore,
  initialState = createDefaultApplicationState(),
) => {
  const providerStore = createProviderStore();
  const workflowCatalog = createWorkflowCatalogStore();
  const persistence = createApplicationPersistence({
    stateStore,
    initialState,
    providerStore,
    workflowCatalog,
  });
  return {
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

const createAsset = (): EditableAssetRecord => ({
  id: "agent-reference",
  kind: "agent",
  name: "Reference agent",
  status: "enabled",
  capabilities: ["tool-calls"],
  permissions: ["tool.invoke"],
  inputSchema: schema("agent.input"),
  outputSchema: schema("agent.output"),
  limits: { executions: 1, timeoutMs: 1000 },
  provenance: {
    source: "test",
    artifactFingerprint: "agent-fingerprint",
    registeredAt: "2026-07-18T00:00:00.000Z",
  },
  agent: {
    providerId: "test",
    model: "test-model",
    toolPermissions: ["tool.invoke"],
  },
});

const schema = (id: string) => ({
  id,
  version: 1,
  schema: { type: "object" as const, additionalProperties: false },
});

const request = async (
  url: string,
  path: string,
  body: unknown,
  token = AuthToken,
  headers: Readonly<Record<string, string>> = {},
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
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
