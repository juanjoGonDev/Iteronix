import { requestJson } from "./server-api-client.js";
import {
  parseSettingsSnapshot,
  type SettingsSnapshot,
} from "./settings-storage.js";
import type { ServerConnection } from "./server-config.js";

const EndpointPath = {
  SettingsGet: "/settings/get",
  SettingsUpdate: "/settings/update",
  ProvidersList: "/providers/list",
  ProvidersSettings: "/providers/settings",
  ExternalApiKeysList: "/settings/api-keys/list",
  ExternalApiKeysCreate: "/settings/api-keys/create",
  ExternalApiKeysUpdate: "/settings/api-keys/update",
  ExternalApiKeysRevoke: "/settings/api-keys/revoke",
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

export type ExternalApiKeyRecord = {
  id: string;
  name: string;
  scope: ExternalApiKeyScope;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
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
  listExternalApiKeys: () => Promise<ReadonlyArray<ExternalApiKeyRecord>>;
  createExternalApiKey: (input: {
    name: string;
    scope: ExternalApiKeyScope;
  }) => Promise<{ key: ExternalApiKeyRecord; plaintextKey: string }>;
  updateExternalApiKey: (input: {
    keyId: string;
    name: string;
    scope: ExternalApiKeyScope;
  }) => Promise<ExternalApiKeyRecord>;
  revokeExternalApiKey: (input: {
    keyId: string;
  }) => Promise<ExternalApiKeyRecord>;
};

export const createSettingsClient = (
  connection?: ServerConnection,
): SettingsClient => ({
  load: () =>
    requestJson({
      path: EndpointPath.SettingsGet,
      body: {},
      parse: parseSettingsResponse,
      connection,
    }),
  update: (settings) =>
    requestJson({
      path: EndpointPath.SettingsUpdate,
      body: settings,
      parse: parseSettingsResponse,
      connection,
    }),
  listProviders: (input) =>
    requestJson({
      path: EndpointPath.ProvidersList,
      body: {
        ...(input?.profileId ? { profileId: input.profileId } : {}),
      },
      parse: parseProviderListResponse,
      connection,
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
      connection,
    }),
  listExternalApiKeys: () =>
    requestJson({
      path: EndpointPath.ExternalApiKeysList,
      body: {},
      parse: (value) => readExternalApiKeysResponse(value, "keys"),
      connection,
    }),
  createExternalApiKey: (input) =>
    requestJson({
      path: EndpointPath.ExternalApiKeysCreate,
      body: input,
      parse: parseExternalApiKeyCreationResponse,
      connection,
    }),
  updateExternalApiKey: (input) =>
    requestJson({
      path: EndpointPath.ExternalApiKeysUpdate,
      body: input,
      parse: (value) =>
        parseExternalApiKey(
          readRequiredRecord(value, "externalApiKeyUpdateResponse", "key"),
        ),
      connection,
    }),
  revokeExternalApiKey: (input) =>
    requestJson({
      path: EndpointPath.ExternalApiKeysRevoke,
      body: input,
      parse: (value) =>
        parseExternalApiKey(
          readRequiredRecord(value, "externalApiKeyRevokeResponse", "key"),
        ),
      connection,
    }),
});

const parseExternalApiKeyCreationResponse = (
  value: unknown,
): {
  key: ExternalApiKeyRecord;
  plaintextKey: string;
} => {
  const record = ensureRecord(value, "externalApiKeyCreationResponse");
  return {
    key: parseExternalApiKey(
      readRequiredRecord(record, "externalApiKeyCreationResponse", "key"),
    ),
    plaintextKey: readRequiredString(
      record,
      "externalApiKeyCreationResponse",
      "plaintextKey",
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

const parseExternalApiKey = (
  value: Record<string, unknown>,
): ExternalApiKeyRecord => {
  const scope = readRequiredRecord(value, "externalApiKey", "scope");
  const kind = readRequiredString(scope, "externalApiKey.scope", "kind");
  return {
    id: readRequiredString(value, "externalApiKey", "id"),
    name: readRequiredString(value, "externalApiKey", "name"),
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
    ...(typeof value["lastUsedAt"] === "string"
      ? { lastUsedAt: value["lastUsedAt"] }
      : {}),
    ...(typeof value["revokedAt"] === "string"
      ? { revokedAt: value["revokedAt"] }
      : {}),
  };
};

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
