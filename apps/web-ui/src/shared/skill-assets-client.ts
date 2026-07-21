import { readBackendOrigin } from "./backend-origin.js";

const EndpointPath = {
  List: "/assets/list",
  Upsert: "/assets/upsert",
  Delete: "/assets/delete",
} as const;
const AssetKind = "skill";
const DefaultTimeoutMs = 30_000;

export type SkillAssetSummary = {
  id: string;
  name: string;
  status: "disabled" | "enabled" | "error";
  version: number;
  lifecycle: string;
  description: string;
  permissions: ReadonlyArray<string>;
  asset: Record<string, unknown>;
};

export type SkillAssetsClient = {
  list: () => Promise<ReadonlyArray<SkillAssetSummary>>;
  upsert: (asset: Record<string, unknown>) => Promise<SkillAssetSummary>;
  delete: (assetId: string) => Promise<void>;
};

export const createSkillAssetsClient = (): SkillAssetsClient => ({
  list: () =>
    requestCredentialedJson({
      path: EndpointPath.List,
      body: {},
      parse: parseSkillAssetsResponse,
    }),
  upsert: (asset) =>
    requestCredentialedJson({
      path: EndpointPath.Upsert,
      body: asset,
      parse: parseSkillAssetResponse,
    }),
  delete: async (assetId) => {
    await requestCredentialedJson({
      path: EndpointPath.Delete,
      body: { assetId },
      parse: () => undefined,
    });
  },
});

export const selectEnabledSkillAssets = (
  skills: ReadonlyArray<SkillAssetSummary>,
): ReadonlyArray<SkillAssetSummary> =>
  skills.filter((skill) => skill.status === "enabled");

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

export const createSkillAssetRecord = (input: {
  id: string;
  name: string;
  description: string;
  permissions: ReadonlyArray<string>;
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
    capabilities: [],
    permissions: [...input.permissions],
    inputSchema: { id: "skill-input", version: 1, schema: { type: "object" } },
    outputSchema: {
      id: "skill-output",
      version: 1,
      schema: { type: "object" },
    },
    limits: { executions: 1, timeoutMs: DefaultTimeoutMs },
    provenance,
    skill: {
      version: 1,
      lifecycle: "enabled",
      description: input.description,
      provenance,
    },
  };
};

export const updateSkillAssetRecord = (input: {
  asset: SkillAssetSummary;
  name: string;
  description: string;
  permissions: ReadonlyArray<string>;
  now: string;
}): Record<string, unknown> => {
  const previous = input.asset.asset;
  const previousSkill = readRecord(previous["skill"], "skill");
  const provenance = {
    ...readRecord(previous["provenance"], "skill.provenance"),
    registeredAt: input.now,
  };
  const next: Record<string, unknown> = {
    ...previous,
    name: input.name,
    permissions: [...input.permissions],
    provenance,
  };
  const version = input.asset.version + 1;
  return {
    ...next,
    skill: {
      ...previousSkill,
      version,
      lifecycle: input.asset.status,
      description: input.description,
      versions: [
        ...readArray(previousSkill["versions"], "skill.versions"),
        {
          version,
          capabilities: readArray(next["capabilities"], "skill.capabilities"),
          permissions: [...input.permissions],
          inputSchema: readRecord(next["inputSchema"], "skill.inputSchema"),
          outputSchema: readRecord(next["outputSchema"], "skill.outputSchema"),
          limits: readRecord(next["limits"], "skill.limits"),
          provenance,
          createdAt: input.now,
        },
      ],
    },
  };
};

export const parseSkillAssetsResponse = (
  value: unknown,
): ReadonlyArray<SkillAssetSummary> => {
  const response = readRecord(value, "skillAssetsResponse");
  const assets = response["assets"];
  if (!Array.isArray(assets))
    throw new Error("Invalid skillAssetsResponse.assets");
  return assets.flatMap(parseSkillAssetSummary);
};

const parseSkillAssetResponse = (value: unknown): SkillAssetSummary => {
  const response = readRecord(value, "skillAssetResponse");
  const asset = parseSkillAssetSummary(response["asset"])[0];
  if (!asset) throw new Error("Invalid skillAssetResponse.asset");
  return asset;
};

const parseSkillAssetSummary = (
  value: unknown,
): ReadonlyArray<SkillAssetSummary> => {
  const asset = readRecord(value, "skillAsset");
  if (asset["kind"] !== AssetKind) return [];
  const skill = readRecord(asset["skill"], "skillAsset.skill");
  const id = readString(asset["id"], "id");
  const name = readString(asset["name"], "name");
  const status = readStatus(asset["status"]);
  const version = readPositiveInteger(skill["version"], "version");
  const lifecycle = readString(skill["lifecycle"], "lifecycle");
  const description = readOptionalDescription(skill["description"]);
  const permissions = readStrings(asset["permissions"], "permissions");
  return [
    { id, name, status, version, lifecycle, description, permissions, asset },
  ];
};

const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
};
const readArray = (value: unknown, label: string): ReadonlyArray<unknown> => {
  if (!Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value;
};
const readString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`Invalid skillAsset.${label}`);
  return value;
};
const readStrings = (value: unknown, label: string): ReadonlyArray<string> => {
  if (!Array.isArray(value)) throw new Error(`Invalid skillAsset.${label}`);
  const entries: ReadonlyArray<unknown> = value;
  return entries.map((item) => readString(item, label));
};
const readPositiveInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
    throw new Error(`Invalid skillAsset.${label}`);
  return value;
};
const readStatus = (value: unknown): SkillAssetSummary["status"] => {
  if (value === "disabled" || value === "enabled" || value === "error")
    return value;
  throw new Error("Invalid skillAsset.status");
};

const readOptionalDescription = (value: unknown): string =>
  typeof value === "string" ? value : "";
