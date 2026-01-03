import type { Result } from "../result";

export const SecretScope = {
  Global: "global",
  Project: "project",
  Profile: "profile"
} as const;

export type SecretScope = typeof SecretScope[keyof typeof SecretScope];

export type SecretRef = {
  key: string;
  scope: SecretScope;
  context?: Record<string, string>;
};

export type SecretMetadata = {
  key: string;
  scope: SecretScope;
  updatedAt: string;
};

export const SecretsErrorCode = {
  NotFound: "not_found",
  Forbidden: "forbidden",
  StorageError: "storage_error",
  Unknown: "unknown"
} as const;

export type SecretsErrorCode =
  typeof SecretsErrorCode[keyof typeof SecretsErrorCode];

export type SecretsError = {
  code: SecretsErrorCode;
  message: string;
  retryable: boolean;
};

export type SecretsPort = {
  getSecret: (ref: SecretRef) => Promise<Result<string, SecretsError>>;
  setSecret: (ref: SecretRef, value: string) => Promise<Result<void, SecretsError>>;
  deleteSecret: (ref: SecretRef) => Promise<Result<void, SecretsError>>;
  listSecrets: (
    scope: SecretScope
  ) => Promise<Result<ReadonlyArray<SecretMetadata>, SecretsError>>;
};