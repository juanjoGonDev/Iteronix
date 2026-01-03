import type { Result } from "../result";
import { ResultType } from "../result";
import type {
  JsonSchema,
  JsonSchemaValidationError,
  JsonSchemaValidationIssue,
  JsonSchemaValidatorPort
} from "./schema";

export type ProviderSettingsSchema = JsonSchema;

export type ProviderSettings<TConfig> = {
  providerId: string;
  profileId: string;
  config: TConfig;
  updatedAt: string;
};

export type ProviderSettingsValidationInput = {
  providerId: string;
  profileId: string;
  updatedAt: string;
  schema: ProviderSettingsSchema;
  value: unknown;
};

export const ProviderSettingsErrorCode = {
  ValidationFailed: "validation_failed",
  Unknown: "unknown"
} as const;

export type ProviderSettingsErrorCode =
  typeof ProviderSettingsErrorCode[keyof typeof ProviderSettingsErrorCode];

export type ProviderSettingsError = {
  code: ProviderSettingsErrorCode;
  message: string;
  retryable: boolean;
  issues?: ReadonlyArray<JsonSchemaValidationIssue>;
};

export const validateProviderSettings = async <TConfig>(
  validator: JsonSchemaValidatorPort,
  input: ProviderSettingsValidationInput
): Promise<Result<ProviderSettings<TConfig>, ProviderSettingsError>> => {
  const validation = await validator.validate<TConfig>(input.schema, input.value);
  if (validation.type === ResultType.Ok) {
    return {
      type: ResultType.Ok,
      value: {
        providerId: input.providerId,
        profileId: input.profileId,
        config: validation.value,
        updatedAt: input.updatedAt
      }
    };
  }

  return {
    type: ResultType.Err,
    error: toProviderSettingsError(validation.error)
  };
};

const toProviderSettingsError = (
  error: JsonSchemaValidationError
): ProviderSettingsError => {
  if (error.issues) {
    return {
      code: ProviderSettingsErrorCode.ValidationFailed,
      message: error.message,
      retryable: error.retryable,
      issues: error.issues
    };
  }

  return {
    code: ProviderSettingsErrorCode.ValidationFailed,
    message: error.message,
    retryable: error.retryable
  };
};
