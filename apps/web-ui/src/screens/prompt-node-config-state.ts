export type PromptNodeConfig = {
  assetId: string;
  version: number;
  bindings: Readonly<Record<string, JsonValue>>;
};

export type JsonValue =
  | boolean
  | JsonArray
  | JsonObject
  | null
  | number
  | string;

type JsonArray = ReadonlyArray<JsonValue>;

type JsonObject = {
  readonly [key: string]: JsonValue;
};

export type PromptNodeVariable = {
  name: string;
  required: boolean;
};

export type PromptPreview = {
  valid: boolean;
  value: string;
  errors: ReadonlyArray<string>;
};

const PromptAssetKey = "promptAsset";
const BindingPattern = /{{\s*([A-Za-z_][A-Za-z0-9_]*)\s*}}/g;

export const createPromptNodeConfig = (
  input: PromptNodeConfig,
): Record<string, unknown> => ({
  [PromptAssetKey]: {
    assetId: input.assetId,
    version: input.version,
    bindings: input.bindings,
  },
});

export const readPromptNodeConfig = (
  config: Record<string, unknown>,
): PromptNodeConfig | null => {
  const value = config[PromptAssetKey];
  if (!isRecord(value)) {
    return null;
  }
  const assetId = value["assetId"];
  const version = value["version"];
  const bindings = value["bindings"];
  if (
    typeof assetId !== "string" ||
    assetId.trim().length === 0 ||
    !isPositiveInteger(version) ||
    version < 1 ||
    !isJsonBindings(bindings)
  ) {
    return null;
  }
  return { assetId, version, bindings };
};

export const readPromptNodeBindings = (
  value: string,
): Readonly<Record<string, JsonValue>> | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    return isJsonBindings(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const renderPromptNodePreview = (input: {
  template: string;
  variables: ReadonlyArray<PromptNodeVariable | string>;
  bindings: Readonly<Record<string, JsonValue>>;
}): PromptPreview => {
  const variables = input.variables.map(toPromptNodeVariable);
  const variableNames = new Set(variables.map((variable) => variable.name));
  const errors = [
    ...variables
      .filter(
        (variable) =>
          variable.required && !Object.hasOwn(input.bindings, variable.name),
      )
      .map((variable) => `Missing binding: ${variable.name}`),
    ...Object.keys(input.bindings)
      .filter((binding) => !variableNames.has(binding))
      .map((binding) => `Undeclared binding: ${binding}`),
  ];
  return {
    valid: errors.length === 0,
    value:
      errors.length === 0
        ? input.template.replace(BindingPattern, (_, variable: string) =>
            renderBinding(input.bindings[variable]),
          )
        : input.template,
    errors,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isJsonBindings = (value: unknown): value is Record<string, JsonValue> =>
  isRecord(value) && Object.values(value).every(isJsonValue);

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isRecord(value) && Object.values(value).every(isJsonValue);
};

const toPromptNodeVariable = (
  value: PromptNodeVariable | string,
): PromptNodeVariable =>
  typeof value === "string" ? { name: value, required: true } : value;

const renderBinding = (value: JsonValue | undefined): string => {
  if (value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : (JSON.stringify(value) ?? "");
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
