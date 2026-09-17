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
import { createPostgresExternalWorkflowCredentialRepository } from "./postgres-external-workflow-credentials";
import { loadTestDatabaseConfig } from "./test-database";
import { ExternalWorkflowOperation } from "../../../packages/domain/src/external-api-keys";

const testDatabaseUrl = process.env["TEST_DATABASE_URL"];
const databaseUrl = process.env["DATABASE_URL"];
const pools: Pool[] = [];
const CredentialId = "credential-transaction-boundary";
const CredentialName = "Transaction boundary credential";
const CredentialSecret = "itx_wf_transaction_boundary";
const WorkflowId = "workflow-transaction-boundary";
const CredentialCreatedAt = "2026-07-28T12:00:00.000Z";
const RateLimitPerMinute = 1;
const CredentialMigrationId = "002_external_workflow_credentials";
const CredentialAuditActorMigrationId =
  "003_external_workflow_credential_audit_actors";
const CredentialAuditFailureBoundMigrationId =
  "004_external_workflow_credential_anonymous_failure_bound";
const LegacyAuditCredentialId = "credential-legacy-audit";
const LegacyAuditEventKind = "authorize";
const LegacyAuditResult = "authorized";
const PoolQueryMustNotRunMessage =
  "repository transactions must use a checked-out client";
const InsertLegacyAuditSql = `
  INSERT INTO external_workflow_credential_audits (
    credential_id, event_kind, result
  ) VALUES ($1, $2, $3)
`;
const SelectLegacyAuditActorSql = `
  SELECT actor_kind, actor_id
  FROM external_workflow_credential_audits
  WHERE credential_id = $1
`;

describe.skipIf(!testDatabaseUrl)("database migration integration", () => {
  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()));
  });

  it("migrates a clean isolated schema and restores an application state backup at a new revision", async () => {
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
    const restored = await restoredStore.save(
      parseApplicationState(JSON.parse(backup)),
    );

    expect(restored).toEqual({ ...saved, revision: saved.revision + 1 });
    await expect(restoredStore.load()).resolves.toEqual(restored);
    await administrator.query(`DROP SCHEMA ${schema} CASCADE`);
  });

  it("upgrades legacy credential audit rows with deterministic actor attribution", async () => {
    const config = loadTestDatabaseConfig({
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
    });
    const schema = `iteronix_audit_${randomUUID().replaceAll("-", "_")}`;
    const administrator = trackPool(
      new Pool({ connectionString: config.connectionString }),
    );
    const credentialPool = createSchemaPool(config.connectionString, schema);
    const catalog = readDatabaseMigrationCatalog();
    // The pre-actor legacy state is every migration before 003. 004 cannot be
    // applied without 003 because its anonymous failure index references the
    // actor_kind column, so the simulated legacy catalog must stop at 002.
    const legacyCatalog = catalog.filter(
      (migration) =>
        migration.id !== CredentialAuditActorMigrationId &&
        migration.id !== CredentialAuditFailureBoundMigrationId,
    );

    await administrator.query(`CREATE SCHEMA ${schema}`);

    try {
      expect(legacyCatalog.map((migration) => migration.id)).toContain(
        CredentialMigrationId,
      );
      await applyDatabaseMigrations(credentialPool, legacyCatalog);
      await credentialPool.query(InsertLegacyAuditSql, [
        LegacyAuditCredentialId,
        LegacyAuditEventKind,
        LegacyAuditResult,
      ]);

      await applyDatabaseMigrations(credentialPool, catalog);

      const auditActors = await credentialPool.query(
        SelectLegacyAuditActorSql,
        [LegacyAuditCredentialId],
      );

      expect(auditActors.rows).toEqual([
        {
          actor_kind: "system",
          actor_id: "server-runtime",
        },
      ]);
    } finally {
      await administrator.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  });

  it("uses checked-out PostgreSQL connections to enforce one shared credential rate limit", async () => {
    const config = loadTestDatabaseConfig({
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
    });
    const schema = `iteronix_credential_${randomUUID().replaceAll("-", "_")}`;
    const administrator = trackPool(
      new Pool({ connectionString: config.connectionString }),
    );
    const credentialPool = createSchemaPool(config.connectionString, schema);
    await administrator.query(`CREATE SCHEMA ${schema}`);

    try {
      await applyDatabaseMigrations(
        credentialPool,
        readDatabaseMigrationCatalog(),
      );
      const firstRepository =
        createPostgresExternalWorkflowCredentialRepository(
          createTransactionOnlyPool(credentialPool),
        );
      const secondRepository =
        createPostgresExternalWorkflowCredentialRepository(
          createTransactionOnlyPool(credentialPool),
        );
      const readRepository =
        createPostgresExternalWorkflowCredentialRepository(credentialPool);
      await expect(
        firstRepository.create({
          credential: {
            id: CredentialId,
            name: CredentialName,
            scope: { kind: "all_workflows" },
            operations: [ExternalWorkflowOperation.WorkflowInvoke],
            createdAt: CredentialCreatedAt,
            rateLimitPerMinute: RateLimitPerMinute,
          },
          plaintext: CredentialSecret,
        }),
      ).resolves.toBe("created");

      const results = await Promise.all([
        firstRepository.consumeAuthorized({
          credentialId: CredentialId,
          plaintext: CredentialSecret,
          operation: ExternalWorkflowOperation.WorkflowInvoke,
          workflowId: WorkflowId,
          now: CredentialCreatedAt,
        }),
        secondRepository.consumeAuthorized({
          credentialId: CredentialId,
          plaintext: CredentialSecret,
          operation: ExternalWorkflowOperation.WorkflowInvoke,
          workflowId: WorkflowId,
          now: CredentialCreatedAt,
        }),
      ]);

      expect(results.sort()).toEqual(["authorized", "throttled"]);
      await expect(
        readRepository.listAudits({ credentialId: CredentialId }),
      ).resolves.toHaveLength(3);
    } finally {
      await administrator.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  });
});

const createTransactionOnlyPool = (pool: Pool) => ({
  connect: () => pool.connect(),
  query: async (): Promise<never> => {
    throw new Error(PoolQueryMustNotRunMessage);
  },
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
