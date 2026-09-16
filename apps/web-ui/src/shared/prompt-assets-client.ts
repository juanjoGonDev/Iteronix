import { requestJson } from "./server-api-client.js";

const EndpointPath = {
  List: "/assets/list",
  Usage: "/assets/usage",
  Upsert: "/assets/upsert",
  Delete: "/assets/delete",
} as const;

export type PromptAssetSummary = {
  id: string;
  name: string;
  status: "disabled" | "enabled" | "error";
  activeVersion: number;
  template: string;
  variables: ReadonlyArray<PromptAssetVariable>;
  versions: ReadonlyArray<PromptAssetVersionSummary>;
  asset: Record<string, unknown>;
};

export type PromptAssetVariable = {
  name: string;
  required: boolean;
  schema: {
    id: string;
    version: number;
    schema: { type: "array" | "boolean" | "number" | "object" | "string" };
  };
};

export type PromptAssetVersionSummary = {
  version: number;
  template: string;
  variables: ReadonlyArray<PromptAssetVariable>;
};

export type PromptAssetsClient = {
  list: () => Promise<ReadonlyArray<PromptAssetSummary>>;
  usage: (assetId: string) => Promise<PromptAssetUsageSummary>;
  upsert: (asset: Record<string, unknown>) => Promise<PromptAssetSummary>;
  delete: (input: {
    assetId: string;
    usageFingerprint?: string;
    confirmImpact?: boolean;
  }) => Promise<void>;
};

type PromptAssetUsage = {
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeLabel: string;
  promptVersion: number;
};

export type PromptAssetUsageSummary = {
  assetId: string;
  workflowCount: number;
  nodeCount: number;
  fingerprint: string;
  usages: ReadonlyArray<PromptAssetUsage>;
};

export const createPromptAssetsClient = (): PromptAssetsClient => ({
  list: () =>
    requestJson({
      path: EndpointPath.List,
      body: {},
      parse: parsePromptAssetsResponse,
    }),
  usage: (assetId) =>
    requestJson({
      path: EndpointPath.Usage,
      body: { assetId },
      parse: parsePromptAssetUsageResponse,
    }),
  upsert: (asset) =>
    requestJson({
      path: EndpointPath.Upsert,
      body: asset,
      parse: parsePromptAssetResponse,
    }),
  delete: async (input) => {
    await requestJson({
      path: EndpointPath.Delete,
      body: input,
      parse: () => undefined,
    });
  },
});

export const createPromptAssetRecord = (input: {
  id: string;
  name: string;
  template: string;
  variables?: ReadonlyArray<PromptAssetVariable>;
  now: string;
}): Record<string, unknown> => {
  const provenance = {
    source: "ide",
    artifactFingerprint: input.id,
    registeredAt: input.now,
  };
  return {
    id: input.id,
    kind: "prompt",
    name: input.name,
    status: "enabled",
    capabilities: [],
    permissions: [],
    inputSchema: { id: "prompt-input", version: 1, schema: { type: "object" } },
    outputSchema: {
      id: "prompt-output",
      version: 1,
      schema: { type: "object" },
    },
    limits: { executions: 1, timeoutMs: 30_000 },
    provenance,
    prompt: {
      activeVersion: 1,
      versions: [
        {
          version: 1,
          template: input.template,
          variables: input.variables ?? [],
          provenance,
          createdAt: input.now,
        },
      ],
    },
  };
};

export const appendPromptAssetVersion = (input: {
  asset: PromptAssetSummary;
  name: string;
  template: string;
  variables?: ReadonlyArray<PromptAssetVariable>;
  now: string;
}): Record<string, unknown> => {
  const prompt = readRecord(input.asset.asset["prompt"], "promptAsset.prompt");
  const versions = readArray(prompt["versions"], "promptAsset.prompt.versions");
  const active = readRecord(
    versions.find(
      (version) => readVersion(version) === input.asset.activeVersion,
    ),
    "promptAsset.activeVersion",
  );
  const version = input.asset.activeVersion + 1;
  return {
    ...input.asset.asset,
    name: input.name,
    provenance: {
      ...readRecord(input.asset.asset["provenance"], "promptAsset.provenance"),
      registeredAt: input.now,
    },
    prompt: {
      ...prompt,
      activeVersion: version,
      versions: [
        ...versions,
        {
          ...active,
          version,
          template: input.template,
          variables: input.variables ?? active["variables"],
          createdAt: input.now,
          provenance: {
            ...readRecord(
              active["provenance"],
              "promptAsset.version.provenance",
            ),
            registeredAt: input.now,
          },
        },
      ],
    },
  };
};

