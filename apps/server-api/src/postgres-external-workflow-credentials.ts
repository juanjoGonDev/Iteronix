import {
  hashExternalApiKey,
  readExternalApiKeyCredentialId,
  verifyExternalApiKeyAsync,
} from "./external-api-keys";
import {
  ExternalApiKeyScopeKind,
  ExternalWorkflowOperation,
  ExternalWorkflowRateLimit,
  type ExternalApiKeyScope,
  type ExternalApiKeyView,
  type ExternalWorkflowOperation as ExternalWorkflowOperationValue,
} from "../../../packages/domain/src/external-api-keys";

export type PostgresExternalWorkflowCredentialClient = {
  query: (
    text: string,
    values?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: ReadonlyArray<Record<string, unknown>> }>;
};

type PostgresExternalWorkflowCredentialTransactionClient =
  PostgresExternalWorkflowCredentialClient & {
    release: () => void;
  };

type PostgresExternalWorkflowCredentialPool =
  PostgresExternalWorkflowCredentialClient & {
    connect?: () => Promise<PostgresExternalWorkflowCredentialTransactionClient>;
  };

export type ExternalCredentialConsumeInput = {
  credentialId: string;
  plaintext?: string;
  operation: ExternalWorkflowOperationValue;
  workflowId: string;
  now: string;
};

export type ExternalWorkflowCredentialMetadata = ExternalApiKeyView;

export type ExternalWorkflowCredentialAudit = {
  credentialId: string;
  eventKind: string;
  actorKind: ExternalWorkflowCredentialAuditActorKind;
  actorId: string;
  operation?: ExternalWorkflowOperationValue;
  workflowId?: string;
  result: string;
  occurredAt: string;
};

export const ExternalWorkflowCredentialAuditActorKind = {
  Administrator: "administrator",
  Credential: "credential",
  Anonymous: "anonymous",
  System: "system",
} as const;

export type ExternalWorkflowCredentialAuditActorKind =
  (typeof ExternalWorkflowCredentialAuditActorKind)[keyof typeof ExternalWorkflowCredentialAuditActorKind];

export type ExternalWorkflowCredentialAuditActor = {
  kind: ExternalWorkflowCredentialAuditActorKind;
  id: string;
};

export type ExternalWorkflowCredentialSecretStore = {
  put: (input: { credentialId: string; plaintext: string }) => Promise<void>;
  verify: (plaintext: string) => Promise<{ credentialId: string } | undefined>;
  replace: (input: {
    credentialId: string;
    plaintext: string;
  }) => Promise<void>;
  importLegacyVerifier: (input: {
    credentialId: string;
    scryptHash: string;
  }) => Promise<void>;
};

export type PostgresExternalWorkflowCredentialRepository = {
  create: (input: {
    credential: ExternalWorkflowCredentialMetadata;
    plaintext: string;
    actor?: ExternalWorkflowCredentialAuditActor;
  }) => Promise<"created" | "duplicate">;
  isNameAvailable: (input: { name: string }) => Promise<boolean>;
  list: () => Promise<ReadonlyArray<ExternalWorkflowCredentialMetadata>>;
  listAudits: (input: {
    credentialId?: string;
  }) => Promise<ReadonlyArray<ExternalWorkflowCredentialAudit>>;
  consumeAuthorized: (
    input: ExternalCredentialConsumeInput,
  ) => Promise<"authorized" | "unauthorized" | "forbidden" | "throttled">;
  rotate: (input: {
    credentialId: string;
    plaintext: string;
    now: string;
    actor?: ExternalWorkflowCredentialAuditActor;
  }) => Promise<boolean>;
  revoke: (input: {
    credentialId: string;
    now: string;
    actor?: ExternalWorkflowCredentialAuditActor;
  }) => Promise<boolean>;
  revokeForWorkflow: (input: {
    workflowId: string;
    now: string;
    actor?: ExternalWorkflowCredentialAuditActor;
  }) => Promise<number>;
  importLegacyVerifier: (input: {
    credentialId: string;
    name: string;
    secretHash: string;
    workflowIds: ReadonlyArray<string>;
    now: string;
  }) => Promise<void>;
  purgeAudits: (input: { now: string }) => Promise<void>;
  recordAuthenticationFailure: (input: {
    operation: ExternalWorkflowOperationValue;
    workflowId: string;
    now: string;
  }) => Promise<void>;
};

