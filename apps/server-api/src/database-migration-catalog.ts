import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseMigration } from "./database-migrations";

const SqlExtension = ".sql";
const SourceMigrationDirectory = "apps/server-api/migrations";
const RuntimeMigrationDirectory = "migrations";

export const readDatabaseMigrationCatalog =
  (): ReadonlyArray<DatabaseMigration> => {
    const directory = resolveMigrationDirectory();
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(SqlExtension))
      .map((entry) => ({
        id: entry.name.slice(0, -SqlExtension.length),
        sql: readFileSync(resolve(directory, entry.name), "utf8"),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  };

const resolveMigrationDirectory = (): string => {
  const sourceDirectory = resolve(process.cwd(), SourceMigrationDirectory);
  if (existsSync(sourceDirectory)) {
    return sourceDirectory;
  }

  const runtimeDirectory = resolve(process.cwd(), RuntimeMigrationDirectory);
  if (existsSync(runtimeDirectory)) {
    return runtimeDirectory;
  }

  throw new Error("Database migrations directory was not found");
};
