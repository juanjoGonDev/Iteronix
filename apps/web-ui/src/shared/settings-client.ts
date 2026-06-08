import { requestJson } from "./server-api-client.js";
import { parseProjectOpenResponse } from "./quality-gates-client.js";
import type { ProjectRecord } from "./workbench-types.js";

const EndpointPath = {
  ProjectOpen: "/projects/open",
  ProvidersList: "/providers/list",
  ProvidersSettings: "/providers/settings"
} as const;

export type RuntimeProviderRecord = {
  id: string;
  displayName: string;
  type: string;
  authType: string;
  settingsSchema: Record<string, unknown>;
};

export type RuntimeProviderSelectionRecord = {
  projectId: string;
  profileId: string;
  providerId: string;
  updatedAt: string;
};

export type RuntimeProviderListResponse = {
  providers: ReadonlyArray<RuntimeProviderRecord>;
  selection?: RuntimeProviderSelectionRecord;
};

export type RuntimeProviderSettingsRecord = {
  projectId: string;
  profileId: string;
  providerId: string;
  config: Record<string, unknown>;
  updatedAt: string;
};

export type SettingsClient = {
  openProject: (input: { rootPath: string | null; name?: string }) => Promise<ProjectRecord>;
  listProviders: (input?: { projectId?: string; profileId?: string }) => Promise<RuntimeProviderListResponse>;
  updateProviderSettings: (input: {
    projectId: string;
    profileId: string;
    providerId: string;
    config: Record<string, unknown>;
  }) => Promise<RuntimeProviderSettingsRecord>;
};

export const createSettingsClient = (): SettingsClient => ({
  openProject: (input) =>
    requestJson({
      path: EndpointPath.ProjectOpen,
      body: {
        rootPath: input.rootPath,
        ...(input.name ? { name: input.name } : {})
      },
      parse: parseProjectOpenResponse
    }),
  listProviders: (input) =>
    requestJson({
      path: EndpointPath.ProvidersList,
      body: {
        ...(input?.projectId ? { projectId: input.projectId } : {}),
        ...(input?.profileId ? { profileId: input.profileId } : {})
      },
      parse: parseProviderListResponse
    }),
  updateProviderSettings: (input) =>
    requestJson({
      path: EndpointPath.ProvidersSettings,
      body: {
        projectId: input.projectId,
        profileId: input.profileId,
        providerId: input.providerId,
        config: input.config
      },
      parse: parseProviderSettingsResponse
    })
});

export const parseProviderListResponse = (
  value: unknown
): RuntimeProviderListResponse => {
  const record = ensureRecord(value, "providerListResponse");

  return {
    providers: readRequiredArray(record, "providerListResponse", "providers").map((provider) =>
      parseRuntimeProviderRecord(ensureRecord(provider, "runtimeProviderRecord"))
    ),
    ...readOptionalSelection(record)
  };
};

export const parseProviderSettingsResponse = (
  value: unknown
): RuntimeProviderSettingsRecord =>
  parseRuntimeProviderSettingsRecord(
    readRequiredRecord(value, "providerSettingsResponse", "settings")
  );

const parseRuntimeProviderRecord = (
  value: Record<string, unknown>
): RuntimeProviderRecord => ({
  id: readRequiredString(value, "runtimeProviderRecord", "id"),
  displayName: readRequiredString(value, "runtimeProviderRecord", "displayName"),
  type: readRequiredString(value, "runtimeProviderRecord", "type"),
  authType: readNestedRequiredString(value, "runtimeProviderRecord", "auth", "type"),
  settingsSchema: readRequiredRecord(value, "runtimeProviderRecord", "settingsSchema")
});

const parseRuntimeProviderSettingsRecord = (
  value: Record<string, unknown>
): RuntimeProviderSettingsRecord => ({
  projectId: readRequiredString(value, "runtimeProviderSettingsRecord", "projectId"),
  profileId: readRequiredString(value, "runtimeProviderSettingsRecord", "profileId"),
  providerId: readRequiredString(value, "runtimeProviderSettingsRecord", "providerId"),
  config: readRequiredRecord(value, "runtimeProviderSettingsRecord", "config"),
  updatedAt: readRequiredString(value, "runtimeProviderSettingsRecord", "updatedAt")
});

const readOptionalSelection = (
  value: Record<string, unknown>
): Partial<Pick<RuntimeProviderListResponse, "selection">> => {
  const selection = value["selection"];
  if (!selection) {
    return {};
  }

  const record = ensureRecord(selection, "runtimeProviderSelectionRecord");
  return {
    selection: {
      projectId: readRequiredString(record, "runtimeProviderSelectionRecord", "projectId"),
      profileId: readRequiredString(record, "runtimeProviderSelectionRecord", "profileId"),
      providerId: readRequiredString(record, "runtimeProviderSelectionRecord", "providerId"),
      updatedAt: readRequiredString(record, "runtimeProviderSelectionRecord", "updatedAt")
    }
  };
};

const ensureRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readRequiredRecord = (
  value: Record<string, unknown> | unknown,
  label: string,
  key: string
): Record<string, unknown> => {
  const record = ensureRecord(value, label);
  return ensureRecord(record[key], `${label}.${key}`);
};

const readRequiredArray = (
  value: Record<string, unknown>,
  label: string,
  key: string
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
  key: string
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
  nestedKey: string
): string => {
  const nested = readRequiredRecord(value, label, key);
  return readRequiredString(nested, `${label}.${key}`, nestedKey);
};