const BeginSql = "BEGIN";
const CommitSql = "COMMIT";
const RollbackSql = "ROLLBACK";
const DefaultOperations = [
  ExternalWorkflowOperation.WorkflowRead,
  ExternalWorkflowOperation.WorkflowInvoke,
] as const;
const AnonymousCredentialAuditId = "unknown";
const DefaultCredentialAuditActorId = "server-runtime";
const LegacyVerificationWindowMilliseconds = 60_000;
const LegacyVerificationAttemptsPerWindow = 4;
const AuditEventKind = {
  Create: "create",
  Authenticate: "authenticate",
  Authorize: "authorize",
  RateLimit: "rate_limit",
  Rotate: "rotate",
  Revoke: "revoke",
  Migrate: "migrate",
} as const;
type AuditEventKind = (typeof AuditEventKind)[keyof typeof AuditEventKind];
const LockCredentialSql = `
  SELECT id, revoked_at, expires_at, operations, scope_kind, workflow_ids, rate_limit_per_minute, generation
  FROM external_workflow_credentials
  WHERE id = $1
  FOR UPDATE
`;
const ConsumeRateLimitSql = `
  INSERT INTO external_workflow_credential_rate_windows (credential_id, window_started_at, request_count)
  VALUES ($1, date_trunc('minute', $2::timestamptz), 1)
  ON CONFLICT (credential_id, window_started_at)
  DO UPDATE SET request_count = external_workflow_credential_rate_windows.request_count + 1
  WHERE external_workflow_credential_rate_windows.request_count < $3
  RETURNING request_count
`;
const UpdateLastUseSql = `
  UPDATE external_workflow_credentials SET last_used_at = $2::timestamptz WHERE id = $1
`;
const AppendAuditSql = `
  INSERT INTO external_workflow_credential_audits (
    credential_id, event_kind, operation, workflow_id, result, actor_kind, actor_id, occurred_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
`;
const AppendAnonymousAuthenticationFailureSql = `
  INSERT INTO external_workflow_credential_audits (
    credential_id, event_kind, operation, workflow_id, result, actor_kind, actor_id, occurred_at, failure_bucket
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, date_trunc('minute', $8::timestamptz))
  ON CONFLICT DO NOTHING
`;
const RotateCredentialSql = `
  UPDATE external_workflow_credentials
  SET generation = generation + 1, revoked_at = NULL
  WHERE id = $1 AND revoked_at IS NULL
  RETURNING id
`;
const RevokeCredentialSql = `
  UPDATE external_workflow_credentials
  SET revoked_at = $2::timestamptz
  WHERE id = $1 AND revoked_at IS NULL
  RETURNING id
`;
const RevokeWorkflowCredentialsSql = `
  UPDATE external_workflow_credentials
  SET revoked_at = $2::timestamptz
  WHERE scope_kind = $3
    AND workflow_ids @> jsonb_build_array($1::text)
    AND revoked_at IS NULL
  RETURNING id
`;
const PutVerifierSql = `
  INSERT INTO external_workflow_credential_verifiers (credential_id, verifier)
  VALUES ($1, $2)
  ON CONFLICT (credential_id) DO UPDATE SET verifier = EXCLUDED.verifier, created_at = NOW()
`;
const ImportCredentialSql = `
  INSERT INTO external_workflow_credentials (
    id, name, scope_kind, workflow_ids, operations, created_at, rate_limit_per_minute
  ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::timestamptz, $7)
  ON CONFLICT (id) DO NOTHING
`;
const CreateCredentialSql = `
  INSERT INTO external_workflow_credentials (
    id, name, scope_kind, workflow_ids, operations, expires_at, created_at, generation, rate_limit_per_minute
  ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::timestamptz, $7::timestamptz, $8, $9)
`;
const FindCredentialNameSql = `
  SELECT id
  FROM external_workflow_credentials
  WHERE lower(name) = lower($1)
  LIMIT 1
`;
const ListCredentialsSql = `
  SELECT id, name, scope_kind, workflow_ids, operations, expires_at, revoked_at, created_at, last_used_at, generation, rate_limit_per_minute
  FROM external_workflow_credentials
  ORDER BY created_at DESC
`;
const ListAuditsSql = `
  SELECT credential_id, event_kind, operation, workflow_id, result, actor_kind, actor_id, occurred_at
  FROM external_workflow_credential_audits
  WHERE ($1::text IS NULL OR credential_id = $1)
  ORDER BY occurred_at DESC
`;
const ImportVerifierSql = `
  INSERT INTO external_workflow_credential_verifiers (credential_id, verifier)
  VALUES ($1, $2)
  ON CONFLICT (credential_id) DO NOTHING
`;
const SelectVerifiersSql = `
  SELECT credential_id, verifier
  FROM external_workflow_credential_verifiers
`;
const SelectCredentialVerifierSql = `
  SELECT verifier
  FROM external_workflow_credential_verifiers
  WHERE credential_id = $1
`;
const PurgeAuditsSql = `
  DELETE FROM external_workflow_credential_audits
  WHERE occurred_at < $1::timestamptz - INTERVAL '365 days'
`;

