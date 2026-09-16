import { config } from "dotenv";
import { readDatabaseMigrationCatalog } from "./database-migration-catalog";
import {
  applyDatabaseMigrations,
  verifyDatabaseMigrations,
} from "./database-migrations";
import { loadConfig } from "./config";
import { resolveRepositoryEnvPath } from "./environment";
import { createPostgresPool } from "./postgres-application-state";

const MigrateCommand = "migrate";
const VerifyCommand = "verify";

const run = async (): Promise<void> => {
  config({ path: resolveRepositoryEnvPath(__dirname) });
  const command = process.argv[2];
  const database = createPostgresPool(loadConfig(process.env).databaseUrl);
  try {
    const migrations = readDatabaseMigrationCatalog();
    if (command === MigrateCommand) {
      await applyDatabaseMigrations(database, migrations);
      return;
    }
    if (command === VerifyCommand) {
      const result = await verifyDatabaseMigrations(database, migrations);
      if (result.pending.length > 0) {
        throw new Error(
          `Pending database migrations: ${result.pending.join(", ")}`,
        );
      }
      return;
    }
    throw new Error("Expected database command: migrate or verify");
  } finally {
    await database.end();
  }
};

void run().catch((error: unknown) => {
  console.error("database.migration_failed", error);
  process.exitCode = 1;
});
