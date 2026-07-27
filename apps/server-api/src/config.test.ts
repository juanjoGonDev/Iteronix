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
});