export const createPostgresExternalWorkflowCredentialRepository = (
  client: PostgresExternalWorkflowCredentialPool,
): PostgresExternalWorkflowCredentialRepository => ({
  create: async (input) => createCredential(client, input),
  isNameAvailable: async (input) => isCredentialNameAvailable(client, input),
  list: async () => listCredentials(client),
  listAudits: async (input) => listAudits(client, input),
  consumeAuthorized: async (input) => consumeAuthorized(client, input),
  rotate: async (input) => rotateCredential(client, input),
  revoke: async (input) => revokeCredential(client, input),
  revokeForWorkflow: async (input) => revokeWorkflowCredentials(client, input),
  importLegacyVerifier: async (input) => importLegacyVerifier(client, input),
  purgeAudits: async (input) => purgeAudits(client, input),
  recordAuthenticationFailure: async (input) =>
    recordAuthenticationFailure(client, input),
});

const createCredential = async (
  client: PostgresExternalWorkflowCredentialPool,
  input: {
    credential: ExternalWorkflowCredentialMetadata;
    plaintext: string;
    actor?: ExternalWorkflowCredentialAuditActor;
  },
): Promise<"created" | "duplicate"> => {
  try {
    await withTransaction(client, async (transaction) => {
      const credential = input.credential;
      await transaction.query(CreateCredentialSql, [
        credential.id,
        credential.name,
        credential.scope.kind,
        JSON.stringify(
          credential.scope.kind === ExternalApiKeyScopeKind.SelectedWorkflows
            ? credential.scope.workflowIds
            : [],
        ),
        JSON.stringify(credential.operations ?? DefaultOperations),
        credential.expiresAt ?? null,
        credential.createdAt,
        credential.generation ?? 1,
        credential.rateLimitPerMinute ??
          ExternalWorkflowRateLimit.DefaultPerMinute,
      ]);
      await putNewVerifier(transaction, {
        credentialId: credential.id,
        plaintext: input.plaintext,
      });
      await appendAudit(
        transaction,
        {
          credentialId: credential.id,
          now: credential.createdAt,
          ...(input.actor ? { actor: input.actor } : {}),
        },
        AuditEventKind.Create,
        "authorized",
      );
    });
    return "created";
  } catch (error) {
    if (isDuplicateCredentialNameError(error)) return "duplicate";
    throw error;
  }
};
const isCredentialNameAvailable = async (
  client: PostgresExternalWorkflowCredentialClient,
  input: { name: string },
): Promise<boolean> => {
  const result = await client.query(FindCredentialNameSql, [input.name]);
  return result.rows.length === 0;
};

const listCredentials = async (
  client: PostgresExternalWorkflowCredentialClient,
): Promise<ReadonlyArray<ExternalWorkflowCredentialMetadata>> => {
  const result = await client.query(ListCredentialsSql);
  return result.rows.flatMap(toCredentialMetadata);
};

