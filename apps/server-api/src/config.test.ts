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
});
