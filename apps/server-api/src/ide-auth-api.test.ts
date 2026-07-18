import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultApplicationState,
  type ApplicationState,
  type ApplicationStateStore,
} from "./application-state";
import { createProviderStore } from "./providers";
import { createApiServer, createApplicationPersistence } from "./server";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import { createWorkflowRuntimeService } from "./workflow-runtime";

const AuthToken = "auth-api-token";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe("IDE authentication API", () => {
  it("uses an HttpOnly session for IDE asset access without exposing the bearer", async () => {
    const server = createTestServer();
    servers.push(server);
    const url = await listen(server);
    const admin = await post(
      url,
      "/auth/bootstrap-admin",
      { email: "admin@example.com", password: "CorrectHorseBatteryStaple1" },
      { authorization: `Bearer ${AuthToken}` },
    );
    expect(admin.status).toBe(200);
    const registered = await post(url, "/auth/register", {
      email: "member@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    expect(registered.status).toBe(200);
    const login = await post(url, "/auth/login", {
      email: "member@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    expect(login.status).toBe(200);
    const cookie = login.cookie;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain(AuthToken);
    const assets = await post(
      url,
      "/assets/list",
      {},
      {
        cookie,
        origin: "http://127.0.0.1:4000",
      },
    );
    expect(assets.status).toBe(200);
    expect(assets.allowCredentials).toBe("true");
  });

  it("does not retain a failed auth mutation in a later request", async () => {
    const server = createTestServer(createFailingMemoryStore());
    servers.push(server);
    const url = await listen(server);
    const body = {
      email: "admin@example.com",
      password: "CorrectHorseBatteryStaple1",
    };
    const headers = { authorization: `Bearer ${AuthToken}` };
    expect(
      (await post(url, "/auth/bootstrap-admin", body, headers)).status,
    ).toBe(500);
    expect(
      (await post(url, "/auth/bootstrap-admin", body, headers)).status,
    ).toBe(200);
  });

  it("does not grant credentialed CORS access to arbitrary local origins", async () => {
    const server = createTestServer();
    servers.push(server);
    const url = await listen(server);
    await post(
      url,
      "/auth/bootstrap-admin",
      { email: "admin@example.com", password: "CorrectHorseBatteryStaple1" },
      { authorization: `Bearer ${AuthToken}` },
    );
    await post(url, "/auth/register", {
      email: "member@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    const login = await post(url, "/auth/login", {
      email: "member@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    const result = await post(
      url,
      "/assets/list",
      {},
      {
        cookie: login.cookie,
        origin: "http://localhost:5173",
      },
    );
    expect(result.allowCredentials).toBeNull();
  });

  it("enforces registration settings and invalidates a disabled user's session", async () => {
    const server = createTestServer();
    servers.push(server);
    const url = await listen(server);
    await post(
      url,
      "/auth/bootstrap-admin",
      { email: "admin@example.com", password: "CorrectHorseBatteryStaple1" },
      { authorization: `Bearer ${AuthToken}` },
    );
    const adminLogin = await post(url, "/auth/login", {
      email: "admin@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    await post(
      url,
      "/auth/admin/registration",
      { enabled: false },
      { cookie: adminLogin.cookie },
    );
    expect(
      (
        await post(url, "/auth/register", {
          email: "blocked@example.com",
          password: "CorrectHorseBatteryStaple1",
        })
      ).status,
    ).toBe(400);
    await post(
      url,
      "/auth/admin/registration",
      { enabled: true },
      { cookie: adminLogin.cookie },
    );
    const member = await post(url, "/auth/register", {
      email: "member@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    const login = await post(url, "/auth/login", {
      email: "member@example.com",
      password: "CorrectHorseBatteryStaple1",
    });
    await post(
      url,
      "/auth/admin/user-enabled",
      { userId: (member.body["user"] as { id: string }).id, enabled: false },
      { cookie: adminLogin.cookie },
    );
    expect(
      (await post(url, "/auth/me", {}, { cookie: login.cookie })).status,
    ).toBe(401);
  });
});

const createTestServer = (
  stateStore = createMemoryStore(createDefaultApplicationState()),
): Server => {
  const providerStore = createProviderStore();
  const workflowCatalog = createWorkflowCatalogStore();
  const persistence = createApplicationPersistence({
    stateStore,
    initialState: createDefaultApplicationState(),
    providerStore,
    workflowCatalog,
  });
  return createApiServer({
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
  });
};
const post = async (
  url: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  body: Record<string, unknown>;
  cookie: string;
  allowCredentials: string | null;
}> => {
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
    cookie: response.headers.get("set-cookie") ?? "",
    allowCredentials: response.headers.get("access-control-allow-credentials"),
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
const createFailingMemoryStore = (): ApplicationStateStore => {
  const store = createMemoryStore(createDefaultApplicationState());
  let failNextSave = true;
  return {
    load: store.load,
    save: async (state) => {
      if (failNextSave) {
        failNextSave = false;
        throw new Error("Persistence failed");
      }
      return store.save(state);
    },
    update: store.update,
  };
};
const listen = async (server: Server): Promise<string> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("Expected TCP address."));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