const listAudits = async (
  client: PostgresExternalWorkflowCredentialClient,
  input: { credentialId?: string },
): Promise<ReadonlyArray<ExternalWorkflowCredentialAudit>> => {
  const result = await client.query(ListAuditsSql, [
    input.credentialId ?? null,
  ]);
  return result.rows.flatMap(toCredentialAudit);
};

export const createPostgresExternalWorkflowCredentialSecretStore = (
  client: PostgresExternalWorkflowCredentialClient,
): ExternalWorkflowCredentialSecretStore => {
  const canVerifyLegacy = createLegacyVerificationBudget();
  return {
    put: async (input) => putNewVerifier(client, input),
    verify: async (plaintext) =>
      verifyVerifier(client, plaintext, canVerifyLegacy),
    replace: async (input) => putNewVerifier(client, input),
    importLegacyVerifier: async (input) =>
      importVerifier(client, input.credentialId, input.scryptHash),
  };
};

const consumeAuthorized = async (
  client: PostgresExternalWorkflowCredentialPool,
  input: ExternalCredentialConsumeInput,
): Promise<"authorized" | "unauthorized" | "forbidden" | "throttled"> =>
  withTransaction(client, async (transaction) => {
    const credential = await transaction.query(LockCredentialSql, [
      input.credentialId,
    ]);
    const record = credential.rows[0];
    if (!record || !(await isVerifiedCredential(transaction, input))) {
      await appendAudit(
        transaction,
        { ...input, actor: credentialAuditActor(input.credentialId) },
        AuditEventKind.Authenticate,
        "unauthorized",
      );
      return "unauthorized";
    }
    if (!isActiveCredential(record, input.now)) {
      await appendAudit(
        transaction,
        { ...input, actor: credentialAuditActor(input.credentialId) },
        AuditEventKind.Authenticate,
        "unauthorized",
      );
      return "unauthorized";
    }
    if (!isAllowed(record, input)) {
      await appendAudit(
        transaction,
        { ...input, actor: credentialAuditActor(input.credentialId) },
        AuditEventKind.Authorize,
        "forbidden",
      );
      return "forbidden";
    }
    const limit = readRateLimit(record["rate_limit_per_minute"]);
    const consumed = await transaction.query(ConsumeRateLimitSql, [
      input.credentialId,
      input.now,
      limit,
    ]);
    if (!consumed.rows[0]) {
      await appendAudit(
        transaction,
        { ...input, actor: credentialAuditActor(input.credentialId) },
        AuditEventKind.RateLimit,
        "throttled",
      );
      return "throttled";
    }
    await transaction.query(UpdateLastUseSql, [input.credentialId, input.now]);
    await appendAudit(
      transaction,
      { ...input, actor: credentialAuditActor(input.credentialId) },
      AuditEventKind.Authenticate,
      "authorized",
    );
    return "authorized";
  });
const rotateCredential = async (
  client: PostgresExternalWorkflowCredentialPool,
  input: {
    credentialId: string;
    plaintext: string;
    now: string;
    actor?: ExternalWorkflowCredentialAuditActor;
  },
): Promise<boolean> =>
  withTransaction(client, async (transaction) => {
    await transaction.query(LockCredentialSql, [input.credentialId]);
    const rotated = await transaction.query(RotateCredentialSql, [
      input.credentialId,
    ]);
    if (!rotated.rows[0]) return false;
    await putNewVerifier(transaction, input);
    await appendAudit(transaction, input, AuditEventKind.Rotate, "authorized");
    return true;
  });
const revokeCredential = async (
  client: PostgresExternalWorkflowCredentialPool,
  input: {
    credentialId: string;
    now: string;
    actor?: ExternalWorkflowCredentialAuditActor;
  },
): Promise<boolean> =>
  withTransaction(client, async (transaction) => {
    await transaction.query(LockCredentialSql, [input.credentialId]);
    const revoked = await transaction.query(RevokeCredentialSql, [
      input.credentialId,
      input.now,
    ]);
    if (!revoked.rows[0]) return false;
    await appendAudit(transaction, input, AuditEventKind.Revoke, "authorized");
    return true;
  });
const revokeWorkflowCredentials = async (
  client: PostgresExternalWorkflowCredentialPool,
  input: {
    workflowId: string;
    now: string;
    actor?: ExternalWorkflowCredentialAuditActor;
  },
): Promise<number> =>
  withTransaction(client, async (transaction) => {
    const revoked = await transaction.query(RevokeWorkflowCredentialsSql, [
      input.workflowId,
      input.now,
      ExternalApiKeyScopeKind.SelectedWorkflows,
    ]);
    const credentialIds = revoked.rows.flatMap(readCredentialId);
    for (const credentialId of credentialIds) {
      await appendAudit(
        transaction,
        { ...input, credentialId },
        AuditEventKind.Revoke,
        "authorized",
      );
    }
    return credentialIds.length;
  });
const importLegacyVerifier = async (
  client: PostgresExternalWorkflowCredentialPool,
  input: {
    credentialId: string;
    name: string;
    secretHash: string;
    workflowIds: ReadonlyArray<string>;
    now: string;
  },
): Promise<void> =>
  withTransaction(client, async (transaction) => {
    const scopeKind =
      input.workflowIds.length === 0
        ? ExternalApiKeyScopeKind.AllWorkflows
        : ExternalApiKeyScopeKind.SelectedWorkflows;
    await transaction.query(ImportCredentialSql, [
      input.credentialId,
      input.name,
      scopeKind,
      JSON.stringify(input.workflowIds),
      JSON.stringify(DefaultOperations),
      input.now,
      ExternalWorkflowRateLimit.DefaultPerMinute,
    ]);
    await importVerifier(transaction, input.credentialId, input.secretHash);
    await appendAudit(
      transaction,
      {
        ...input,
        actor: {
          kind: ExternalWorkflowCredentialAuditActorKind.System,
          id: DefaultCredentialAuditActorId,
        },
      },
      AuditEventKind.Migrate,
      "authorized",
    );
  });
const recordAuthenticationFailure = async (
  client: PostgresExternalWorkflowCredentialPool,
  input: {
    operation: ExternalWorkflowOperationValue;
    workflowId: string;
    now: string;
  },
): Promise<void> =>
  withTransaction(client, async (transaction) => {
    await transaction.query(AppendAnonymousAuthenticationFailureSql, [
      AnonymousCredentialAuditId,
      AuditEventKind.Authenticate,
      input.operation,
      input.workflowId,
      "unauthorized",
      ExternalWorkflowCredentialAuditActorKind.Anonymous,
      AnonymousCredentialAuditId,
      input.now,
    ]);
  });

const withTransaction = async <TValue>(
  client: PostgresExternalWorkflowCredentialPool,
  action: (
    transaction: PostgresExternalWorkflowCredentialClient,
  ) => Promise<TValue>,
): Promise<TValue> => {
  const transaction = client.connect ? await client.connect() : client;
  try {
    await transaction.query(BeginSql);
    const value = await action(transaction);
    await transaction.query(CommitSql);
    return value;
  } catch (error) {
    await transaction.query(RollbackSql);
    throw error;
  } finally {
    if ("release" in transaction && typeof transaction.release === "function") {
      transaction.release();
    }
  }
};

const isVerifiedCredential = async (
  transaction: PostgresExternalWorkflowCredentialClient,
  input: ExternalCredentialConsumeInput,
): Promise<boolean> => {
  if (!input.plaintext) return true;
  const result = await transaction.query(SelectCredentialVerifierSql, [
    input.credentialId,
  ]);
  const verifier = result.rows[0]?.["verifier"];
  return (
    typeof verifier === "string" &&
    (await verifyExternalApiKeyAsync(input.plaintext, verifier))
  );
};

const readCredentialId = (record: Record<string, unknown>): string[] =>
  typeof record["id"] === "string" ? [record["id"]] : [];

const isDuplicateCredentialNameError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "23505";

const purgeAudits = async (
  client: PostgresExternalWorkflowCredentialClient,
  input: { now: string },
): Promise<void> => {
  await client.query(PurgeAuditsSql, [input.now]);
};

const putNewVerifier = async (
  client: PostgresExternalWorkflowCredentialClient,
  input: { credentialId: string; plaintext: string },
): Promise<void> => {
  await client.query(PutVerifierSql, [
    input.credentialId,
    hashExternalApiKey(input.plaintext),
  ]);
};

const importVerifier = async (
  client: PostgresExternalWorkflowCredentialClient,
  credentialId: string,
  verifier: string,
): Promise<void> => {
  await client.query(ImportVerifierSql, [credentialId, verifier]);
};

const verifyVerifier = async (
  client: PostgresExternalWorkflowCredentialClient,
  plaintext: string,
  canVerifyLegacy: () => boolean,
): Promise<{ credentialId: string } | undefined> => {
  const credentialId = readExternalApiKeyCredentialId(plaintext);
  if (credentialId) {
    return verifyCredentialVerifier(client, plaintext, credentialId);
  }
  if (!canVerifyLegacy()) {
    return undefined;
  }
  return verifyLegacyVerifier(client, plaintext);
};

const verifyCredentialVerifier = async (
  client: PostgresExternalWorkflowCredentialClient,
  plaintext: string,
  credentialId: string,
): Promise<{ credentialId: string } | undefined> => {
  const result = await client.query(SelectCredentialVerifierSql, [
    credentialId,
  ]);
  const verifier = result.rows[0]?.["verifier"];
  return typeof verifier === "string" &&
    (await verifyExternalApiKeyAsync(plaintext, verifier))
    ? { credentialId }
    : undefined;
};

const verifyLegacyVerifier = async (
  client: PostgresExternalWorkflowCredentialClient,
  plaintext: string,
): Promise<{ credentialId: string } | undefined> => {
  const result = await client.query(SelectVerifiersSql);
  for (const row of result.rows) {
    const verifier = row["verifier"];
    const credentialId = row["credential_id"];
    if (
      typeof verifier === "string" &&
      typeof credentialId === "string" &&
      (await verifyExternalApiKeyAsync(plaintext, verifier))
    ) {
      return { credentialId };
    }
  }
  return undefined;
};

const createLegacyVerificationBudget = (): (() => boolean) => {
  let windowStartedAt = 0;
  let attempts = 0;
  return () => {
    const now = Date.now();
    if (now - windowStartedAt >= LegacyVerificationWindowMilliseconds) {
      windowStartedAt = now;
      attempts = 0;
    }
    if (attempts >= LegacyVerificationAttemptsPerWindow) {
      return false;
    }
    attempts += 1;
    return true;
  };
};

const appendAudit = async (
  client: PostgresExternalWorkflowCredentialClient,
  input: {
    credentialId: string;
    now: string;
    operation?: ExternalWorkflowOperationValue;
    workflowId?: string;
    actor?: ExternalWorkflowCredentialAuditActor;
  },
  eventKind: AuditEventKind,
  result: "authorized" | "unauthorized" | "forbidden" | "throttled",
): Promise<void> => {
  const actor = auditActor(input.actor);
  await client.query(AppendAuditSql, [
    input.credentialId,
    eventKind,
    input.operation ?? null,
    input.workflowId ?? null,
    result,
    actor.kind,
    actor.id,
    input.now,
  ]);
};

const credentialAuditActor = (
  credentialId: string,
): ExternalWorkflowCredentialAuditActor => ({
  kind: ExternalWorkflowCredentialAuditActorKind.Credential,
  id: credentialId,
});

const auditActor = (
  actor: ExternalWorkflowCredentialAuditActor | undefined,
): ExternalWorkflowCredentialAuditActor =>
  actor ?? {
    kind: ExternalWorkflowCredentialAuditActorKind.System,
    id: DefaultCredentialAuditActorId,
  };

const isAllowed = (
  record: Record<string, unknown>,
  input: ExternalCredentialConsumeInput,
): boolean => {
  const operations = readStringArray(record["operations"]);
  if (!operations.includes(input.operation)) {
    return false;
  }
  return (
    record["scope_kind"] === ExternalApiKeyScopeKind.AllWorkflows ||
    readStringArray(record["workflow_ids"]).includes(input.workflowId)
  );
};

