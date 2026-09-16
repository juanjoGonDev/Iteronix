import { readBackendOrigin } from "./backend-origin.js";

const EndpointPath = {
  List: "/assets/list",
  Upsert: "/assets/upsert",
  Delete: "/assets/delete",
} as const;
const AssetKind = "plugin";
const DefaultTimeoutMs = 30_000;

type PluginAssetAuditEvent = { at: string; action: string };

export type PluginAssetSummary = {
  id: string;
  name: string;
  status: "disabled" | "enabled" | "error";
  runtime: "server";
  isolation: "process";
  permissions: ReadonlyArray<string>;
  auditEvents: ReadonlyArray<PluginAssetAuditEvent>;
};

export type PluginAssetsClient = {
  list: () => Promise<ReadonlyArray<PluginAssetSummary>>;
  upsert: (asset: Record<string, unknown>) => Promise<PluginAssetSummary>;
  delete: (assetId: string) => Promise<void>;
};

export const createPluginAssetsClient = (): PluginAssetsClient => ({
  list: () =>
    requestCredentialedJson({
      path: EndpointPath.List,
      body: {},
      parse: parsePluginAssetsResponse,
    }),
  upsert: (asset) =>
    requestCredentialedJson({
      path: EndpointPath.Upsert,
      body: asset,
      parse: parsePluginAssetResponse,
    }),
  delete: async (assetId) => {
    await requestCredentialedJson({
      path: EndpointPath.Delete,
      body: { assetId },
      parse: () => undefined,
    });
  },
});

export const selectEnabledPluginAssets = (
  plugins: ReadonlyArray<PluginAssetSummary>,
): ReadonlyArray<PluginAssetSummary> =>
  plugins.filter((plugin) => plugin.status === "enabled");

export const createPluginAssetRecord = (input: {
  id: string;
  name: string;
  now: string;
}): Record<string, unknown> => ({
  id: input.id,
  kind: AssetKind,
  name: input.name,
  status: "enabled",
  capabilities: ["tool-calls"],
  permissions: ["tool.invoke"],
  inputSchema: { id: "plugin-input", version: 1, schema: { type: "object" } },
  outputSchema: { id: "plugin-output", version: 1, schema: { type: "object" } },
  limits: { executions: 1, timeoutMs: DefaultTimeoutMs },
  provenance: {
    source: "ide",
    artifactFingerprint: input.id,
    registeredAt: input.now,
  },
  plugin: { runtime: "server", isolation: "process", auditEvents: [] },
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
  if (!isRecord(value)) return `Request failed with status ${status}`;
  const error = value["error"];
  return isRecord(error) && typeof error["message"] === "string"
    ? error["message"]
    : `Request failed with status ${status}`;
};

export const parsePluginAssetsResponse = (
  value: unknown,
): ReadonlyArray<PluginAssetSummary> => {
  const assets = readRecord(value, "pluginAssetsResponse")["assets"];
  if (!Array.isArray(assets))
    throw new Error("Invalid pluginAssetsResponse.assets");
  return assets.flatMap(parsePluginAssetSummary);
};

const parsePluginAssetResponse = (value: unknown): PluginAssetSummary => {
  const asset = parsePluginAssetSummary(
    readRecord(value, "pluginAssetResponse")["asset"],
  )[0];
  if (!asset) throw new Error("Invalid pluginAssetResponse.asset");
  return asset;
};

const parsePluginAssetSummary = (
  value: unknown,
): ReadonlyArray<PluginAssetSummary> => {
  const asset = readRecord(value, "pluginAsset");
  if (asset["kind"] !== AssetKind) return [];
  const plugin = readRecord(asset["plugin"], "pluginAsset.plugin");
  if (plugin["runtime"] !== "server" || plugin["isolation"] !== "process")
    throw new Error("Invalid pluginAsset.plugin");
  return [
    {
      id: readString(asset["id"], "id"),
      name: readString(asset["name"], "name"),
      status: readStatus(asset["status"]),
      runtime: "server",
      isolation: "process",
      permissions: readStrings(asset["permissions"], "permissions"),
      auditEvents: readAuditEvents(plugin["auditEvents"]),
    },
  ];
};

const readAuditEvents = (
  value: unknown,
): ReadonlyArray<PluginAssetAuditEvent> => {
  if (!Array.isArray(value)) throw new Error("Invalid pluginAsset.auditEvents");
  return value.map((entry) => {
    const event = readRecord(entry, "pluginAsset.auditEvent");
    return {
      at: readString(event["at"], "auditEvent.at"),
      action: readString(event["action"], "auditEvent.action"),
    };
  });
};
const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`Invalid ${label}`);
  return value;
};
const readString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`Invalid pluginAsset.${label}`);
  return value;
};
const readStrings = (value: unknown, label: string): ReadonlyArray<string> => {
  if (!Array.isArray(value)) throw new Error(`Invalid pluginAsset.${label}`);
  return value.map((item) => readString(item, label));
};
const readStatus = (value: unknown): PluginAssetSummary["status"] => {
  if (value === "disabled" || value === "enabled" || value === "error")
    return value;
  throw new Error("Invalid pluginAsset.status");
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
