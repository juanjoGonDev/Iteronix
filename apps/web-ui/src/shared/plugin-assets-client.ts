import { requestJson } from "./server-api-client.js";

const EndpointPath = {
  List: "/assets/list",
  Upsert: "/assets/upsert",
  Delete: "/assets/delete",
} as const;
const AssetKind = "plugin";
const DefaultTimeoutMs = 30_000;
const DefaultExecutionLimit = 1;
const DefaultSchemaType = "object" as const;

type PluginAssetStatus = "disabled" | "enabled" | "error";

export type PluginAssetAuditEvent = { at: string; action: string };

type PluginAssetSchema = {
  id: string;
  version: number;
  schema: Record<string, unknown>;
};

export type PluginAssetSummary = {
  id: string;
  name: string;
  status: PluginAssetStatus;
  runtime: "server";
  isolation: "process";
  capabilities: ReadonlyArray<string>;
  permissions: ReadonlyArray<string>;
  limits: { executions: number; timeoutMs: number };
  inputSchema: PluginAssetSchema;
  outputSchema: PluginAssetSchema;
  provenance: {
    source: string;
    artifactFingerprint: string;
    registeredAt: string;
  };
  auditEvents: ReadonlyArray<PluginAssetAuditEvent>;
};

export type PluginAssetsCatalog = {
  plugins: ReadonlyArray<PluginAssetSummary>;
  /** The server-owned allowlist; the UI must never invent keys outside it. */
  trustedKeys: ReadonlyArray<string>;
};

export type PluginRegistrationForm = {
  trustedKey: string;
  name: string;
  enabled: boolean;
  capabilities: ReadonlyArray<string>;
  permissions: ReadonlyArray<string>;
  executions: number;
  timeoutMs: number;
  inputSchemaJson: string;
  outputSchemaJson: string;
};

type PluginAssetsClient = {
  list: () => Promise<ReadonlyArray<PluginAssetSummary>>;
  listCatalog: () => Promise<PluginAssetsCatalog>;
  upsert: (asset: Record<string, unknown>) => Promise<PluginAssetSummary>;
  delete: (assetId: string) => Promise<void>;
};

export const createPluginAssetsClient = (): PluginAssetsClient => ({
  list: async () => (await requestCatalog()).plugins,
  listCatalog: () => requestCatalog(),
  upsert: (asset) =>
    requestJson({
      path: EndpointPath.Upsert,
      body: asset,
      parse: parsePluginAssetResponse,
    }),
  delete: async (assetId) => {
    await requestJson({
      path: EndpointPath.Delete,
      body: { assetId },
      parse: () => undefined,
    });
  },
});

const requestCatalog = (): Promise<PluginAssetsCatalog> =>
  requestJson({
    path: EndpointPath.List,
    body: {},
    parse: parsePluginAssetsCatalog,
  });

export const selectEnabledPluginAssets = (
  plugins: ReadonlyArray<PluginAssetSummary>,
): ReadonlyArray<PluginAssetSummary> =>
  plugins.filter((plugin) => plugin.status === "enabled");

export const parsePluginAssetsCatalog = (
  value: unknown,
): PluginAssetsCatalog => {
  const response = readRecord(value, "pluginAssetsResponse");
  const assets = response["assets"];
  if (!Array.isArray(assets))
    throw new Error("Invalid pluginAssetsResponse.assets");
  // Older servers answer without the registry field; the UI degrades to an
  // empty allowlist and explains why registration is blocked.
  const registryValue = response["pluginRegistry"];
  const trustedKeys =
    isRecord(registryValue) && Array.isArray(registryValue["trustedKeys"])
      ? registryValue["trustedKeys"].flatMap((key) =>
          typeof key === "string" && key.trim().length > 0 ? [key] : [],
        )
      : [];
  return {
    plugins: assets.flatMap(parsePluginAssetSummary),
    trustedKeys,
  };
};

export const parsePluginAssetsResponse = (
  value: unknown,
): ReadonlyArray<PluginAssetSummary> => parsePluginAssetsCatalog(value).plugins;

export const createPluginAssetRecord = (input: {
  id: string;
  name: string;
  now: string;
}): Record<string, unknown> =>
  buildPluginRegistrationRecord(
    {
      trustedKey: input.id,
      name: input.name,
      enabled: true,
      capabilities: ["tool-calls"],
      permissions: ["tool.invoke"],
      executions: DefaultExecutionLimit,
      timeoutMs: DefaultTimeoutMs,
      inputSchemaJson: JSON.stringify({ type: DefaultSchemaType }),
      outputSchemaJson: JSON.stringify({ type: DefaultSchemaType }),
    },
    { now: input.now },
  );