const isActiveCredential = (
  record: Record<string, unknown>,
  now: string,
): boolean => !record["revoked_at"] && !isExpired(record["expires_at"], now);

const isExpired = (value: unknown, now: string): boolean =>
  toEpochMilliseconds(value) <= toEpochMilliseconds(now);

const toEpochMilliseconds = (value: unknown): number => {
  if (value instanceof Date) return value.getTime();
  return typeof value === "string"
    ? Date.parse(value)
    : Number.POSITIVE_INFINITY;
};

const readRateLimit = (value: unknown): number =>
  typeof value === "number" && ExternalWorkflowRateLimit.isValid(value)
    ? value
    : ExternalWorkflowRateLimit.DefaultPerMinute;

const readStringArray = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const toCredentialMetadata = (
  value: Record<string, unknown>,
): ReadonlyArray<ExternalWorkflowCredentialMetadata> => {
  const id = value["id"];
  const name = value["name"];
  const scopeKind = value["scope_kind"];
  const createdAt = toTimestamp(value["created_at"]);
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    !createdAt ||
    (scopeKind !== ExternalApiKeyScopeKind.AllWorkflows &&
      scopeKind !== ExternalApiKeyScopeKind.SelectedWorkflows)
  ) {
    return [];
  }
  const scope: ExternalApiKeyScope =
    scopeKind === ExternalApiKeyScopeKind.AllWorkflows
      ? { kind: scopeKind }
      : {
          kind: scopeKind,
          workflowIds: readStringArray(value["workflow_ids"]),
        };
  const operations = readStringArray(value["operations"]).filter(
    (operation): operation is ExternalWorkflowOperationValue =>
      Object.values(ExternalWorkflowOperation).includes(
        operation as ExternalWorkflowOperationValue,
      ),
  );
  const rateLimitPerMinute = readRateLimit(value["rate_limit_per_minute"]);
  const expiresAt = toTimestamp(value["expires_at"]);
  const revokedAt = toTimestamp(value["revoked_at"]);
  const lastUsedAt = toTimestamp(value["last_used_at"]);
  const generation = value["generation"];
  return [
    {
      id,
      name,
      scope,
      createdAt,
      operations,
      rateLimitPerMinute,
      ...(expiresAt ? { expiresAt } : {}),
      ...(revokedAt ? { revokedAt } : {}),
      ...(lastUsedAt ? { lastUsedAt } : {}),
      ...(typeof generation === "number" ? { generation } : {}),
    },
  ];
};

const toCredentialAudit = (
  value: Record<string, unknown>,
): ReadonlyArray<ExternalWorkflowCredentialAudit> => {
  const credentialId = value["credential_id"];
  const eventKind = value["event_kind"];
  const result = value["result"];
  const actorKind = value["actor_kind"];
  const actorId = value["actor_id"];
  const occurredAt = toTimestamp(value["occurred_at"]);
  if (
    typeof credentialId !== "string" ||
    typeof eventKind !== "string" ||
    typeof result !== "string" ||
    !isAuditActorKind(actorKind) ||
    typeof actorId !== "string" ||
    actorId.length === 0 ||
    !occurredAt
  ) {
    return [];
  }
  const operation = value["operation"];
  const workflowId = value["workflow_id"];
  return [
    {
      credentialId,
      eventKind,
      actorKind,
      actorId,
      result,
      occurredAt,
      ...(typeof operation === "string"
        ? { operation: operation as ExternalWorkflowOperationValue }
        : {}),
      ...(typeof workflowId === "string" ? { workflowId } : {}),
    },
  ];
};

const isAuditActorKind = (
  value: unknown,
): value is ExternalWorkflowCredentialAuditActorKind =>
  typeof value === "string" &&
  Object.values(ExternalWorkflowCredentialAuditActorKind).includes(
    value as ExternalWorkflowCredentialAuditActorKind,
  );

const toTimestamp = (value: unknown): string | undefined => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : undefined;
};
