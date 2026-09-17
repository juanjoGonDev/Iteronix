import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const requiredEnvironment = {
  AUTH_TOKEN: "test-token",
  DATABASE_URL: "postgresql://iteronix:iteronix@localhost:5432/iteronix",
};

describe("server configuration", () => {
  it("requires a PostgreSQL connection string", () => {
    expect(() =>
      loadConfig({
        AUTH_TOKEN: requiredEnvironment.AUTH_TOKEN,
      }),
    ).toThrow("DATABASE_URL is required");
  });

  it("starts without a bearer token so the browser session authenticates the UI", () => {
    const config = loadConfig({
      DATABASE_URL: requiredEnvironment.DATABASE_URL,
    });

    expect(config.authToken).toBeUndefined();
  });

  it("keeps the bearer token when one is configured for programmatic callers", () => {
    expect(loadConfig(requiredEnvironment).authToken).toBe("test-token");
  });

  it("defaults the administrator account and allows overriding it through the environment", () => {
    expect(
      loadConfig({ DATABASE_URL: requiredEnvironment.DATABASE_URL }).admin,
    ).toEqual({ email: "admin@admin", password: "admin" });

    expect(
      loadConfig({
        ...requiredEnvironment,
        ITERONIX_ADMIN_EMAIL: " owner@iteronix.test ",
        ITERONIX_ADMIN_PASSWORD: "a-long-owner-password",
      }).admin,
    ).toEqual({
      email: "owner@iteronix.test",
      password: "a-long-owner-password",
    });
  });

  it("trusts loopback UI origins by default and accepts an explicit origin list", () => {
    expect(
      loadConfig({
        DATABASE_URL: requiredEnvironment.DATABASE_URL,
        PORT: "8080",
      }).ideUiOrigins,
    ).toEqual([
      "http://localhost:4000",
      "http://127.0.0.1:4000",
      "http://localhost:8080",
      "http://127.0.0.1:8080",
    ]);

    expect(
      loadConfig({
        ...requiredEnvironment,
        IDE_UI_ORIGINS: "https://iteronix.example.test, http://localhost:5173",
      }).ideUiOrigins,
    ).toEqual(["https://iteronix.example.test", "http://localhost:5173"]);
  });

  it("exposes the PostgreSQL connection string", () => {
    expect(loadConfig(requiredEnvironment).databaseUrl).toBe(
      requiredEnvironment.DATABASE_URL,
    );
  });

  it("rejects non-PostgreSQL connection strings before startup", () => {
    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        DATABASE_URL: "mysql://localhost/iteronix",
      }),
    ).toThrow("DATABASE_URL must be a valid PostgreSQL URL");
  });

  it("keeps MCP server registrations in server-only startup configuration", () => {
    expect(
      loadConfig({
        ...requiredEnvironment,
        MCP_SERVERS: JSON.stringify([
          {
            serverId: "reference-knowledge",
            endpoint: "https://mcp.example.test/invoke",
            token: "server-only-token",
            allowedToolIds: ["knowledge.query"],
          },
        ]),
      }).mcpServers,
    ).toEqual([
      {
        serverId: "reference-knowledge",
        endpoint: "https://mcp.example.test/invoke",
        token: "server-only-token",
        allowedToolIds: ["knowledge.query"],
      },
    ]);
  });

  it("rejects remote HTTP MCP endpoints but permits explicit loopback HTTP", () => {
    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        MCP_SERVERS: JSON.stringify([
          {
            serverId: "remote-http",
            endpoint: "http://mcp.example.test/invoke",
            token: "server-only-token",
            allowedToolIds: ["knowledge.query"],
          },
        ]),
      }),
    ).toThrow("MCP_SERVERS entries are invalid");

    expect(
      loadConfig({
        ...requiredEnvironment,
        MCP_SERVERS: JSON.stringify([
          {
            serverId: "loopback-http",
            endpoint: "http://127.0.0.1:4010/invoke",
            token: "server-only-token",
            allowedToolIds: ["knowledge.query"],
          },
        ]),
      }).mcpServers,
    ).toHaveLength(1);
  });

  it("parses operator-added trusted plugin keys and always trusts the reference plugin", () => {
    expect(
      loadConfig({
        DATABASE_URL: requiredEnvironment.DATABASE_URL,
        ITERONIX_TRUSTED_PLUGIN_IDS:
          " acme.knowledge, reference.echo ,acme.knowledge ",
      }).trustedPluginIds,
    ).toEqual(["acme.knowledge", "reference.echo"]);

    expect(
      loadConfig({
        DATABASE_URL: requiredEnvironment.DATABASE_URL,
      }).trustedPluginIds,
    ).toEqual([]);

    expect(() =>
      loadConfig({
        ...requiredEnvironment,
        ITERONIX_TRUSTED_PLUGIN_IDS: "My Plugin,ok-key",
      }),
    ).toThrow(
      "ITERONIX_TRUSTED_PLUGIN_IDS contains invalid plugin keys: My Plugin",
    );
  });
});
