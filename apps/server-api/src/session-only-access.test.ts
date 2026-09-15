import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultApplicationState,
  type ApplicationState,
  type ApplicationStateStore,
} from "./application-state";
import { createIdeAuthService, type IdeAuthState } from "./ide-auth";
import { createProviderStore } from "./providers";
import { createApiServer, createApplicationPersistence } from "./server";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import { createWorkflowRuntimeService } from "./workflow-runtime";

const TrustedOrigin = "http://127.0.0.1:4000";
const UntrustedOrigin = "http://iteronix.example.test";
const Administrator = { email: "admin@admin", password: "admin" } as const;
const SessionCookieName = "iteronix_session";
const servers: Server[] = [];

describe("session-only API access without AUTH_TOKEN", () => {
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(closeServer));
  });

  it("authorizes internal routes from a trusted IDE session and no bearer token", async () => {
    const url = await startServer({ authToken: undefined });
    const login = await post(url, "/auth/login", Administrator, {
      origin: TrustedOrigin,
    });
    expect(login.status).toBe(200);
    expect(login.cookie).toContain(SessionCookieName);

    const settings = await post(
      url,
      "/settings/get",
      {},
      { cookie: login.cookie, origin: TrustedOrigin },
    );

    expect(settings.status).toBe(200);
    expect(settings.body["settings"]).toBeDefined();
  });

  it("rejects internal routes without a session or with an untrusted origin", async () => {
    const url = await startServer({ authToken: undefined });
    const login = await post(url, "/auth/login", Administrator, {
      origin: TrustedOrigin,
    });

    const anonymous = await post(
      url,
      "/settings/get",
      {},
      {
        origin: TrustedOrigin,
      },
    );
    expect(anonymous.status).toBe(401);

    const forgedOrigin = await post(
      url,
      "/settings/get",
      {},
      { cookie: login.cookie, origin: UntrustedOrigin },
    );
    expect(forgedOrigin.status).toBe(401);
  });

  it("never treats a missing bearer header as administrator credentials", async () => {
    const url = await startServer({ authToken: undefined });

    const anonymous = await post(
      url,
      "/settings/credentials/list",
      {},
      {
        origin: TrustedOrigin,
      },
    );
    expect(anonymous.status).toBe(401);

    const login = await post(url, "/auth/login", Administrator, {
      origin: TrustedOrigin,
    });
    const withSession = await post(
      url,
      "/settings/credentials/list",
      {},
      { cookie: login.cookie, origin: TrustedOrigin },
    );
    // Authorization passes with the administrator session; the fixture has no
    // credential storage wired, so only the authentication outcome is asserted.
    expect(withSession.status).not.toBe(401);
  });

  it("points first-boot administrator creation at the environment", async () => {
    const url = await startServer({ authToken: undefined });

    const bootstrap = await post(
      url,
      "/auth/bootstrap-admin",
      { email: "someone@example.com", password: "CorrectHorseBatteryStaple1" },
      {},
    );

    expect(bootstrap.status).toBe(403);
    expect(readErrorMessage(bootstrap.body)).toContain(
      "ITERONIX_ADMIN_PASSWORD",
    );
  });
});

const startServer = async (input: {
  authToken: string | undefined;
}): Promise<string> => {
  const providerStore = createProviderStore();
  const workflowCatalog = createWorkflowCatalogStore();
  const persistence = createApplicationPersistence({
    stateStore: createMemoryStore(createConfiguredApplicationState()),
    initialState: createConfiguredApplicationState(),
    providerStore,
    workflowCatalog,
  });
  const server = createApiServer({
    config: {
      port: 0,
      host: "127.0.0.1",
      ...(input.authToken === undefined ? {} : { authToken: input.authToken }),
      databaseUrl: "postgresql://test",
      ideUiOrigins: [TrustedOrigin],
    },
    providerStore,
    workflowRuntime: createWorkflowRuntimeService({
      readApplicationState: persistence.read,
    }),
    applicationPersistence: persistence,
    workflowCatalog,
  });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Unexpected server address");
  }

  return `http://127.0.0.1:${address.port.toString()}`;
};

/** State that already carries the administrator configured at startup. */
const createConfiguredApplicationState = (): ApplicationState => {
  const ideAuth = createIdeAuthService({
    load: () => undefined,
    save: () => undefined,
    now: () => new Date().toISOString(),
    randomToken: (() => {
      let sequence = 0;
      return () => `token-${++sequence}`;
    })(),
  });
  ideAuth.ensureAdministrator(Administrator);
  return {
    ...createDefaultApplicationState(),
    ideAuth: ideAuth.snapshot() as IdeAuthState,
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

const post = async (
  url: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{
  status: number;
  body: Record<string, unknown>;
  cookie: string;
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
  };
};

const readErrorMessage = (body: Record<string, unknown>): string => {
  const error = body["error"];
  if (!isRecord(error)) return "";
  const message = error["message"];
  return typeof message === "string" ? message : "";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const closeServer = async (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });
