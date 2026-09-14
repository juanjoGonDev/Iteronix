import { requestJson } from "./server-api-client.js";
import {
  parseSettingsSnapshot,
  type SettingsSnapshot,
} from "./settings-storage.js";

const EndpointPath = {
  SettingsGet: "/settings/get",
  SettingsUpdate: "/settings/update",
  ProvidersList: "/providers/list",
  ProvidersSettings: "/providers/settings",
  ExternalWorkflowCredentialsList: "/settings/credentials/list",
  ExternalWorkflowCredentialsCreate: "/settings/credentials/create",
  ExternalWorkflowCredentialsRotate: "/settings/credentials/rotate",
  ExternalWorkflowCredentialsRevoke: "/settings/credentials/revoke",
  ExternalWorkflowCredentialsAudits: "/settings/credentials/audits",
} as const;

export type RuntimeProviderRecord = {
  id: string;
  displayName: string;
  type: string;
  authType: string;
  settingsSchema: Record<string, unknown>;
};

export type ExternalApiKeyScope =
  | { kind: "all_workflows" }
  | { kind: "selected_workflows"; workflowIds: ReadonlyArray<string> };

export const ExternalWorkflowOperations = [
  "workflow.read",
  "workflow.invoke",
  "workflow.trigger",
  "run.status",
  "run.approve",
  "run.trace",
] as const;

export type ExternalWorkflowOperation =
  (typeof ExternalWorkflowOperations)[number];

export type ExternalApiKeyRecord = {
  id: string;
  name: string;
  scope: ExternalApiKeyScope;
  operations: ReadonlyArray<ExternalWorkflowOperation>;
  rateLimitPerMinute: number;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
};

export type ExternalWorkflowCredentialAudit = {
  credentialId: string;
  eventKind: string;
  actorKind: "administrator" | "credential" | "anonymous" | "system";
  actorId: string;
  operation?: ExternalWorkflowOperation;
  workflowId?: string;
  result: string;
  occurredAt: string;
};

type RuntimeProviderSelectionRecord = {
  profileId: string;
  providerId: string;
  updatedAt: string;
};

export type RuntimeProviderListResponse = {
  providers: ReadonlyArray<RuntimeProviderRecord>;
  selection?: RuntimeProviderSelectionRecord;
};

export type RuntimeProviderSettingsRecord = {
  profileId: string;
  providerId: string;
  config: Record<string, unknown>;
  updatedAt: string;
};

export type SettingsClient = {
  load: () => Promise<SettingsSnapshot>;
  update: (settings: SettingsSnapshot) => Promise<SettingsSnapshot>;
  listProviders: (input?: {
    profileId?: string;
  }) => Promise<RuntimeProviderListResponse>;
  updateProviderSettings: (input: {
    profileId: string;
    providerId: string;
    config: Record<string, unknown>;
  }) => Promise<RuntimeProviderSettingsRecord>;
  listExternalWorkflowCredentials: () => Promise<
    ReadonlyArray<ExternalApiKeyRecord>
  >;
  createExternalWorkflowCredential: (input: {
    name: string;
    scope: ExternalApiKeyScope;
    operations: ReadonlyArray<ExternalWorkflowOperation>;
    expiresAt?: string;
    rateLimitPerMinute: number;
  }) => Promise<{
    credential: ExternalApiKeyRecord;
    plaintextCredential: string;
  }>;
  rotateExternalWorkflowCredential: (input: {
    credentialId: string;
  }) => Promise<{ plaintextCredential: string }>;
  revokeExternalWorkflowCredential: (input: {
    credentialId: string;
  }) => Promise<{ credentialId: string }>;
  listExternalWorkflowCredentialAudits: (input?: {
    credentialId?: string;
  }) => Promise<ReadonlyArray<ExternalWorkflowCredentialAudit>>;
};

export const createSettingsClient = (): SettingsClient => ({
  load: () =>
    requestJson({
      path: EndpointPath.SettingsGet,
      body: {},
      parse: parseSettingsResponse,
    }),
  update: (settings) =>
    requestJson({
      path: EndpointPath.SettingsUpdate,
      body: settings,
      parse: parseSettingsResponse,
    }),
  listProviders: (input) =>
    requestJson({
      path: EndpointPath.ProvidersList,
      body: {
        ...(input?.profileId ? { profileId: input.profileId } : {}),
      },
      parse: parseProviderListResponse,
    }),
  updateProviderSettings: (input) =>
    requestJson({
      path: EndpointPath.ProvidersSettings,
      body: {
        profileId: input.profileId,
        providerId: input.providerId,
        config: input.config,
      },
      parse: parseProviderSettingsResponse,
    }),
  listExternalWorkflowCredentials: () =>
    requestJson({
      path: EndpointPath.ExternalWorkflowCredentialsList,
      body: {},
      parse: (value) => readExternalApiKeysResponse(value, "credentials"),
    }),
  createExternalWorkflowCredential: (input) =>
    requestJson({
      path: EndpointPath.ExternalWorkflowCredentialsCreate,
      body: input,
      parse: parseExternalWorkflowCredentialCreationResponse,
    }),
  rotateExternalWorkflowCredential: (input) =>
    requestJson({
      path: EndpointPath.ExternalWorkflowCredentialsRotate,
      body: input,
      parse: parseExternalWorkflowCredentialRotationResponse,
    }),
  revokeExternalWorkflowCredential: (input) =>
    requestJson({
      path: EndpointPath.ExternalWorkflowCredentialsRevoke,
      body: input,
      parse: parseExternalWorkflowCredentialRevocationResponse,
    }),
  listExternalWorkflowCredentialAudits: (input) =>
    requestJson({
      path: EndpointPath.ExternalWorkflowCredentialsAudits,
      body: {
        ...(input?.credentialId ? { credentialId: input.credentialId } : {}),
      },
      parse: (value) =>
        readRequiredArray(
          ensureRecord(value, "externalWorkflowCredentialAuditsResponse"),
          "externalWorkflowCredentialAuditsResponse",
          "audits",
        ).map((audit) =>
          parseExternalWorkflowCredentialAudit(
            ensureRecord(audit, "externalWorkflowCredentialAudit"),
          ),
        ),
    }),
});

export const parseExternalWorkflowCredentialCreationResponse = (
  value: unknown,
): {
  credential: ExternalApiKeyRecord;
  plaintextCredential: string;
} => {
  const record = ensureRecord(
    value,
    "externalWorkflowCredentialCreationResponse",
  );
  return {
    credential: parseExternalApiKey(
      readRequiredRecord(
        record,
        "externalWorkflowCredentialCreationResponse",
        "credential",
      ),
    ),
    plaintextCredential: readRequiredString(
      record,
      "externalWorkflowCredentialCreationResponse",
      "plaintextCredential",
    ),
  };
};

const parseExternalWorkflowCredentialRotationResponse = (
  value: unknown,
): { plaintextCredential: string } => {
  const record = ensureRecord(
    value,
    "externalWorkflowCredentialRotationResponse",
  );
  return {
    plaintextCredential: readRequiredString(
      record,
      "externalWorkflowCredentialRotationResponse",
      "plaintextCredential",
    ),
  };
};

const parseExternalWorkflowCredentialRevocationResponse = (
  value: unknown,
): { credentialId: string } => {
  const record = ensureRecord(
    value,
    "externalWorkflowCredentialRevocationResponse",
  );
  return {
    credentialId: readRequiredString(
      record,
      "externalWorkflowCredentialRevocationResponse",
      "credentialId",
    ),
  };
};

const readExternalApiKeysResponse = (
  value: unknown,
  key: string,
): ReadonlyArray<ExternalApiKeyRecord> =>
  readRequiredArray(
    ensureRecord(value, "externalApiKeysResponse"),
    "externalApiKeysResponse",
    key,
  ).map((entry) => parseExternalApiKey(ensureRecord(entry, "externalApiKey")));

export const parseExternalApiKey = (
  value: Record<string, unknown>,
): ExternalApiKeyRecord => {
  const scope = readRequiredRecord(value, "externalApiKey", "scope");
  const kind = readRequiredString(scope, "externalApiKey.scope", "kind");
  return {
    id: readRequiredString(value, "externalApiKey", "id"),
    name: readRequiredString(value, "externalApiKey", "name"),
    operations: readExternalWorkflowOperations(value["operations"]),
    rateLimitPerMinute: readRateLimitPerMinute(value["rateLimitPerMinute"]),
    scope:
      kind === "all_workflows"
        ? { kind }
        : {
            kind: "selected_workflows",
            workflowIds: readRequiredArray(
              scope,
              "externalApiKey.scope",
              "workflowIds",
            ).map((workflowId) => {
              if (typeof workflowId !== "string") {
                throw new Error("Invalid externalApiKey.scope.workflowIds");
              }
              return workflowId;
            }),
          },
    createdAt: readRequiredString(value, "externalApiKey", "createdAt"),
    ...(typeof value["expiresAt"] === "string"
      ? { expiresAt: value["expiresAt"] }
      : {}),
    ...(typeof value["lastUsedAt"] === "string"
      ? { lastUsedAt: value["lastUsedAt"] }
      : {}),
    ...(typeof value["revokedAt"] === "string"
      ? { revokedAt: value["revokedAt"] }
      : {}),
  };
};

export const parseExternalWorkflowCredentialAudit = (
  value: Record<string, unknown>,
): ExternalWorkflowCredentialAudit => ({
  credentialId: readRequiredString(
    value,
    "externalWorkflowCredentialAudit",
    "credentialId",
  ),
  eventKind: readRequiredString(
    value,
    "externalWorkflowCredentialAudit",
    "eventKind",
  ),
  actorKind: readExternalWorkflowCredentialAuditActorKind(value["actorKind"]),
  actorId: readRequiredString(
    value,
    "externalWorkflowCredentialAudit",
    "actorId",
  ),
  result: readRequiredString(
    value,
    "externalWorkflowCredentialAudit",
    "result",
  ),
  occurredAt: readRequiredString(
    value,
    "externalWorkflowCredentialAudit",
    "occurredAt",
  ),
  ...readOptionalExternalWorkflowOperation(value["operation"]),
  ...(typeof value["workflowId"] === "string"
    ? { workflowId: value["workflowId"] }
    : {}),
});

const readExternalWorkflowCredentialAuditActorKind = (
  value: unknown,
): ExternalWorkflowCredentialAudit["actorKind"] => {
  if (
    value === "administrator" ||
    value === "credential" ||
    value === "anonymous" ||
    value === "system"
  ) {
    return value;
  }
  throw new Error("externalWorkflowCredentialAudit.actorKind must be valid.");
};

const readExternalWorkflowOperations = (
  value: unknown,
): ReadonlyArray<ExternalWorkflowOperation> => {
  if (!Array.isArray(value)) return ["workflow.read", "workflow.invoke"];
  const operations = value.filter(
    (entry): entry is ExternalWorkflowOperation =>
      typeof entry === "string" &&
      ExternalWorkflowOperations.some((operation) => operation === entry),
  );
  return operations.length > 0
    ? operations
    : ["workflow.read", "workflow.invoke"];
};

const readOptionalExternalWorkflowOperation = (
  value: unknown,
): Partial<Pick<ExternalWorkflowCredentialAudit, "operation">> => {
  const operation =
    typeof value === "string"
      ? ExternalWorkflowOperations.find((candidate) => candidate === value)
      : undefined;
  return operation ? { operation } : {};
};

const readRateLimitPerMinute = (value: unknown): number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 600
    ? value
    : 60;

export const parseSettingsResponse = (value: unknown): SettingsSnapshot =>
  parseSettingsSnapshot(
    readRequiredRecord(value, "settingsResponse", "settings"),
  );

export const parseProviderListResponse = (
  value: unknown,
): RuntimeProviderListResponse => {
  const record = ensureRecord(value, "providerListResponse");

  return {
    providers: readRequiredArray(
      record,
      "providerListResponse",
      "providers",
    ).map((provider) =>
      parseRuntimeProviderRecord(
        ensureRecord(provider, "runtimeProviderRecord"),
      ),
    ),
    ...readOptionalSelection(record),
  };
};

export const parseProviderSettingsResponse = (
  value: unknown,
): RuntimeProviderSettingsRecord =>
  parseRuntimeProviderSettingsRecord(
    readRequiredRecord(value, "providerSettingsResponse", "settings"),
  );

const parseRuntimeProviderRecord = (
  value: Record<string, unknown>,
): RuntimeProviderRecord => ({
  id: readRequiredString(value, "runtimeProviderRecord", "id"),
  displayName: readRequiredString(
    value,
    "runtimeProviderRecord",
    "displayName",
  ),
  type: readRequiredString(value, "runtimeProviderRecord", "type"),
  authType: readNestedRequiredString(
    value,
    "runtimeProviderRecord",
    "auth",
    "type",
  ),
  settingsSchema: readRequiredRecord(
    value,
    "runtimeProviderRecord",
    "settingsSchema",
  ),
});

const parseRuntimeProviderSettingsRecord = (
  value: Record<string, unknown>,
): RuntimeProviderSettingsRecord => ({
  profileId: readRequiredString(
    value,
    "runtimeProviderSettingsRecord",
    "profileId",
  ),
  providerId: readRequiredString(
    value,
    "runtimeProviderSettingsRecord",
    "providerId",
  ),
  config: readRequiredRecord(value, "runtimeProviderSettingsRecord", "config"),
  updatedAt: readRequiredString(
    value,
    "runtimeProviderSettingsRecord",
    "updatedAt",
  ),
});

const readOptionalSelection = (
  value: Record<string, unknown>,
): Partial<Pick<RuntimeProviderListResponse, "selection">> => {
  const selection = value["selection"];
  if (!selection) {
    return {};
  }

  const record = ensureRecord(selection, "runtimeProviderSelectionRecord");
  return {
    selection: {
      profileId: readRequiredString(
        record,
        "runtimeProviderSelectionRecord",
        "profileId",
      ),
      providerId: readRequiredString(
        record,
        "runtimeProviderSelectionRecord",
        "providerId",
      ),
      updatedAt: readRequiredString(
        record,
        "runtimeProviderSelectionRecord",
        "updatedAt",
      ),
    },
  };
};

const ensureRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readRequiredRecord = (
  value: Record<string, unknown> | unknown,
  label: string,
  key: string,
): Record<string, unknown> => {
  const record = ensureRecord(value, label);
  return ensureRecord(record[key], `${label}.${key}`);
};

const readRequiredArray = (
  value: Record<string, unknown>,
  label: string,
  key: string,
): ReadonlyArray<unknown> => {
  const nested = value[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredString = (
  value: Record<string, unknown>,
  label: string,
  key: string,
): string => {
  const nested = value[key];
  if (typeof nested !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readNestedRequiredString = (
  value: Record<string, unknown>,
  label: string,
  key: string,
  nestedKey: string,
): string => {
  const nested = readRequiredRecord(value, label, key);
  return readRequiredString(nested, `${label}.${key}`, nestedKey);
};
