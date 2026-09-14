import { describe, expect, it } from "vitest";
import { ExternalWorkflowOperation } from "../../../packages/domain/src/external-api-keys";
import {
  createPostgresExternalWorkflowCredentialRepository,
  createPostgresExternalWorkflowCredentialSecretStore,
} from "./postgres-external-workflow-credentials";

type Query = { text: string; values?: ReadonlyArray<unknown> };

const CredentialId = "credential-1";
const WorkflowId = "workflow-1";
const Now = "2026-07-28T12:00:00.000Z";

const createClient = (input?: {
  rateWindowRows?: ReadonlyArray<Record<string, unknown>>;
  credential?: Record<string, unknown>;
}) => {
  const queries: Query[] = [];
  return {
    queries,
    query: async (text: string, values?: ReadonlyArray<unknown>) => {
      queries.push(values ? { text, values } : { text });
      if (text.includes("FROM external_workflow_credentials")) {
        return {
          rows: [
            {
              id: CredentialId,
              operations: [ExternalWorkflowOperation.WorkflowInvoke],
              scope_kind: "all_workflows",
              workflow_ids: [],
              rate_limit_per_minute: 60,
              ...input?.credential,
            },
          ],
        };
      }
      if (text.includes("credential_rate_windows")) {
        return { rows: input?.rateWindowRows ?? [{ request_count: 60 }] };
      }
      if (text.includes("RETURNING id")) {
        return { rows: [{ id: CredentialId }] };
      }
      return { rows: [] };
    },
  };
};

