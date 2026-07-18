export type PromptVariableSchema = {
  name: string;
  required: boolean;
};

export type PinnedPromptReference = {
  assetId: string;
  version: number;
  bindings: Readonly<Record<string, unknown>>;
};

export type PromptBindingIssue = {
  code:
    | "prompt.binding-required-missing"
    | "prompt.binding-undeclared"
    | "prompt.version-unpinned";
  variable?: string;
};

export const validatePinnedPromptReference = (
  reference: PinnedPromptReference,
  variables: ReadonlyArray<PromptVariableSchema>,
): ReadonlyArray<PromptBindingIssue> => {
  if (
    !reference.assetId.trim() ||
    !Number.isInteger(reference.version) ||
    reference.version < 1
  ) {
    return [{ code: "prompt.version-unpinned" }];
  }
  const declared = new Set(variables.map((variable) => variable.name));
  const missing = variables
    .filter(
      (variable) => variable.required && !(variable.name in reference.bindings),
    )
    .map((variable) => ({
      code: "prompt.binding-required-missing" as const,
      variable: variable.name,
    }));
  const undeclared = Object.keys(reference.bindings)
    .filter((variable) => !declared.has(variable))
    .map((variable) => ({
      code: "prompt.binding-undeclared" as const,
      variable,
    }));
  return [...missing, ...undeclared];
};
