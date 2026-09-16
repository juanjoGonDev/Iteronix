import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  applyDatabaseMigrations,
  verifyDatabaseMigrations,
  type DatabaseMigration,
} from "./database-migrations";

const migrations: ReadonlyArray<DatabaseMigration> = [
  {
    id: "001_bootstrap_application_state",
    sql: "CREATE TABLE app_state (key TEXT PRIMARY KEY)",
  },
  {
    id: "002_add_audit_table",
    sql: "CREATE TABLE audit_log (id TEXT PRIMARY KEY)",
  },
];

describe("database migrations", () => {
  it("applies forward-only migrations atomically under a PostgreSQL advisory lock", async () => {
    const pool = createPool();

    await applyDatabaseMigrations(pool, migrations);

    expect(pool.calls).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock($1)",
      expect.stringContaining("CREATE TABLE IF NOT EXISTS schema_migrations"),
      "SELECT id, checksum FROM schema_migrations ORDER BY id ASC",
      migrations[0]?.sql,
      "INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)",
      migrations[1]?.sql,
      "INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)",
      "COMMIT",
    ]);
    expect(pool.releaseCount).toBe(1);
  });

  it("refuses changed history and rolls back the transaction", async () => {
    const pool = createPool([{ id: migrations[0]?.id, checksum: "tampered" }]);

    await expect(applyDatabaseMigrations(pool, migrations)).rejects.toThrow(
      "checksum mismatch",
    );

    expect(pool.calls).toContain("ROLLBACK");
  });

  it("verifies a current database without executing migration SQL", async () => {
    const pool = createPool([
      { id: migrations[0]?.id, checksum: checksum(migrations[0]?.sql ?? "") },
      { id: migrations[1]?.id, checksum: checksum(migrations[1]?.sql ?? "") },
    ]);

    await expect(verifyDatabaseMigrations(pool, migrations)).resolves.toEqual({
      applied: [migrations[0]?.id, migrations[1]?.id],
      pending: [],
    });

    expect(pool.calls).not.toContain(migrations[0]?.sql);
    expect(pool.calls).not.toContain(migrations[1]?.sql);
  });

  it("rejects duplicate migration identifiers before changing the database", async () => {
    const pool = createPool();

    await expect(
      applyDatabaseMigrations(pool, [migrations[0]!, migrations[0]!]),
    ).rejects.toThrow("Duplicate database migration id");

    expect(pool.calls).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock($1)",
      "ROLLBACK",
    ]);
  });
});

const createPool = (
  applied: ReadonlyArray<{ id: string | undefined; checksum: string }> = [],
) => {
  const calls: string[] = [];
  let releaseCount = 0;
  return {
    calls,
    get releaseCount(): number {
      return releaseCount;
    },
    connect: async () => ({
      query: async (text: string) => {
        calls.push(text);
        return text.startsWith("SELECT id, checksum")
          ? { rows: applied }
          : { rows: [] };
      },
      release: () => {
        releaseCount += 1;
      },
    }),
  };
};

const checksum = (value: string): string => {
  return createHash("sha256").update(value).digest("hex");
};
