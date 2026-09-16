import { describe, expect, it } from "vitest";
import { loadTestDatabaseConfig } from "./test-database";

describe("test database configuration", () => {
  it("requires a dedicated test database URL", () => {
    expect(() =>
      loadTestDatabaseConfig({ DATABASE_URL: "postgres://app" }),
    ).toThrow("TEST_DATABASE_URL is required");
  });

  it("rejects using the application database for tests", () => {
    expect(() =>
      loadTestDatabaseConfig({
        DATABASE_URL: "postgres://app",
        TEST_DATABASE_URL: "postgres://app",
      }),
    ).toThrow("must differ");
  });

  it("accepts an isolated PostgreSQL test database", () => {
    expect(
      loadTestDatabaseConfig({
        DATABASE_URL: "postgres://app",
        TEST_DATABASE_URL: "postgres://test",
      }),
    ).toEqual({ connectionString: "postgres://test" });
  });
});
