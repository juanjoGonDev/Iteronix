import type { ProviderDescriptor } from "../../../packages/domain/src/providers/registry";
import { codexCliProviderDescriptor } from "../../../packages/adapters/src/codex-cli/provider";
import { ErrorMessage } from "./constants";
import { err, ok, type Result } from "./result";

const ProviderKeySeparator = "::";

export const ProviderStoreErrorCode = {
  InvalidInput: "invalid_input",
  NotFound: "not_found"
} as const;

export type ProviderStoreErrorCode =
  typeof ProviderStoreErrorCode[keyof typeof ProviderStoreErrorCode];

export type ProviderStoreError = {
  code: ProviderStoreErrorCode;
  message: string;
};

export type ProviderSelectionKey = {
  projectId: string;
  profileId: string;
};

export type ProviderSelection = {
  projectId: string;
  profileId: string;
  providerId: string;
  updatedAt: string;
};

export type ProviderSelectInput = {
  projectId: string;
  profileId: string;
  providerId: string;
};

export type ProviderSettingsInput = {
  projectId: string;
  profileId: string;
  providerId: string;
  config: Record<string, unknown>;
};

export type ProviderSettingsRecord = {
  projectId: string;
  profileId: string;
  providerId: string;
  config: Record<string, unknown>;
  updatedAt: string;
};

export type ProviderStoreSeed = {
  providers?: ReadonlyArray<ProviderDescriptor>;
  selections?: ReadonlyArray<ProviderSelection>;
  settings?: ReadonlyArray<ProviderSettingsRecord>;
};

export type ProviderStore = {
  listProviders: () => ReadonlyArray<ProviderDescriptor>;
  getSelection: (
    input: ProviderSelectionKey
  ) => Result<ProviderSelection | undefined, ProviderStoreError>;
  selectProvider: (
    input: ProviderSelectInput
  ) => Result<ProviderSelection, ProviderStoreError>;
  updateSettings: (
    input: ProviderSettingsInput
  ) => Result<ProviderSettingsRecord, ProviderStoreError>;
  snapshot: () => ProviderStoreSnapshot;
};

export type ProviderStoreSnapshot = {
  selections: ReadonlyArray<ProviderSelection>;
  settings: ReadonlyArray<ProviderSettingsRecord>;
};

export const createProviderStore = (
  seed: ProviderStoreSeed = {}
): ProviderStore => {
  const providers = seed.providers
    ? [...seed.providers]
    : [codexCliProviderDescriptor];
  const providersById = new Map<string, ProviderDescriptor>();

  for (const provider of providers) {
    providersById.set(provider.id, provider);
  }

  const selectionsByKey = new Map<string, ProviderSelection>();
  if (seed.selections) {
    for (const selection of seed.selections) {
      if (providersById.has(selection.providerId)) {
        selectionsByKey.set(
          createSelectionKey(selection.projectId, selection.profileId),
          selection
        );
      }
    }
  }

  const settingsByKey = new Map<string, ProviderSettingsRecord>();
  if (seed.settings) {
    for (const setting of seed.settings) {
      if (providersById.has(setting.providerId)) {
        settingsByKey.set(
          createSettingsKey(
            setting.projectId,
            setting.profileId,
            setting.providerId
          ),
          setting
        );
      }
    }
  }

  const listProviders = (): ReadonlyArray<ProviderDescriptor> => [...providers];

  const getSelection = (
    input: ProviderSelectionKey
  ): Result<ProviderSelection | undefined, ProviderStoreError> =>
    readSelection(selectionsByKey, input);

  const selectProvider = (
    input: ProviderSelectInput
  ): Result<ProviderSelection, ProviderStoreError> =>
    writeSelection(providersById, selectionsByKey, input);

  const updateSettings = (
    input: ProviderSettingsInput
  ): Result<ProviderSettingsRecord, ProviderStoreError> =>
    writeSettings(providersById, settingsByKey, input);

  const snapshot = (): ProviderStoreSnapshot => ({
    selections: Array.from(selectionsByKey.values()),
    settings: Array.from(settingsByKey.values())
  });

  return {
    listProviders,
    getSelection,
    selectProvider,
    updateSettings,
    snapshot
  };
};

const readSelection = (
  selectionsByKey: Map<string, ProviderSelection>,
  input: ProviderSelectionKey
): Result<ProviderSelection | undefined, ProviderStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const profileId = normalizeId(input.profileId);
  if (!profileId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProfileId
    });
  }

  const selection = selectionsByKey.get(createSelectionKey(projectId, profileId));
  return ok(selection);
};

const writeSelection = (
  providersById: Map<string, ProviderDescriptor>,
  selectionsByKey: Map<string, ProviderSelection>,
  input: ProviderSelectInput
): Result<ProviderSelection, ProviderStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const profileId = normalizeId(input.profileId);
  if (!profileId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProfileId
    });
  }

  const providerId = normalizeId(input.providerId);
  if (!providerId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProviderId
    });
  }

  if (!providersById.has(providerId)) {
    return err({
      code: ProviderStoreErrorCode.NotFound,
      message: ErrorMessage.ProviderNotFound
    });
  }

  const selection = createSelection({
    projectId,
    profileId,
    providerId
  });
  selectionsByKey.set(createSelectionKey(projectId, profileId), selection);
  return ok(selection);
};

const writeSettings = (
  providersById: Map<string, ProviderDescriptor>,
  settingsByKey: Map<string, ProviderSettingsRecord>,
  input: ProviderSettingsInput
): Result<ProviderSettingsRecord, ProviderStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const profileId = normalizeId(input.profileId);
  if (!profileId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProfileId
    });
  }

  const providerId = normalizeId(input.providerId);
  if (!providerId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProviderId
    });
  }

  if (!providersById.has(providerId)) {
    return err({
      code: ProviderStoreErrorCode.NotFound,
      message: ErrorMessage.ProviderNotFound
    });
  }

  const settings = createSettingsRecord({
    projectId,
    profileId,
    providerId,
    config: input.config
  });
  settingsByKey.set(createSettingsKey(projectId, profileId, providerId), settings);
  return ok(settings);
};

const createSelection = (input: ProviderSelectInput): ProviderSelection => ({
  projectId: input.projectId,
  profileId: input.profileId,
  providerId: input.providerId,
  updatedAt: new Date().toISOString()
});

const createSettingsRecord = (
  input: ProviderSettingsInput
): ProviderSettingsRecord => ({
  projectId: input.projectId,
  profileId: input.profileId,
  providerId: input.providerId,
  config: input.config,
  updatedAt: new Date().toISOString()
});

const createSelectionKey = (projectId: string, profileId: string): string =>
  [projectId, profileId].join(ProviderKeySeparator);

const createSettingsKey = (
  projectId: string,
  profileId: string,
  providerId: string
): string => [projectId, profileId, providerId].join(ProviderKeySeparator);

const normalizeId = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
