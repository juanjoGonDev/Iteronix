import { readBackendOrigin } from "./backend-origin.js";

const EndpointPath = {
  List: "/assets/list",
  Upsert: "/assets/upsert",
  Delete: "/assets/delete",
} as const;
const AssetKind = "mcp-tool";
const DefaultTimeoutMs = 30_000;

export type McpAssetSummary = {
  id: string;
  name: string;
  status: "disabled" | "enabled" | "error";
  serverId: string;
  toolVersion: string;
  permissions: ReadonlyArray<string>;
  asset: Record<string, unknown>;
};

export type McpAssetsClient = {
  list: () => Promise<ReadonlyArray<McpAssetSummary>>;
  upsert: (asset: Record<string, unknown>) => Promise<McpAssetSummary>;
  delete: (assetId: string) => Promise<void>;
};

export const createMcpAssetsClient = (): McpAssetsClient => ({
  list: () =>
    requestCredentialedJson({
      path: EndpointPath.List,
      body: {},
      parse: parseMcpAssetsResponse,
    }),
  upsert: (asset) =>
    requestCredentialedJson({
      path: EndpointPath.Upsert,
      body: asset,
      parse: parseMcpAssetResponse,
    }),
  delete: async (assetId) => {
    await requestCredentialedJson({
      path: EndpointPath.Delete,
      body: { assetId },
      parse: () => undefined,
    });
  },
});

export const selectEnabledMcpAssets = (
  assets: ReadonlyArray<McpAssetSummary>,
): ReadonlyArray<McpAssetSummary> =>
  assets.filter((asset) => asset.status === "enabled");

export const createMcpAssetRecord = (input: {
  id: string;
  name: string;
  serverId: string;
  toolVersion: string;
  now: string;
}): Record<string, unknown> => ({
  id: input.id,
  kind: AssetKind,
  name: input.name,
  status: "enabled",
  capabilities: ["mcp"],
  permissions: ["mcp.invoke"],
  inputSchema: { id: "mcp-input", version: 1, schema: { type: "object" } },
  outputSchema: { id: "mcp-output", version: 1, schema: { type: "object" } },
  limits: { executions: 1, timeoutMs: DefaultTimeoutMs },
  provenance: {
    source: "ide",
    artifactFingerprint: input.id,
    registeredAt: input.now,
  },
  mcp: {
    serverId: input.serverId,
    toolVersion: input.toolVersion,
    auditEvents: [],
  },
});

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
  const message = readRecord(value, "error")["message"];
  return typeof message === "string"
    ? message
    : `Request failed with status ${status}`;
};

export const parseMcpAssetsResponse = (
  value: unknown,
): ReadonlyArray<McpAssetSummary> => {
  const assets = readRecord(value, "mcpAssetsResponse")["assets"];
  if (!Array.isArray(assets))
    throw new Error("Invalid mcpAssetsResponse.assets");
  return assets.flatMap(parseMcpAssetSummary);
};

const parseMcpAssetResponse = (value: unknown): McpAssetSummary => {
  const asset = parseMcpAssetSummary(
    readRecord(value, "mcpAssetResponse")["asset"],
  )[0];
  if (!asset) throw new Error("Invalid mcpAssetResponse.asset");
  return asset;
};

const parseMcpAssetSummary = (
  value: unknown,
): ReadonlyArray<McpAssetSummary> => {
  const asset = readRecord(value, "mcpAsset");
  if (asset["kind"] !== AssetKind) return [];
  const mcp = readRecord(asset["mcp"], "mcpAsset.mcp");
  return [
    {
      id: readString(asset["id"], "id"),
      name: readString(asset["name"], "name"),
      status: readStatus(asset["status"]),
      serverId: readString(mcp["serverId"], "serverId"),
      toolVersion: readString(mcp["toolVersion"], "toolVersion"),
      permissions: readStrings(asset["permissions"], "permissions"),
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
    throw new Error(`Invalid mcpAsset.${label}`);
  return value;
};
const readStrings = (value: unknown, label: string): ReadonlyArray<string> => {
  if (!Array.isArray(value)) throw new Error(`Invalid mcpAsset.${label}`);
  return value.map((entry) => readString(entry, label));
};
const readStatus = (value: unknown): McpAssetSummary["status"] => {
  if (value === "disabled" || value === "enabled" || value === "error")
    return value;
  throw new Error("Invalid mcpAsset.status");
};
