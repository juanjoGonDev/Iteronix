import { createHash } from "node:crypto";

const AdvisoryLockKey = 845_371_129;
const CreateMigrationLedgerSql = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;
const SelectAppliedMigrationsSql =
  "SELECT id, checksum FROM schema_migrations ORDER BY id ASC";
const InsertAppliedMigrationSql =
  "INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)";
const AdvisoryLockSql = "SELECT pg_advisory_xact_lock($1)";
const BeginTransactionSql = "BEGIN";
const CommitTransactionSql = "COMMIT";
const RollbackTransactionSql = "ROLLBACK";

export type DatabaseMigration = {
  id: string;
  sql: string;
};

export type DatabaseMigrationClient = {
  query: (
    text: string,
    values?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: ReadonlyArray<unknown> }>;
  release: () => void;
};

export type DatabaseMigrationPool = {
  connect: () => Promise<DatabaseMigrationClient>;
};

export type DatabaseMigrationVerification = {
  applied: ReadonlyArray<string>;
  pending: ReadonlyArray<string>;
};

export const applyDatabaseMigrations = async (
  pool: DatabaseMigrationPool,
  migrations: ReadonlyArray<DatabaseMigration>,
): Promise<DatabaseMigrationVerification> =>
  withMigrationTransaction(pool, async (client) => {
    assertUniqueMigrationIds(migrations);
    await client.query(CreateMigrationLedgerSql);
    const applied = await readAppliedMigrations(client);
    assertCompatibleMigrationHistory(migrations, applied);
    const pending = migrations.filter(
      (migration) => !applied.has(migration.id),
    );

    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query(InsertAppliedMigrationSql, [
        migration.id,
        calculateMigrationChecksum(migration.sql),
      ]);
    }

    return {
      applied: migrations.map((migration) => migration.id),
      pending: [],
    };
  });

export const verifyDatabaseMigrations = async (
  pool: DatabaseMigrationPool,
  migrations: ReadonlyArray<DatabaseMigration>,
): Promise<DatabaseMigrationVerification> =>
  withMigrationTransaction(pool, async (client) => {
    assertUniqueMigrationIds(migrations);
    const applied = await readAppliedMigrations(client);
    assertCompatibleMigrationHistory(migrations, applied);
    const pending = migrations
      .filter((migration) => !applied.has(migration.id))
      .map((migration) => migration.id);

    return {
      applied: migrations
        .filter((migration) => applied.has(migration.id))
        .map((migration) => migration.id),
      pending,
    };
  });

export const calculateMigrationChecksum = (sql: string): string =>
  createHash("sha256").update(sql).digest("hex");

const withMigrationTransaction = async <TValue>(
  pool: DatabaseMigrationPool,
  operation: (client: DatabaseMigrationClient) => Promise<TValue>,
): Promise<TValue> => {
  const client = await pool.connect();
  try {
    await client.query(BeginTransactionSql);
    await client.query(AdvisoryLockSql, [AdvisoryLockKey]);
    const result = await operation(client);
    await client.query(CommitTransactionSql);
    return result;
  } catch (error) {
    await client.query(RollbackTransactionSql);
    throw error;
  } finally {
    client.release();
  }
};

const readAppliedMigrations = async (
  client: DatabaseMigrationClient,
): Promise<ReadonlyMap<string, string>> => {
  const result = await client.query(SelectAppliedMigrationsSql);
  return new Map(result.rows.flatMap(readAppliedMigration));
};

const readAppliedMigration = (
  value: unknown,
): ReadonlyArray<[string, string]> => {
  if (!isRecord(value)) {
    throw new Error("Invalid database migration ledger row");
  }

  const id = value["id"];
  const checksum = value["checksum"];
  if (typeof id !== "string" || typeof checksum !== "string") {
    throw new Error("Invalid database migration ledger row");
  }

  return [[id, checksum]];
};

const assertCompatibleMigrationHistory = (
  migrations: ReadonlyArray<DatabaseMigration>,
  applied: ReadonlyMap<string, string>,
): void => {
  const knownMigrations = new Map(
    migrations.map((migration) => [migration.id, migration]),
  );
  for (const [id, checksum] of applied) {
    const migration = knownMigrations.get(id);
    if (!migration) {
      throw new Error(`Database migration ${id} is not present in this build`);
    }
    if (calculateMigrationChecksum(migration.sql) !== checksum) {
      throw new Error(`Database migration checksum mismatch for ${id}`);
    }
  }
};

const assertUniqueMigrationIds = (
  migrations: ReadonlyArray<DatabaseMigration>,
): void => {
  const identifiers = new Set<string>();
  for (const migration of migrations) {
    if (identifiers.has(migration.id)) {
      throw new Error(`Duplicate database migration id: ${migration.id}`);
    }
    identifiers.add(migration.id);
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
