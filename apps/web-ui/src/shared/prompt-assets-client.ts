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
  variables: ReadonlyArray<string>;
  versions: ReadonlyArray<PromptAssetVersionSummary>;
  asset: Record<string, unknown>;
};

type PromptAssetVersionSummary = {
  version: number;
  template: string;
  variables: ReadonlyArray<string>;
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
          variables: [],
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

const readPromptVariables = (value: unknown): ReadonlyArray<string> => {
  if (value === undefined) {
    return [];
  }
  return readArray(value, "promptAsset.version.variables").map((variable) => {
    if (typeof variable === "string" && variable.trim().length > 0) {
      return variable;
    }
    const record = readRecord(variable, "promptAsset.version.variable");
    return readRequiredString(record["name"], "variable.name");
  });
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