describe("PostgreSQL external workflow credentials", () => {
  it("uses a transaction and row-locked counter for the sixtieth shared request", async () => {
    const client = createClient();
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    const result = await repository.consumeAuthorized({
      credentialId: CredentialId,
      operation: ExternalWorkflowOperation.WorkflowInvoke,
      workflowId: WorkflowId,
      now: Now,
    });

    expect(result).toBe("authorized");
    expect(client.queries.map((query) => query.text)).toContain("BEGIN");
    expect(
      client.queries.some((query) => query.text.includes("FOR UPDATE")),
    ).toBe(true);
    expect(
      client.queries.some((query) =>
        query.text.includes("credential_rate_windows"),
      ),
    ).toBe(true);
    expect(client.queries.map((query) => query.text)).toContain("COMMIT");
  });

  it("rejects the sixty-first shared request without updating last use", async () => {
    const client = createClient({ rateWindowRows: [] });
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await expect(
      repository.consumeAuthorized({
        credentialId: CredentialId,
        operation: ExternalWorkflowOperation.WorkflowInvoke,
        workflowId: WorkflowId,
        now: Now,
      }),
    ).resolves.toBe("throttled");

    expect(
      client.queries.some((query) => query.text.includes("last_used_at")),
    ).toBe(false);
    expect(
      client.queries.some((query) => query.values?.includes("throttled")),
    ).toBe(true);
  });

  it("treats a node-postgres TIMESTAMPTZ Date as an expired credential", async () => {
    const client = createClient({
      credential: { expires_at: new Date("2026-07-28T11:59:59.000Z") },
    });
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await expect(
      repository.consumeAuthorized({
        credentialId: CredentialId,
        operation: ExternalWorkflowOperation.WorkflowInvoke,
        workflowId: WorkflowId,
        now: Now,
      }),
    ).resolves.toBe("unauthorized");
  });

  it("returns unauthorized for invalid credentials and forbidden for valid scope denials", async () => {
    const revokedClient = createClient({
      credential: { revoked_at: new Date("2026-07-28T11:00:00.000Z") },
    });
    const scopeClient = createClient({
      credential: {
        scope_kind: "selected_workflows",
        workflow_ids: ["workflow-2"],
      },
    });

    await expect(
      createPostgresExternalWorkflowCredentialRepository(
        revokedClient,
      ).consumeAuthorized({
        credentialId: CredentialId,
        operation: ExternalWorkflowOperation.WorkflowInvoke,
        workflowId: WorkflowId,
        now: Now,
      }),
    ).resolves.toBe("unauthorized");
    await expect(
      createPostgresExternalWorkflowCredentialRepository(
        scopeClient,
      ).consumeAuthorized({
        credentialId: CredentialId,
        operation: ExternalWorkflowOperation.WorkflowInvoke,
        workflowId: WorkflowId,
        now: Now,
      }),
    ).resolves.toBe("forbidden");
  });

  it("rotates a verifier and revokes a credential atomically with redacted audits", async () => {
    const client = createClient();
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await expect(
      repository.rotate({
        credentialId: CredentialId,
        plaintext: "itx_wf_replacement",
        now: Now,
        actor: { kind: "administrator", id: "admin-1" },
      }),
    ).resolves.toBe(true);
    await expect(
      repository.revoke({
        credentialId: CredentialId,
        now: Now,
        actor: { kind: "administrator", id: "admin-1" },
      }),
    ).resolves.toBe(true);

    expect(
      client.queries.filter((query) => query.text === "BEGIN"),
    ).toHaveLength(2);
    expect(
      client.queries.some((query) =>
        query.text.includes("generation = generation + 1"),
      ),
    ).toBe(true);
    expect(
      client.queries.some((query) =>
        query.text.includes("revoked_at = $2::timestamptz"),
      ),
    ).toBe(true);
    expect(
      client.queries.filter((query) =>
        query.text.includes("external_workflow_credential_audits"),
      ),
    ).toHaveLength(2);
    expect(
      client.queries
        .filter((query) =>
          query.text.includes("external_workflow_credential_audits"),
        )
        .every(
          (query) =>
            query.text.includes("actor_kind") &&
            query.text.includes("actor_id") &&
            query.values?.includes("administrator") &&
            query.values?.includes("admin-1"),
        ),
    ).toBe(true);
  });

  it("revokes selected-workflow credentials durably with audit evidence", async () => {
    const queries: Array<{ text: string; values: ReadonlyArray<unknown> }> = [];
    const client = {
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        queries.push({ text, values: values ?? [] });
        if (text.includes("UPDATE external_workflow_credentials")) {
          return { rows: [{ id: CredentialId }] };
        }
        return { rows: [] };
      },
    };
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await expect(
      repository.revokeForWorkflow({ workflowId: WorkflowId, now: Now }),
    ).resolves.toBe(1);

    expect(
      queries.some(
        (query) =>
          query.text.includes("UPDATE external_workflow_credentials") &&
          query.values.includes(WorkflowId),
      ),
    ).toBe(true);
    expect(
      queries.some(
        (query) =>
          query.text.includes("external_workflow_credential_audits") &&
          query.values.includes(CredentialId) &&
          query.values.includes(WorkflowId),
      ),
    ).toBe(true);
  });

  it("imports a legacy verifier idempotently and purges only expired audits", async () => {
    const client = createClient();
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await repository.importLegacyVerifier({
      credentialId: CredentialId,
      name: "Legacy",
      secretHash: "scrypt$salt$verifier",
      workflowIds: [WorkflowId],
      now: Now,
    });
    await repository.purgeAudits({ now: Now });

    expect(
      client.queries.some((query) =>
        query.text.includes("ON CONFLICT (id) DO NOTHING"),
      ),
    ).toBe(true);
    expect(
      client.queries.some((query) =>
        query.text.includes("ON CONFLICT (credential_id) DO NOTHING"),
      ),
    ).toBe(true);
    expect(
      client.queries.some((query) =>
        query.text.includes("INTERVAL '365 days'"),
      ),
    ).toBe(true);
  });

  it("verifies versioned credentials through one credential-scoped verifier query", async () => {
    const plaintext = "itx_wf_v1_credential-1_secret";
    const verifier = (await import("./external-api-keys")).hashExternalApiKey(
      plaintext,
    );
    const queries: Query[] = [];
    const client = {
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        queries.push(values ? { text, values } : { text });
        if (text.includes("WHERE credential_id = $1")) {
          return { rows: [{ verifier }] };
        }
        throw new Error("Verifier lookup must be credential-scoped.");
      },
    };
    const secretStore =
      createPostgresExternalWorkflowCredentialSecretStore(client);

    await expect(secretStore.verify(plaintext)).resolves.toEqual({
      credentialId: CredentialId,
    });
    expect(
      queries.some((query) =>
        query.text.includes("SELECT credential_id, verifier"),
      ),
    ).toBe(false);
    expect(queries[0]?.values).toEqual([CredentialId]);
  });

  it("deduplicates anonymous authentication audit writes by minute", async () => {
    const client = createClient();
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await repository.recordAuthenticationFailure({
      operation: ExternalWorkflowOperation.WorkflowInvoke,
      workflowId: WorkflowId,
      now: Now,
    });

    const audit = client.queries.find((query) =>
      query.text.includes("external_workflow_credential_audits"),
    );
    expect(audit?.text).toContain("failure_bucket");
    expect(audit?.text).toContain("ON CONFLICT DO NOTHING");
    expect(audit?.text).toContain("date_trunc('minute'");
  });

  it("bounds legacy verifier scans inside each verification window", async () => {
    const queries: Query[] = [];
    const client = {
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        queries.push(values ? { text, values } : { text });
        return { rows: [] };
      },
    };
    const secretStore =
      createPostgresExternalWorkflowCredentialSecretStore(client);

    await Promise.all(
      Array.from({ length: 5 }, () => secretStore.verify("itx_wf_legacy")),
    );

    expect(
      queries.filter((query) =>
        query.text.includes("SELECT credential_id, verifier"),
      ),
    ).toHaveLength(4);
  });

  it("keeps scrypt verifiers server-side when imported and rejects mismatched plaintext", async () => {
    const client = {
      query: async (text: string) => ({
        rows: text.includes("external_workflow_credential_verifiers")
          ? [
              {
                credential_id: CredentialId,
                verifier: "scrypt$invalid$verifier",
              },
            ]
          : [],
      }),
    };
    const secretStore =
      createPostgresExternalWorkflowCredentialSecretStore(client);

    await expect(secretStore.verify("not-the-secret")).resolves.toBeUndefined();
  });

  it("stores generated plaintext only as a verifier and can verify it later", async () => {
    let storedVerifier = "";
    const client = {
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        if (text.includes("external_workflow_credential_verifiers") && values) {
          storedVerifier = typeof values[1] === "string" ? values[1] : "";
          return { rows: [] };
        }
        return {
          rows: [{ credential_id: CredentialId, verifier: storedVerifier }],
        };
      },
    };
    const plaintext = "itx_wf_secret";
    const secretStore =
      createPostgresExternalWorkflowCredentialSecretStore(client);

    await secretStore.put({ credentialId: CredentialId, plaintext });

    expect(storedVerifier).not.toBe(plaintext);
    await expect(secretStore.verify(plaintext)).resolves.toEqual({
      credentialId: CredentialId,
    });
  });
});

