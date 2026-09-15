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

describe("PostgreSQL credential repository metadata and audit reads", () => {
  it("persists a created credential with its verifier and administrator audit in one transaction", async () => {
    const client = createClient();
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await expect(
      repository.create({
        credential: {
          id: CredentialId,
          name: "Automation",
          scope: {
            kind: "selected_workflows",
            workflowIds: [WorkflowId],
          },
          operations: [
            ExternalWorkflowOperation.WorkflowRead,
            ExternalWorkflowOperation.WorkflowInvoke,
          ],
          expiresAt: "2027-01-01T00:00:00.000Z",
          createdAt: Now,
          generation: 3,
          rateLimitPerMinute: 120,
        },
        plaintext: "itx_wf_secret",
        actor: { kind: "administrator", id: "admin-1" },
      }),
    ).resolves.toBe("created");

    const insert = client.queries.find((query) =>
      query.text.includes("INSERT INTO external_workflow_credentials"),
    );
    expect(insert?.values).toEqual([
      CredentialId,
      "Automation",
      "selected_workflows",
      JSON.stringify([WorkflowId]),
      JSON.stringify([
        ExternalWorkflowOperation.WorkflowRead,
        ExternalWorkflowOperation.WorkflowInvoke,
      ]),
      "2027-01-01T00:00:00.000Z",
      Now,
      3,
      120,
    ]);
    const audit = client.queries.find((query) =>
      query.text.includes("external_workflow_credential_audits"),
    );
    expect(audit?.values).toContain("administrator");
    expect(audit?.values).toContain("admin-1");
    expect(audit?.values).toContain("create");
    expect(audit?.text).not.toContain("secret");
    expect(JSON.stringify(audit?.values)).not.toContain("itx_wf_secret");
  });

  it("applies durable defaults when optional credential fields are omitted", async () => {
    const client = createClient();
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await expect(
      repository.create({
        credential: {
          id: CredentialId,
          name: "Defaults",
          scope: { kind: "all_workflows" },
          createdAt: Now,
        },
        plaintext: "itx_wf_secret",
      }),
    ).resolves.toBe("created");

    const insert = client.queries.find((query) =>
      query.text.includes("INSERT INTO external_workflow_credentials"),
    );
    expect(insert?.values).toEqual([
      CredentialId,
      "Defaults",
      "all_workflows",
      "[]",
      JSON.stringify(["workflow.read", "workflow.invoke"]),
      null,
      Now,
      1,
      60,
    ]);
    const audit = client.queries.find((query) =>
      query.text.includes("external_workflow_credential_audits"),
    );
    expect(audit?.values).toContain("system");
    expect(audit?.values).toContain("server-runtime");
  });

  it("checks case-insensitive name availability for administrators", async () => {
    const client = createClient();
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await expect(
      repository.isNameAvailable({ name: "Automation" }),
    ).resolves.toBe(false);
    const query = client.queries.find((entry) =>
      entry.text.includes("lower(name) = lower($1)"),
    );
    expect(query?.values).toEqual(["Automation"]);
  });

  it("reports an available name when the durable lookup finds no row", async () => {
    const emptyNameClient = {
      query: async () => ({ rows: [] }),
    };
    const repository =
      createPostgresExternalWorkflowCredentialRepository(emptyNameClient);

    await expect(repository.isNameAvailable({ name: "Free" })).resolves.toBe(
      true,
    );
  });

  it("maps durable credential rows to redacted metadata and drops malformed rows", async () => {
    const rows: ReadonlyArray<Record<string, unknown>> = [
      {
        id: "full",
        name: "Full",
        scope_kind: "selected_workflows",
        workflow_ids: [WorkflowId, 42],
        operations: ["workflow.invoke", "future.operation"],
        expires_at: new Date("2027-01-01T00:00:00.000Z"),
        revoked_at: new Date("2027-02-01T00:00:00.000Z"),
        created_at: "2026-07-28T00:00:00.000Z",
        last_used_at: new Date("2026-07-28T12:30:00.000Z"),
        generation: 2,
        rate_limit_per_minute: 120,
      },
      {
        id: "minimal",
        name: "Minimal",
        scope_kind: "all_workflows",
        workflow_ids: "not-an-array",
        operations: "not-an-array",
        expires_at: "not-a-date",
        created_at: new Date("2026-07-27T00:00:00.000Z"),
        rate_limit_per_minute: 700,
      },
      {
        id: "bad-scope",
        name: "Bad scope",
        scope_kind: "tenant",
        created_at: Now,
      },
      { id: "bad-created", name: "Bad created", scope_kind: "all_workflows" },
    ];
    const client = {
      query: async (text: string) => ({
        rows: text.includes("ORDER BY created_at DESC") ? rows : [],
      }),
    };
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    const credentials = await repository.list();

    expect(credentials).toHaveLength(2);
    expect(credentials[0]).toEqual({
      id: "full",
      name: "Full",
      scope: { kind: "selected_workflows", workflowIds: [WorkflowId] },
      createdAt: "2026-07-28T00:00:00.000Z",
      operations: ["workflow.invoke"],
      rateLimitPerMinute: 120,
      expiresAt: "2027-01-01T00:00:00.000Z",
      revokedAt: "2027-02-01T00:00:00.000Z",
      lastUsedAt: "2026-07-28T12:30:00.000Z",
      generation: 2,
    });
    expect(credentials[1]).toEqual({
      id: "minimal",
      name: "Minimal",
      scope: { kind: "all_workflows" },
      createdAt: "2026-07-27T00:00:00.000Z",
      operations: [],
      rateLimitPerMinute: 60,
    });
  });

  it("rejects non-string identifiers from the shared credential lookup", async () => {
    const client = {
      query: async () => ({ rows: [{ id: "full" }] }),
    };
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    expect(
      (await repository.listAudits({ credentialId: CredentialId })).length,
    ).toBe(0);
  });

  it("maps durable audit rows and drops events without redacted integrity", async () => {
    const rows: ReadonlyArray<Record<string, unknown>> = [
      {
        credential_id: CredentialId,
        event_kind: "rotate",
        operation: "workflow.invoke",
        workflow_id: WorkflowId,
        result: "authorized",
        actor_kind: "administrator",
        actor_id: "admin-1",
        occurred_at: new Date("2026-07-28T12:00:00.000Z"),
      },
      {
        credential_id: CredentialId,
        event_kind: "create",
        result: "authorized",
        actor_kind: "system",
        actor_id: "server-runtime",
        occurred_at: "2026-07-28T11:00:00.000Z",
      },
      {
        credential_id: CredentialId,
        event_kind: "authenticate",
        result: "unauthorized",
        actor_kind: "intruder",
        actor_id: "x",
        occurred_at: Now,
      },
      {
        credential_id: CredentialId,
        event_kind: "revoke",
        result: "authorized",
        actor_kind: 42,
        actor_id: "x",
        occurred_at: Now,
      },
      {
        credential_id: CredentialId,
        event_kind: "revoke",
        result: "authorized",
        actor_kind: "administrator",
        actor_id: "",
        occurred_at: Now,
      },
      {
        credential_id: CredentialId,
        event_kind: "revoke",
        result: "authorized",
        actor_kind: "administrator",
        actor_id: "admin-1",
        occurred_at: "not-a-date",
      },
    ];
    const queries: Query[] = [];
    const client = {
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        queries.push(values ? { text, values } : { text });
        return { rows: text.includes("ORDER BY occurred_at DESC") ? rows : [] };
      },
    };
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    const audits = await repository.listAudits({});

    expect(queries[0]?.values).toEqual([null]);
    expect(audits).toEqual([
      {
        credentialId: CredentialId,
        eventKind: "rotate",
        actorKind: "administrator",
        actorId: "admin-1",
        operation: "workflow.invoke",
        workflowId: WorkflowId,
        result: "authorized",
        occurredAt: "2026-07-28T12:00:00.000Z",
      },
      {
        credentialId: CredentialId,
        eventKind: "create",
        actorKind: "system",
        actorId: "server-runtime",
        result: "authorized",
        occurredAt: "2026-07-28T11:00:00.000Z",
      },
    ]);
  });

  it("forwards a credential filter to the durable audit lookup", async () => {
    const queries: Query[] = [];
    const client = {
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        queries.push(values ? { text, values } : { text });
        return { rows: [] };
      },
    };
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await repository.listAudits({ credentialId: CredentialId });

    expect(queries[0]?.values).toEqual([CredentialId]);
  });

  it("forbids an authenticated credential from undeclared operations", async () => {
    const client = createClient({
      credential: { operations: [ExternalWorkflowOperation.WorkflowRead] },
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
    ).resolves.toBe("forbidden");
    expect(
      client.queries.some((query) => query.values?.includes("forbidden")),
    ).toBe(true);
  });

  it("cannot consume a credential whose verifier row is missing or unreadable", async () => {
    const plaintext = "itx_wf_v1_credential-1_secret";
    for (const row of [{}, { verifier: 42 }]) {
      const client = {
        query: async (text: string) => {
          if (text.includes("FROM external_workflow_credentials")) {
            return {
              rows: [
                {
                  id: CredentialId,
                  operations: [ExternalWorkflowOperation.WorkflowRead],
                  scope_kind: "all_workflows",
                  workflow_ids: [],
                  rate_limit_per_minute: 60,
                },
              ],
            };
          }
          if (text.includes("SELECT verifier")) {
            return { rows: [row] };
          }
          return { rows: [] };
        },
      };
      const repository =
        createPostgresExternalWorkflowCredentialRepository(client);

      await expect(
        repository.consumeAuthorized({
          credentialId: CredentialId,
          plaintext,
          operation: ExternalWorkflowOperation.WorkflowRead,
          workflowId: WorkflowId,
          now: Now,
        }),
      ).resolves.toBe("unauthorized");
    }
  });

  it("reports missing or revoked credentials from lifecycle mutations", async () => {
    const queries: Query[] = [];
    const client = {
      queries,
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        queries.push(values ? { text, values } : { text });
        return { rows: [] };
      },
    };
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await expect(
      repository.rotate({
        credentialId: CredentialId,
        plaintext: "itx_wf_replacement",
        now: Now,
      }),
    ).resolves.toBe(false);
    await expect(
      repository.revoke({ credentialId: CredentialId, now: Now }),
    ).resolves.toBe(false);
    expect(
      client.queries.some((query) =>
        query.text.includes("external_workflow_credential_audits"),
      ),
    ).toBe(false);
  });

  it("imports a legacy all-workflows verifier when no workflow scope survives", async () => {
    const client = createClient();
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await repository.importLegacyVerifier({
      credentialId: CredentialId,
      name: "Legacy",
      secretHash: "scrypt$salt$verifier",
      workflowIds: [],
      now: Now,
    });

    const insert = client.queries.find((query) =>
      query.text.includes("INSERT INTO external_workflow_credentials"),
    );
    expect(insert?.values?.[2]).toBe("all_workflows");
    expect(insert?.values?.[3]).toBe("[]");
  });

  it("skips audits for durable revocation rows without readable identifiers", async () => {
    const client = {
      query: async (text: string) => {
        if (text.includes("UPDATE external_workflow_credentials")) {
          return { rows: [{ id: 42 }] };
        }
        return { rows: [] };
      },
    };
    const repository =
      createPostgresExternalWorkflowCredentialRepository(client);

    await expect(
      repository.revokeForWorkflow({ workflowId: WorkflowId, now: Now }),
    ).resolves.toBe(0);
  });

  it("replaces verifiers and imports legacy verifiers through the secret store", async () => {
    const queries: Query[] = [];
    const client = {
      query: async (text: string, values?: ReadonlyArray<unknown>) => {
        queries.push(values ? { text, values } : { text });
        return { rows: [] };
      },
    };
    const secretStore =
      createPostgresExternalWorkflowCredentialSecretStore(client);

    await secretStore.replace({
      credentialId: CredentialId,
      plaintext: "itx_wf_replacement",
    });
    await secretStore.importLegacyVerifier({
      credentialId: CredentialId,
      scryptHash: "scrypt$salt$verifier",
    });

    const replacement = queries.find((query) =>
      query.text.includes("DO UPDATE SET verifier = EXCLUDED.verifier"),
    );
    expect(replacement?.values?.[1]).not.toBe("itx_wf_replacement");
    expect(
      queries.some(
        (query) =>
          query.text.includes("ON CONFLICT (credential_id) DO NOTHING") &&
          query.values?.includes("scrypt$salt$verifier"),
      ),
    ).toBe(true);
  });

  it("rejects versioned plaintext when its verifier is unreadable or mismatched", async () => {
    const plaintext = "itx_wf_v1_credential-1_secret";
    const validHash = (await import("./external-api-keys")).hashExternalApiKey(
      "itx_wf_v1_credential-1_other",
    );
    for (const rows of [
      [] as ReadonlyArray<Record<string, unknown>>,
      [{ verifier: 42 }],
      [{ verifier: validHash }],
    ]) {
      const client = {
        query: async () => ({ rows }),
      };
      const secretStore =
        createPostgresExternalWorkflowCredentialSecretStore(client);

      await expect(secretStore.verify(plaintext)).resolves.toBeUndefined();
    }
  });
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