export const selectPromptAssetVersion = (
  asset: PromptAssetSummary | undefined,
  version: number | null,
): PromptAssetVersionSummary | undefined => {
  if (!asset) return undefined;
  return asset.versions.find(
    (candidate) => candidate.version === (version ?? asset.activeVersion),
  );
};

export const parsePromptVariableDefinitions = (
  value: string,
): ReadonlyArray<PromptAssetVariable> =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parsePromptVariableDefinition(line));

export const formatPromptVariableDefinitions = (
  variables: ReadonlyArray<PromptAssetVariable>,
): string =>
  variables
    .map(
      (variable) =>
        `${variable.name}:${variable.schema.schema.type}:${variable.required ? "required" : "optional"}`,
    )
    .join("\n");

const parsePromptVariableDefinition = (value: string): PromptAssetVariable => {
  const [name, type, requirement] = value.split(":").map((part) => part.trim());
  if (!name || !isPromptVariableType(type)) {
    throw new Error(
      "Variables must use name:type:required or name:type:optional.",
    );
  }
  if (requirement !== "required" && requirement !== "optional") {
    throw new Error("Variables must declare required or optional.");
  }
  return {
    name,
    required: requirement === "required",
    schema: {
      id: `prompt-variable-${name}`,
      version: 1,
      schema: { type },
    },
  };
};

const isPromptVariableType = (
  value: string | undefined,
): value is PromptAssetVariable["schema"]["schema"]["type"] =>
  value === "array" ||
  value === "boolean" ||
  value === "number" ||
  value === "object" ||
  value === "string";

export const parsePromptAssetsResponse = (
  value: unknown,
): ReadonlyArray<PromptAssetSummary> => {
  const response = readRecord(value, "promptAssetsResponse");
  const assets = response["assets"];
  if (!Array.isArray(assets)) {
    throw new Error("Invalid promptAssetsResponse.assets");
  }

  return assets.flatMap((asset) => parsePromptAssetSummary(asset));
};

export const parsePromptAssetUsageResponse = (
  value: unknown,
): PromptAssetUsageSummary => {
  const response = readRecord(value, "promptAssetUsageResponse");
  const assetId = readRequiredString(response["assetId"], "assetId");
  const workflowCount = readCount(response["workflowCount"], "workflowCount");
  const nodeCount = readCount(response["nodeCount"], "nodeCount");
  const fingerprint = readRequiredString(
    response["fingerprint"],
    "fingerprint",
  );
  const usages = readArray(response["usages"], "usages").map((usage) => {
    const record = readRecord(usage, "usage");
    return {
      workflowId: readRequiredString(record["workflowId"], "workflowId"),
      workflowName: readRequiredString(record["workflowName"], "workflowName"),
      nodeId: readRequiredString(record["nodeId"], "nodeId"),
      nodeLabel: readRequiredString(record["nodeLabel"], "nodeLabel"),
      promptVersion: readPositiveIntegerValue(
        record["promptVersion"],
        "promptVersion",
      ),
    };
  });
  if (
    usages.length !== nodeCount ||
    new Set(usages.map((usage) => usage.workflowId)).size !== workflowCount
  ) {
    throw new Error("Invalid promptAssetUsageResponse counts");
  }
  return { assetId, workflowCount, nodeCount, fingerprint, usages };
};