export const buildPluginRegistrationRecord = (
  form: PluginRegistrationForm,
  context: {
    now: string;
    existing?: {
      provenance: PluginAssetSummary["provenance"];
    };
  },
): Record<string, unknown> => {
  const key = form.trustedKey.trim();
  if (key.length === 0) throw new Error("A trusted plugin key is required.");
  if (!Number.isInteger(form.executions) || form.executions < 1)
    throw new Error("The execution limit must be a positive integer.");
  if (!Number.isInteger(form.timeoutMs) || form.timeoutMs < 1)
    throw new Error("The timeout must be a positive integer.");
  return {
    id: key,
    kind: AssetKind,
    name: form.name.trim().length > 0 ? form.name.trim() : key,
    status: form.enabled ? "enabled" : "disabled",
    capabilities: dedupeStrings(
      form.capabilities.length > 0 ? form.capabilities : ["tool-calls"],
    ),
    permissions: dedupeStrings(
      form.permissions.length > 0 ? form.permissions : ["tool.invoke"],
    ),
    inputSchema: buildVersionedSchema(`${key}.input`, form.inputSchemaJson),
    outputSchema: buildVersionedSchema(`${key}.output`, form.outputSchemaJson),
    limits: { executions: form.executions, timeoutMs: form.timeoutMs },
    provenance: context.existing
      ? { ...context.existing.provenance }
      : {
          source: "ide",
          artifactFingerprint: key,
          registeredAt: context.now,
        },
    plugin: { runtime: "server", isolation: "process", auditEvents: [] },
  };
};

export const buildPluginRecordFromSummary = (
  summary: PluginAssetSummary,
  patch: { status: PluginAssetStatus },
): Record<string, unknown> => ({
  id: summary.id,
  kind: AssetKind,
  name: summary.name,
  status: patch.status,
  capabilities: [...summary.capabilities],
  permissions: [...summary.permissions],
  inputSchema: { ...summary.inputSchema },
  outputSchema: { ...summary.outputSchema },
  limits: { ...summary.limits },
  provenance: { ...summary.provenance },
  plugin: { runtime: "server", isolation: "process", auditEvents: [] },
});

const buildVersionedSchema = (id: string, value: string): PluginAssetSchema => {
  const trimmed = value.trim();
  if (trimmed.length === 0)
    return { id, version: 1, schema: { type: DefaultSchemaType } };
  const parsed: unknown = JSON.parse(trimmed);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid schema contract for ${id}.`);
  }
  return { id, version: 1, schema: parsed as Record<string, unknown> };
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
      capabilities: readStrings(asset["capabilities"], "capabilities"),
      permissions: readStrings(asset["permissions"], "permissions"),
      limits: readLimits(asset["limits"]),
      inputSchema: readSchema(asset["inputSchema"], "inputSchema"),
      outputSchema: readSchema(asset["outputSchema"], "outputSchema"),
      provenance: readProvenance(asset["provenance"]),
      auditEvents: readAuditEvents(plugin["auditEvents"]),
    },
  ];
};

const readLimits = (value: unknown): PluginAssetSummary["limits"] => {
  const limits = readRecord(value, "pluginAsset.limits");
  return {
    executions: readPositiveInteger(limits["executions"], "limits.executions"),
    timeoutMs: readPositiveInteger(limits["timeoutMs"], "limits.timeoutMs"),
  };
};

const readSchema = (value: unknown, label: string): PluginAssetSchema => {
  const schema = readRecord(value, `pluginAsset.${label}`);
  const inner = schema["schema"];
  if (inner === null || typeof inner !== "object" || Array.isArray(inner))
    throw new Error(`Invalid pluginAsset.${label}.schema`);
  return {
    id: readString(schema["id"], `${label}.id`),
    version: readPositiveInteger(schema["version"], `${label}.version`),
    schema: { ...(inner as Record<string, unknown>) },
  };
};

const readProvenance = (value: unknown): PluginAssetSummary["provenance"] => {
  const provenance = readRecord(value, "pluginAsset.provenance");
  return {
    source: readString(provenance["source"], "provenance.source"),
    artifactFingerprint: readString(
      provenance["artifactFingerprint"],
      "provenance.artifactFingerprint",
    ),
    registeredAt: readString(
      provenance["registeredAt"],
      "provenance.registeredAt",
    ),
  };
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
const readPositiveInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw new Error(`Invalid pluginAsset.${label}`);
  return value;
};
const readStatus = (value: unknown): PluginAssetStatus => {
  if (value === "disabled" || value === "enabled" || value === "error")
    return value;
  throw new Error("Invalid pluginAsset.status");
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const dedupeStrings = (
  values: ReadonlyArray<string>,
): ReadonlyArray<string> => [
  ...new Set(
    values.map((value) => value.trim()).filter((value) => value.length > 0),
  ),
];