it("uses one checked-out client for lifecycle transactions and releases it", async () => {
  const transaction = createClient();
  let released = false;
  const pool = {
    connect: async () => ({
      ...transaction,
      release: () => {
        released = true;
      },
    }),
    query: async () => {
      throw new Error("transaction must not use pool.query");
    },
  };
  const repository = createPostgresExternalWorkflowCredentialRepository(pool);

  await expect(
    repository.revoke({ credentialId: CredentialId, now: Now }),
  ).resolves.toBe(true);

  expect(released).toBe(true);
});

it("rolls back credential creation when verifier persistence fails", async () => {
  const client = {
    query: async (text: string) => {
      if (text.includes("external_workflow_credential_verifiers")) {
        throw new Error("verifier unavailable");
      }
      return { rows: [] };
    },
  };
  const repository = createPostgresExternalWorkflowCredentialRepository(client);

  await expect(
    repository.create({
      credential: {
        id: CredentialId,
        name: "Automation",
        scope: { kind: "all_workflows" },
        operations: [ExternalWorkflowOperation.WorkflowInvoke],
        createdAt: Now,
        rateLimitPerMinute: 60,
      },
      plaintext: "itx_wf_secret",
    }),
  ).rejects.toThrow("verifier unavailable");
});

it("maps case-insensitive database name conflicts without persisting a verifier", async () => {
  const client = {
    query: async (text: string) => {
      if (text.includes("INSERT INTO external_workflow_credentials")) {
        const error = Object.assign(new Error("duplicate"), { code: "23505" });
        throw error;
      }
      return { rows: [] };
    },
  };
  const repository = createPostgresExternalWorkflowCredentialRepository(client);

  await expect(
    repository.create({
      credential: {
        id: CredentialId,
        name: "automation",
        scope: { kind: "all_workflows" },
        operations: [ExternalWorkflowOperation.WorkflowInvoke],
        createdAt: Now,
        rateLimitPerMinute: 60,
      },
      plaintext: "itx_wf_secret",
    }),
  ).resolves.toBe("duplicate");
});

it("rejects a secret verified before rotation when the locked verifier generation changed", async () => {
  const replacementSecret = "itx_wf_replacement";
  const replacementHash = (
    await import("./external-api-keys")
  ).hashExternalApiKey(replacementSecret);
  const queries: Query[] = [];
  const client = {
    query: async (text: string, values?: ReadonlyArray<unknown>) => {
      queries.push(values ? { text, values } : { text });
      if (text.includes("FROM external_workflow_credentials")) {
        return {
          rows: [
            {
              id: CredentialId,
              operations: [ExternalWorkflowOperation.WorkflowInvoke],
              scope_kind: "all_workflows",
              workflow_ids: [],
              rate_limit_per_minute: 60,
            },
          ],
        };
      }
      if (text.includes("SELECT verifier")) {
        return { rows: [{ verifier: replacementHash }] };
      }
      return { rows: [] };
    },
  };
  const repository = createPostgresExternalWorkflowCredentialRepository(client);

  await expect(
    repository.consumeAuthorized({
      credentialId: CredentialId,
      plaintext: "itx_wf_old_secret",
      operation: ExternalWorkflowOperation.WorkflowInvoke,
      workflowId: WorkflowId,
      now: Now,
    }),
  ).resolves.toBe("unauthorized");

  expect(
    queries.some((query) => query.text.includes("WHERE credential_id = $1")),
  ).toBe(true);
});
