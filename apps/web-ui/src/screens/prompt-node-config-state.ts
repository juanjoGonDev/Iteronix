export type PromptNodeConfig = {
  assetId: string;
  version: number;
  bindings: Readonly<Record<string, string>>;
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
    !isRecord(bindings) ||
    Object.values(bindings).some((binding) => typeof binding !== "string")
  ) {
    return null;
  }
  return { assetId, version, bindings: bindings as Record<string, string> };
};

export const renderPromptNodePreview = (input: {
  template: string;
  variables: ReadonlyArray<string>;
  bindings: Readonly<Record<string, string>>;
}): PromptPreview => {
  const variables = new Set(input.variables);
  const errors = [
    ...input.variables
      .filter((variable) => !Object.hasOwn(input.bindings, variable))
      .map((variable) => `Missing binding: ${variable}`),
    ...Object.keys(input.bindings)
      .filter((binding) => !variables.has(binding))
      .map((binding) => `Undeclared binding: ${binding}`),
  ];
  return {
    valid: errors.length === 0,
    value:
      errors.length === 0
        ? input.template.replace(
            BindingPattern,
            (_, variable: string) => input.bindings[variable] ?? "",
          )
        : input.template,
    errors,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
