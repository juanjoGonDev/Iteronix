import {
  validateVersionedJsonSchema,
  type VersionedJsonSchema,
} from "./governance-validation";

export type PromptVariableSchema = {
  name: string;
  required: boolean;
  schema?: VersionedJsonSchema;
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
    | "prompt.binding-schema-invalid"
    | "prompt.version-unpinned";
  variable?: string;
};

export type PromptAssetVersion = {
  version: number;
  template: string;
  variables: ReadonlyArray<PromptVariableSchema>;
};

export type PromptAsset = {
  id: string;
  status: "enabled" | "disabled" | "error";
  versions: ReadonlyArray<PromptAssetVersion>;
};

export type ResolvedPinnedPrompt = {
  rendered: string;
  provenance: {
    assetId: string;
    version: number;
    bindings: Readonly<Record<string, unknown>>;
    renderedFingerprint: string;
    validation: "passed";
  };
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
  const malformed = variables.flatMap((variable) => {
    const binding = reference.bindings[variable.name];
    if (binding === undefined || !variable.schema) return [];
    return validateVersionedJsonSchema(variable.schema, binding).valid
      ? []
      : [
          {
            code: "prompt.binding-schema-invalid" as const,
            variable: variable.name,
          },
        ];
  });
  return [...missing, ...undeclared, ...malformed];
};

export const resolvePinnedPrompt = (input: {
  reference: PinnedPromptReference;
  assets: ReadonlyArray<PromptAsset>;
}): ResolvedPinnedPrompt => {
  const asset = input.assets.find(
    (candidate) => candidate.id === input.reference.assetId,
  );
  if (!asset) {
    throw new Error(`Prompt asset ${input.reference.assetId} was not found.`);
  }
  if (asset.status !== "enabled") {
    throw new Error(`Prompt asset ${asset.id} is ${asset.status}.`);
  }
  const version = asset.versions.find(
    (candidate) => candidate.version === input.reference.version,
  );
  if (!version) {
    throw new Error(
      `Prompt asset ${asset.id} version ${input.reference.version.toString()} was not found.`,
    );
  }
  if (hasUndeclaredTemplateTokens(version)) {
    throw new Error("Prompt template contains undeclared variables.");
  }
  if (
    validatePinnedPromptReference(input.reference, version.variables).length
  ) {
    throw new Error("Prompt bindings are invalid.");
  }
  const rendered = renderTemplate(version.template, input.reference.bindings);
  return {
    rendered,
    provenance: {
      assetId: asset.id,
      version: version.version,
      bindings: { ...input.reference.bindings },
      renderedFingerprint: fingerprintPrompt(rendered),
      validation: "passed",
    },
  };
};

const hasUndeclaredTemplateTokens = (version: PromptAssetVersion): boolean => {
  const declared = new Set(version.variables.map((variable) => variable.name));
  return extractTemplateTokens(version.template).some(
    (token) => !declared.has(token),
  );
};

const extractTemplateTokens = (template: string): ReadonlyArray<string> =>
  [...template.matchAll(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/gu)].flatMap(
    (match) => (typeof match[1] === "string" ? [match[1]] : []),
  );

const renderTemplate = (
  template: string,
  bindings: Readonly<Record<string, unknown>>,
): string =>
  template.replace(
    /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/gu,
    (_match, name: string) => renderBinding(bindings[name]),
  );

const renderBinding = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

const fingerprintPrompt = (value: string): string => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};
