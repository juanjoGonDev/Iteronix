import { describe, expect, it } from "vitest";
import { readDatabaseMigrationCatalog } from "./database-migration-catalog";

const CredentialMigrationIds = [
  "001_bootstrap_application_state",
  "002_external_workflow_credentials",
  "003_external_workflow_credential_audit_actors",
  "004_external_workflow_credential_anonymous_failure_bound",
];
const LegacyAuditActorColumns = ["actor_kind", "actor_id"];
const CredentialNameIndex = "external_workflow_credentials_name_ci_idx";

describe("database migration catalog", () => {
  it("keeps applied credential schema immutable and sequences audit attribution forward", () => {
    const migrations = readDatabaseMigrationCatalog();
    const credentialMigrations = migrations.filter((migration) =>
      CredentialMigrationIds.includes(migration.id),
    );

    expect(credentialMigrations.map((migration) => migration.id)).toEqual(
      CredentialMigrationIds,
    );
    expect(credentialMigrations[1]?.sql).not.toContain(
      LegacyAuditActorColumns[0],
    );
    expect(credentialMigrations[1]?.sql).not.toContain(
      LegacyAuditActorColumns[1],
    );
    expect(credentialMigrations[1]?.sql).toContain(CredentialNameIndex);
    expect(credentialMigrations[2]?.sql).toContain(
      "ALTER TABLE external_workflow_credential_audits",
    );
    expect(credentialMigrations[2]?.sql).toContain("DEFAULT 'system'");
    expect(credentialMigrations[2]?.sql).toContain("DEFAULT 'server-runtime'");
    expect(credentialMigrations[3]?.sql).toContain("failure_bucket");
    expect(credentialMigrations[3]?.sql).toContain(
      "external_workflow_credential_audits_anonymous_failure_bucket_idx",
    );
  });
});
