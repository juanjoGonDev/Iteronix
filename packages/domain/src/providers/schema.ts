import type { Result } from "../result";

export const JsonSchemaType = {
  String: "string",
  Number: "number",
  Integer: "integer",
  Boolean: "boolean",
  Object: "object",
  Array: "array",
  Null: "null"
} as const;

export type JsonSchemaType =
  typeof JsonSchemaType[keyof typeof JsonSchemaType];

export type JsonSchema = {
  $id?: string;
  $schema?: string;
  title?: string;
  description?: string;
  type?: JsonSchemaType | ReadonlyArray<JsonSchemaType>;
  properties?: Record<string, JsonSchema>;
  required?: ReadonlyArray<string>;
  items?: JsonSchema | ReadonlyArray<JsonSchema>;
  enum?: ReadonlyArray<unknown>;
  const?: unknown;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
  oneOf?: ReadonlyArray<JsonSchema>;
  anyOf?: ReadonlyArray<JsonSchema>;
  allOf?: ReadonlyArray<JsonSchema>;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
};

export type JsonSchemaValidationIssue = {
  path: string;
  message: string;
  keyword?: string;
  params?: Record<string, string>;
};

export const JsonSchemaValidationErrorCode = {
  InvalidSchema: "invalid_schema",
  ValidationFailed: "validation_failed",
  Unknown: "unknown"
} as const;

export type JsonSchemaValidationErrorCode =
  typeof JsonSchemaValidationErrorCode[
    keyof typeof JsonSchemaValidationErrorCode
  ];

export type JsonSchemaValidationError = {
  code: JsonSchemaValidationErrorCode;
  message: string;
  retryable: boolean;
  issues?: ReadonlyArray<JsonSchemaValidationIssue>;
};

export type JsonSchemaValidatorPort = {
  validate: <T>(
    schema: JsonSchema,
    data: unknown
  ) => Promise<Result<T, JsonSchemaValidationError>>;
};