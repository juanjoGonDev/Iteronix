import type { ProviderDescriptor } from "../../../packages/domain/src/providers/registry";
import { codexCliProviderDescriptor } from "../../../packages/adapters/src/codex-cli/provider";
import {
  customOpenAiCompatibleProviderDescriptor,
  openAiCompatibleProviderDescriptor,
} from "../../../packages/adapters/src/openai-compatible/provider";
import { ErrorMessage } from "./constants";
import { err, ok, type Result } from "./result";

const ProviderKeySeparator = "::";

export const ProviderStoreErrorCode = {
  InvalidInput: "invalid_input",
  NotFound: "not_found",
} as const;

export type ProviderStoreErrorCode =
  (typeof ProviderStoreErrorCode)[keyof typeof ProviderStoreErrorCode];

export type ProviderStoreError = {
  code: ProviderStoreErrorCode;
  message: string;
};

type ProviderSelectionKey = {
  profileId: string;
};

export type ProviderSelection = {
  profileId: string;
  providerId: string;
  updatedAt: string;
};

type ProviderSelectInput = {
  profileId: string;
  providerId: string;
};

type ProviderSettingsInput = {
  profileId: string;
  providerId: string;
  config: Record<string, unknown>;
};

export type ProviderSettingsRecord = {
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
    input: ProviderSelectionKey,
  ) => Result<ProviderSelection | undefined, ProviderStoreError>;
  selectProvider: (
    input: ProviderSelectInput,
  ) => Result<ProviderSelection, ProviderStoreError>;
  updateSettings: (
    input: ProviderSettingsInput,
  ) => Result<ProviderSettingsRecord, ProviderStoreError>;
  snapshot: () => ProviderStoreSnapshot;
  restore: (snapshot: ProviderStoreSnapshot) => void;
};

export type ProviderStoreSnapshot = {
  selections: ReadonlyArray<ProviderSelection>;
  settings: ReadonlyArray<ProviderSettingsRecord>;
};

export const createProviderStore = (
  seed: ProviderStoreSeed = {},
): ProviderStore => {
  const providers = seed.providers
    ? [...seed.providers]
    : [
        codexCliProviderDescriptor,
        openAiCompatibleProviderDescriptor,
        customOpenAiCompatibleProviderDescriptor,
      ];
  const providersById = new Map<string, ProviderDescriptor>();

  for (const provider of providers) {
    providersById.set(provider.id, provider);
  }

  const selectionsByKey = new Map<string, ProviderSelection>();
  if (seed.selections) {
    for (const selection of seed.selections) {
      if (providersById.has(selection.providerId)) {
        selectionsByKey.set(createSelectionKey(selection.profileId), selection);
      }
    }
  }

  const settingsByKey = new Map<string, ProviderSettingsRecord>();
  if (seed.settings) {
    for (const setting of seed.settings) {
      if (providersById.has(setting.providerId)) {
        settingsByKey.set(
          createSettingsKey(setting.profileId, setting.providerId),
          setting,
        );
      }
    }
  }

  const listProviders = (): ReadonlyArray<ProviderDescriptor> => [...providers];

  const getSelection = (
    input: ProviderSelectionKey,
  ): Result<ProviderSelection | undefined, ProviderStoreError> =>
    readSelection(selectionsByKey, input);

  const selectProvider = (
    input: ProviderSelectInput,
  ): Result<ProviderSelection, ProviderStoreError> =>
    writeSelection(providersById, selectionsByKey, input);

  const updateSettings = (
    input: ProviderSettingsInput,
  ): Result<ProviderSettingsRecord, ProviderStoreError> =>
    writeSettings(providersById, settingsByKey, input);

  const snapshot = (): ProviderStoreSnapshot => ({
    selections: Array.from(selectionsByKey.values()),
    settings: Array.from(settingsByKey.values()),
  });

  const restore = (snapshot: ProviderStoreSnapshot): void => {
    selectionsByKey.clear();
    for (const selection of snapshot.selections) {
      if (providersById.has(selection.providerId)) {
        selectionsByKey.set(createSelectionKey(selection.profileId), selection);
      }
    }

    settingsByKey.clear();
    for (const setting of snapshot.settings) {
      if (providersById.has(setting.providerId)) {
        settingsByKey.set(
          createSettingsKey(setting.profileId, setting.providerId),
          setting,
        );
      }
    }
  };

  return {
    listProviders,
    getSelection,
    selectProvider,
    updateSettings,
    snapshot,
    restore,
  };
};

const readSelection = (
  selectionsByKey: Map<string, ProviderSelection>,
  input: ProviderSelectionKey,
): Result<ProviderSelection | undefined, ProviderStoreError> => {
  const profileId = normalizeId(input.profileId);
  if (!profileId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProfileId,
    });
  }

  const selection = selectionsByKey.get(createSelectionKey(profileId));
  return ok(selection);
};

const writeSelection = (
  providersById: Map<string, ProviderDescriptor>,
  selectionsByKey: Map<string, ProviderSelection>,
  input: ProviderSelectInput,
): Result<ProviderSelection, ProviderStoreError> => {
  const profileId = normalizeId(input.profileId);
  if (!profileId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProfileId,
    });
  }

  const providerId = normalizeId(input.providerId);
  if (!providerId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProviderId,
    });
  }

  if (!providersById.has(providerId)) {
    return err({
      code: ProviderStoreErrorCode.NotFound,
      message: ErrorMessage.ProviderNotFound,
    });
  }

  const selection = createSelection({
    profileId,
    providerId,
  });
  selectionsByKey.set(createSelectionKey(profileId), selection);
  return ok(selection);
};

const writeSettings = (
  providersById: Map<string, ProviderDescriptor>,
  settingsByKey: Map<string, ProviderSettingsRecord>,
  input: ProviderSettingsInput,
): Result<ProviderSettingsRecord, ProviderStoreError> => {
  const profileId = normalizeId(input.profileId);
  if (!profileId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProfileId,
    });
  }

  const providerId = normalizeId(input.providerId);
  if (!providerId) {
    return err({
      code: ProviderStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProviderId,
    });
  }

  if (!providersById.has(providerId)) {
    return err({
      code: ProviderStoreErrorCode.NotFound,
      message: ErrorMessage.ProviderNotFound,
    });
  }

  const settings = createSettingsRecord({
    profileId,
    providerId,
    config: input.config,
  });
  settingsByKey.set(createSettingsKey(profileId, providerId), settings);
  return ok(settings);
};

const createSelection = (input: ProviderSelectInput): ProviderSelection => ({
  profileId: input.profileId,
  providerId: input.providerId,
  updatedAt: new Date().toISOString(),
});

const createSettingsRecord = (
  input: ProviderSettingsInput,
): ProviderSettingsRecord => ({
  profileId: input.profileId,
  providerId: input.providerId,
  config: input.config,
  updatedAt: new Date().toISOString(),
});

const createSelectionKey = (profileId: string): string => profileId;

const createSettingsKey = (profileId: string, providerId: string): string =>
  [profileId, providerId].join(ProviderKeySeparator);

const normalizeId = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