const parsePromptAssetSummary = (
  value: unknown,
): ReadonlyArray<PromptAssetSummary> => {
  const asset = readRecord(value, "promptAsset");
  if (asset["kind"] !== "prompt") {
    return [];
  }

  const prompt = readRecord(asset["prompt"], "promptAsset.prompt");
  const status = asset["status"];
  const activeVersion = prompt["activeVersion"];
  if (
    typeof asset["id"] !== "string" ||
    typeof asset["name"] !== "string" ||
    !isPromptStatus(status) ||
    !isPositiveInteger(activeVersion)
  ) {
    throw new Error("Invalid promptAsset");
  }
  const versions = readArray(prompt["versions"], "promptAsset.prompt.versions");
  const active = versions.find(
    (version) => readVersion(version) === activeVersion,
  );
  const activeRecord = readRecord(active, "promptAsset.activeVersion");
  const template = activeRecord["template"];
  if (typeof template !== "string") {
    throw new Error("Invalid promptAsset.activeVersion.template");
  }
  const parsedVersions = versions.map((version) => {
    const record = readRecord(version, "promptAsset.version");
    const versionNumber = readPositiveIntegerValue(
      record["version"],
      "version",
    );
    const versionTemplate = readRequiredString(record["template"], "template");
    return {
      version: versionNumber,
      template: versionTemplate,
      variables: readPromptVariables(record["variables"]),
    };
  });
  const activeVersionRecord = parsedVersions.find(
    (version) => version.version === activeVersion,
  );
  if (!activeVersionRecord) {
    throw new Error("Invalid promptAsset.activeVersion");
  }

  return [
    {
      id: asset["id"],
      name: asset["name"],
      status,
      activeVersion,
      template,
      variables: activeVersionRecord.variables,
      versions: parsedVersions,
      asset,
    },
  ];
};

const readPromptVariables = (
  value: unknown,
): ReadonlyArray<PromptAssetVariable> => {
  if (value === undefined) {
    return [];
  }
  return readArray(value, "promptAsset.version.variables").map(
    readPromptVariable,
  );
};

const readPromptVariable = (value: unknown): PromptAssetVariable => {
  if (typeof value === "string") {
    return createLegacyPromptVariable(value);
  }
  return readTypedPromptVariable(value);
};

const createLegacyPromptVariable = (value: string): PromptAssetVariable => {
  const name = readRequiredString(value, "variable.name");
  return {
    name,
    required: true,
    schema: {
      id: `prompt-variable-${name}`,
      version: 1,
      schema: { type: "string" },
    },
  };
};

const readTypedPromptVariable = (value: unknown): PromptAssetVariable => {
  const record = readRecord(value, "promptAsset.version.variable");
  const name = readRequiredString(record["name"], "variable.name");
  const required = record["required"];
  const schema = readRecord(record["schema"], "variable.schema");
  const schemaType = readRecord(schema["schema"], "variable.schema.schema")[
    "type"
  ];
  if (
    typeof required !== "boolean" ||
    typeof schema["id"] !== "string" ||
    !isPositiveInteger(schema["version"]) ||
    typeof schemaType !== "string" ||
    !isPromptVariableType(schemaType)
  ) {
    throw new Error("Invalid promptAsset.version.variable");
  }
  return {
    name,
    required,
    schema: {
      id: schema["id"],
      version: schema["version"],
      schema: { type: schemaType },
    },
  };
};

const parsePromptAssetResponse = (value: unknown): PromptAssetSummary => {
  const response = readRecord(value, "promptAssetResponse");
  const parsed = parsePromptAssetSummary(response["asset"]);
  const asset = parsed[0];
  if (!asset) {
    throw new Error("Invalid promptAssetResponse.asset");
  }
  return asset;
};

const isPromptStatus = (
  value: unknown,
): value is PromptAssetSummary["status"] =>
  value === "disabled" || value === "enabled" || value === "error";

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const readRequiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid promptAssetUsageResponse.${label}`);
  }
  return value;
};

const readCount = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid promptAssetUsageResponse.${label}`);
  }
  return value;
};

const readPositiveIntegerValue = (value: unknown, label: string): number => {
  if (!isPositiveInteger(value)) {
    throw new Error(`Invalid promptAssetUsageResponse.${label}`);
  }
  return value;
};

const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readArray = (value: unknown, label: string): ReadonlyArray<unknown> => {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
};

const readVersion = (value: unknown): number | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const version = readRecord(value, "promptAsset.version")["version"];
  return isPositiveInteger(version) ? version : undefined;
};
