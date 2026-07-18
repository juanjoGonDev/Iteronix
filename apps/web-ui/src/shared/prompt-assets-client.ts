import { requestJson } from "./server-api-client.js";

const EndpointPath = {
  List: "/assets/list",
  Upsert: "/assets/upsert",
  Delete: "/assets/delete",
} as const;

export type PromptAssetSummary = {
  id: string;
  name: string;
  status: "disabled" | "enabled" | "error";
  activeVersion: number;
  template: string;
  asset: Record<string, unknown>;
};

export type PromptAssetsClient = {
  list: () => Promise<ReadonlyArray<PromptAssetSummary>>;
  upsert: (asset: Record<string, unknown>) => Promise<PromptAssetSummary>;
  delete: (assetId: string) => Promise<void>;
};

export const createPromptAssetsClient = (): PromptAssetsClient => ({
  list: () =>
    requestJson({
      path: EndpointPath.List,
      body: {},
      parse: parsePromptAssetsResponse,
    }),
  upsert: (asset) =>
    requestJson({
      path: EndpointPath.Upsert,
      body: asset,
      parse: parsePromptAssetResponse,
    }),
  delete: async (assetId) => {
    await requestJson({
      path: EndpointPath.Delete,
      body: { assetId },
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

  return [
    {
      id: asset["id"],
      name: asset["name"],
      status,
      activeVersion,
      template,
      asset,
    },
  ];
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
