import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultApplicationState,
  parseApplicationState,
} from "./application-state";
import { readDatabaseMigrationCatalog } from "./database-migration-catalog";
import { applyDatabaseMigrations } from "./database-migrations";
import { createPostgresApplicationStateStore } from "./postgres-application-state";
import { loadTestDatabaseConfig } from "./test-database";

const testDatabaseUrl = process.env["TEST_DATABASE_URL"];
const databaseUrl = process.env["DATABASE_URL"];
const pools: Pool[] = [];

describe.skipIf(!testDatabaseUrl)("database migration integration", () => {
  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it("migrates a clean isolated schema and restores an application state backup", async () => {
    const config = loadTestDatabaseConfig({
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
    });
    const schema = `iteronix_test_${randomUUID().replaceAll("-", "_")}`;
    const administrator = trackPool(
      new Pool({ connectionString: config.connectionString }),
    );
    await administrator.query(`CREATE SCHEMA ${schema}`);
    const firstPool = createSchemaPool(config.connectionString, schema);
    await applyDatabaseMigrations(firstPool, readDatabaseMigrationCatalog());
    const firstStore = createPostgresApplicationStateStore(firstPool);
    const expected = createDefaultApplicationState();
    const saved = await firstStore.save(expected);
    const backup = JSON.stringify(saved);
    await firstPool.end();
    pools.splice(pools.indexOf(firstPool), 1);
    await administrator.query(`DROP SCHEMA ${schema} CASCADE`);
    await administrator.query(`CREATE SCHEMA ${schema}`);

    const restoredPool = createSchemaPool(config.connectionString, schema);
    await applyDatabaseMigrations(restoredPool, readDatabaseMigrationCatalog());
    const restoredStore = createPostgresApplicationStateStore(restoredPool);
    await restoredStore.save(parseApplicationState(JSON.parse(backup)));

    await expect(restoredStore.load()).resolves.toEqual(saved);
    await administrator.query(`DROP SCHEMA ${schema} CASCADE`);
  });
});

const createSchemaPool = (connectionString: string, schema: string): Pool =>
  trackPool(
    new Pool({
      connectionString,
      options: `-c search_path=${schema}`,
    }),
  );

const trackPool = (pool: Pool): Pool => {
  pools.push(pool);
  return pool;
};
