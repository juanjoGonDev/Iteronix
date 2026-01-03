import { createRequire } from "node:module";
import {
  SecretErrorCode,
  SecretErrorMessage,
  SecretKey,
  SecretProviderType,
  SecretService
} from "./constants";
import { err, ok, ResultType, type Result } from "./result";

export type SecretError = {
  code: SecretErrorCode;
  message: string;
};

export type SecretStore = {
  provider: SecretProviderType;
  getAuthToken: () => Promise<Result<string | null, SecretError>>;
  setAuthToken: (token: string) => Promise<Result<void, SecretError>>;
  clearAuthToken: () => Promise<Result<void, SecretError>>;
};

type KeychainProvider = {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

export const createSecretStore = (
  provider?: KeychainProvider | null
): SecretStore => {
  if (provider) {
    return createKeychainStore(provider);
  }

  const loaded = loadKeychainProvider();
  if (loaded.type === ResultType.Ok) {
    return createKeychainStore(loaded.value);
  }

  return createMemoryStore();
};

const loadKeychainProvider = (): Result<KeychainProvider, SecretError> => {
  try {
    const requireModule: (id: string) => unknown = createRequire(__filename);
    const moduleValue = requireModule("keytar");
    return parseKeychainProvider(moduleValue);
  } catch {
    return err({
      code: SecretErrorCode.Unavailable,
      message: SecretErrorMessage.Unavailable
    });
  }
};

const parseKeychainProvider = (value: unknown): Result<KeychainProvider, SecretError> => {
  if (isKeychainProvider(value)) {
    return ok(value);
  }

  return err({
    code: SecretErrorCode.Unavailable,
    message: SecretErrorMessage.Unavailable
  });
};

const isKeychainProvider = (value: unknown): value is KeychainProvider => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["getPassword"] === "function" &&
    typeof record["setPassword"] === "function" &&
    typeof record["deletePassword"] === "function"
  );
};

const createKeychainStore = (provider: KeychainProvider): SecretStore => ({
  provider: SecretProviderType.Keychain,
  getAuthToken: async () => {
    try {
      const value = await provider.getPassword(SecretService, SecretKey.AuthToken);
      return ok(value ?? null);
    } catch {
      return err({
        code: SecretErrorCode.OperationFailed,
        message: SecretErrorMessage.OperationFailed
      });
    }
  },
  setAuthToken: async (token: string) => {
    const trimmed = token.trim();
    if (trimmed.length === 0) {
      return err({
        code: SecretErrorCode.InvalidToken,
        message: SecretErrorMessage.InvalidToken
      });
    }
    try {
      await provider.setPassword(SecretService, SecretKey.AuthToken, trimmed);
      return ok(undefined);
    } catch {
      return err({
        code: SecretErrorCode.OperationFailed,
        message: SecretErrorMessage.OperationFailed
      });
    }
  },
  clearAuthToken: async () => {
    try {
      await provider.deletePassword(SecretService, SecretKey.AuthToken);
      return ok(undefined);
    } catch {
      return err({
        code: SecretErrorCode.OperationFailed,
        message: SecretErrorMessage.OperationFailed
      });
    }
  }
});

const createMemoryStore = (): SecretStore => {
  let token: string | null = null;
  return {
    provider: SecretProviderType.Memory,
    getAuthToken: async () => ok(token),
    setAuthToken: async (value: string) => {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return err({
          code: SecretErrorCode.InvalidToken,
          message: SecretErrorMessage.InvalidToken
        });
      }
      token = trimmed;
      return ok(undefined);
    },
    clearAuthToken: async () => {
      token = null;
      return ok(undefined);
    }
  };
};
