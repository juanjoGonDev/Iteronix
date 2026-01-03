import type { LLMProviderCapabilities, LLMProviderType } from "../llm/capabilities";
import type { Result } from "../result";
import { ResultType } from "../result";
import type { ProviderSettingsSchema } from "./settings";

export const ProviderAuthType = {
  None: "none",
  ApiKey: "api_key",
  OAuth: "oauth",
  Custom: "custom"
} as const;

export type ProviderAuthType =
  typeof ProviderAuthType[keyof typeof ProviderAuthType];

export type ProviderAuthRequirement = {
  type: ProviderAuthType;
  description?: string;
};

export type ProviderDescriptor = {
  id: string;
  displayName: string;
  type: LLMProviderType;
  capabilities: LLMProviderCapabilities;
  auth: ProviderAuthRequirement;
  settingsSchema: ProviderSettingsSchema;
};

export const ProviderRegistryErrorCode = {
  DuplicateId: "duplicate_id",
  NotFound: "not_found",
  InvalidProvider: "invalid_provider",
  Unknown: "unknown"
} as const;

export type ProviderRegistryErrorCode =
  typeof ProviderRegistryErrorCode[keyof typeof ProviderRegistryErrorCode];

export type ProviderRegistryError = {
  code: ProviderRegistryErrorCode;
  message: string;
  retryable: boolean;
};

export type ProviderRegistry = {
  list: () => ReadonlyArray<ProviderDescriptor>;
  get: (id: string) => Result<ProviderDescriptor, ProviderRegistryError>;
  register: (
    provider: ProviderDescriptor
  ) => Result<ProviderRegistry, ProviderRegistryError>;
};

export const createProviderRegistry = (
  initialProviders: ReadonlyArray<ProviderDescriptor> = []
): ProviderRegistry => {
  const providers = new Map<string, ProviderDescriptor>();

  for (const provider of initialProviders) {
    providers.set(provider.id, provider);
  }

  const list = (): ReadonlyArray<ProviderDescriptor> =>
    Array.from(providers.values());

  const get = (id: string): Result<ProviderDescriptor, ProviderRegistryError> => {
    const provider = providers.get(id);
    if (!provider) {
      return {
        type: ResultType.Err,
        error: {
          code: ProviderRegistryErrorCode.NotFound,
          message: `Provider ${id} not found`,
          retryable: false
        }
      };
    }

    return {
      type: ResultType.Ok,
      value: provider
    };
  };

  const register = (
    provider: ProviderDescriptor
  ): Result<ProviderRegistry, ProviderRegistryError> => {
    if (providers.has(provider.id)) {
      return {
        type: ResultType.Err,
        error: {
          code: ProviderRegistryErrorCode.DuplicateId,
          message: `Provider ${provider.id} already exists`,
          retryable: false
        }
      };
    }

    const nextProviders = list().concat(provider);

    return {
      type: ResultType.Ok,
      value: createProviderRegistry(nextProviders)
    };
  };

  return {
    list,
    get,
    register
  };
};