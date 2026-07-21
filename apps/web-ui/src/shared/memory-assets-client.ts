import { readBackendOrigin } from "./backend-origin.js";

const EndpointPath = {
  List: "/assets/list",
  Upsert: "/assets/upsert",
  Delete: "/assets/delete",
} as const;
const AssetKind = "memory-source";
const DefaultTimeoutMs = 30_000;
const DefaultRetentionDays = 30;

export type MemoryAssetScope = "workflow";
type MemorySourceDocument = { id: string; name: string; status: string };
export type MemoryAssetSummary = {
  id: string;
  name: string;
  status: "disabled" | "enabled" | "error";
  permissions: ReadonlyArray<string>;
  scope: MemoryAssetScope;
  workflowId: string | null;
  indexingEnabled: boolean;
  retentionDays: number;
  redactionEnabled: boolean;
  documents: ReadonlyArray<MemorySourceDocument>;
  asset: Record<string, unknown>;
};
export type MemoryAssetsClient = {
  list: () => Promise<ReadonlyArray<MemoryAssetSummary>>;
  upsert: (asset: Record<string, unknown>) => Promise<MemoryAssetSummary>;
  delete: (assetId: string) => Promise<void>;
};

export const createMemoryAssetsClient = (): MemoryAssetsClient => ({
  list: () =>
    requestCredentialedJson({
      path: EndpointPath.List,
      body: {},
      parse: parseMemoryAssetsResponse,
    }),
  upsert: (asset) =>
    requestCredentialedJson({
      path: EndpointPath.Upsert,
      body: asset,
      parse: parseMemoryAssetResponse,
    }),
  delete: async (assetId) => {
    await requestCredentialedJson({
      path: EndpointPath.Delete,
      body: { assetId },
      parse: () => undefined,
    });
  },
});

export const selectEnabledMemoryAssets = (
  assets: ReadonlyArray<MemoryAssetSummary>,
): ReadonlyArray<MemoryAssetSummary> =>
  assets.filter((asset) => asset.status === "enabled");

export const createMemoryAssetRecord = (input: {
  id: string;
  name: string;
  scope: MemoryAssetScope;
  workflowId: string | null;
  indexingEnabled: boolean;
  retentionDays: number;
  redactionEnabled: boolean;
  now: string;
}): Record<string, unknown> => {
  const provenance = {
    source: "ide",
    artifactFingerprint: input.id,
    registeredAt: input.now,
  };
  return {
    id: input.id,
    kind: AssetKind,
    name: input.name,
    status: "enabled",
    capabilities: ["rag"],
    permissions: ["rag.query"],
    inputSchema: { id: "memory-query", version: 1, schema: { type: "object" } },
    outputSchema: {
      id: "memory-results",
      version: 1,
      schema: { type: "object" },
    },
    limits: { executions: 1, timeoutMs: DefaultTimeoutMs },
    provenance,
    memory: {
      tenantId: input.workflowId ?? input.id,
      workflowId: input.workflowId ?? input.id,
      optInIndexing: input.indexingEnabled,
      retentionDays: input.retentionDays || DefaultRetentionDays,
      redactRetrievals: input.redactionEnabled,
    },
  };
};

const requestCredentialedJson = async <TResult>(input: {
  path: string;
  body: Readonly<Record<string, unknown>>;
  parse: (value: unknown) => TResult;
}): Promise<TResult> => {
  const response = await fetch(`${readBackendOrigin()}${input.path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.body),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(readErrorMessage(payload, response.status));
  return input.parse(payload);
};
const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};
const readErrorMessage = (value: unknown, status: number): string => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return `Request failed with status ${status}`;
  const error = readRecord(value, "error")["error"];
  const message =
    error && typeof error === "object" && !Array.isArray(error)
      ? readRecord(error, "error")["message"]
      : undefined;
  return typeof message === "string"
    ? message
    : `Request failed with status ${status}`;
};

export const parseMemoryAssetsResponse = (
  value: unknown,
): ReadonlyArray<MemoryAssetSummary> => {
  const assets = readRecord(value, "memoryAssetsResponse")["assets"];
  if (!Array.isArray(assets))
    throw new Error("Invalid memoryAssetsResponse.assets");
  return assets.flatMap(parseMemoryAssetSummary);
};
const parseMemoryAssetResponse = (value: unknown): MemoryAssetSummary => {
  const asset = parseMemoryAssetSummary(
    readRecord(value, "memoryAssetResponse")["asset"],
  )[0];
  if (!asset) throw new Error("Invalid memoryAssetResponse.asset");
  return asset;
};
const parseMemoryAssetSummary = (
  value: unknown,
): ReadonlyArray<MemoryAssetSummary> => {
  const asset = readRecord(value, "memoryAsset");
  if (asset["kind"] !== AssetKind) return [];
  const memory = readRecord(asset["memory"], "memoryAsset.memory");
  const workflowId = readString(memory["workflowId"], "workflowId");
  return [
    {
      id: readString(asset["id"], "id"),
      name: readString(asset["name"], "name"),
      status: readStatus(asset["status"]),
      permissions: readStrings(asset["permissions"], "permissions"),
      scope: "workflow",
      workflowId,
      indexingEnabled: readBoolean(memory["optInIndexing"], "optInIndexing"),
      retentionDays: readPositiveInteger(
        memory["retentionDays"],
        "retentionDays",
      ),
      redactionEnabled: readBoolean(
        memory["redactRetrievals"],
        "redactRetrievals",
      ),
      documents: [],
      asset,
    },
  ];
};
const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
};
const readString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`Invalid memoryAsset.${label}`);
  return value;
};
const readStrings = (value: unknown, label: string): ReadonlyArray<string> => {
  if (!Array.isArray(value)) throw new Error(`Invalid memoryAsset.${label}`);
  return value.map((entry) => readString(entry, label));
};
const readBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean")
    throw new Error(`Invalid memoryAsset.${label}`);
  return value;
};
const readPositiveInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw new Error(`Invalid memoryAsset.${label}`);
  return value;
};
const readStatus = (value: unknown): MemoryAssetSummary["status"] => {
  if (value === "disabled" || value === "enabled" || value === "error")
    return value;
  throw new Error("Invalid memoryAsset.status");
};
