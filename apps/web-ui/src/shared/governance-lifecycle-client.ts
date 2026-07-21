import { readBackendOrigin } from "./backend-origin.js";

const LifecycleGetPath = "/governance/lifecycles/get";
const RedactedBindingValue = "[REDACTED]";
const SensitiveBindingKeyFragments = [
  "secret",
  "token",
  "password",
  "apikey",
] as const;

const requestJson = <TResult>(input: {
  path: string;
  body: Readonly<Record<string, unknown>>;
  parse: (value: unknown) => TResult;
}): Promise<TResult> => requestCredentialedJson(input);

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
  const payload = await readCredentialedJson(response);
  if (!response.ok)
    throw new Error(readCredentialedError(payload, response.status));
  return input.parse(payload);
};

const readCredentialedJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};
const readCredentialedError = (value: unknown, status: number): string =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as Record<string, unknown>)["message"] === "string"
    ? ((value as Record<string, unknown>)["message"] as string)
    : `Request failed with status ${status}`;

type PromptExecutionTrace = {
  assetId: string;
  version: number;
  bindings: Readonly<Record<string, unknown>>;
  renderedFingerprint: string;
  validation: "passed";
  timestamp: string;
};

type AgentExecutionTrace = {
  agentId: string;
  skillId: string | null;
  skillVersion: number | null;
  artifactFingerprint: string | null;
  responseFingerprint: string | null;
  mcpAssetId: string | null;
  mcpServerId: string | null;
  mcpToolVersion: string | null;
};

type RetrievalExecutionTrace = {
  assetId: string;
  scope: string;
  workflowId: string | null;
  documentCount: number;
  provenanceFingerprint: string;
  redacted: boolean;
  timestamp: string;
};

export type GovernanceLifecycleTrace = {
  id: string;
  state: string;
  budgets: Readonly<Record<string, unknown>>;
  transitions: ReadonlyArray<unknown>;
  promptExecutions: ReadonlyArray<PromptExecutionTrace>;
  agentExecutions: ReadonlyArray<AgentExecutionTrace>;
  retrievalExecutions: ReadonlyArray<RetrievalExecutionTrace>;
};

export const redactLifecyclePromptBindings = (
  bindings: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(bindings)) {
    redacted[key] = isSensitivePromptBindingKey(key)
      ? RedactedBindingValue
      : value;
  }
  return redacted;
};

export const createGovernanceLifecycleClient = () => ({
  get: (lifecycleId: string): Promise<GovernanceLifecycleTrace> =>
    requestJson({
      path: LifecycleGetPath,
      body: { lifecycleId },
      parse: parseGovernanceLifecycleResponse,
    }),
});

export const parseGovernanceLifecycleResponse = (
  value: unknown,
): GovernanceLifecycleTrace => {
  const response = readRecord(value, "governanceLifecycleResponse");
  const lifecycle = readRecord(response["lifecycle"], "lifecycle");
  const promptExecutions: ReadonlyArray<PromptExecutionTrace> = readArray(
    lifecycle["promptExecutions"],
    "promptExecutions",
  ).map((entry) => {
    const record = readRecord(entry, "promptExecution");
    const validation = readString(record["validation"], "validation");
    if (validation !== "passed") {
      throw new Error("Invalid prompt execution validation");
    }
    return {
      assetId: readString(record["assetId"], "assetId"),
      version: readPositiveInteger(record["version"], "version"),
      bindings: readRecord(record["bindings"], "bindings"),
      renderedFingerprint: readString(
        record["renderedFingerprint"],
        "renderedFingerprint",
      ),
      validation: "passed",
      timestamp: readString(record["timestamp"], "timestamp"),
    };
  });
  const agentExecutions = readOptionalArray(lifecycle["agentExecutions"]).map(
    (entry) => {
      const record = readRecord(entry, "agentExecution");
      return {
        agentId: readString(record["agentId"], "agentId"),
        skillId: readOptionalString(record["skillId"]),
        skillVersion: readOptionalPositiveInteger(record["skillVersion"]),
        artifactFingerprint: readOptionalString(record["artifactFingerprint"]),
        responseFingerprint: readOptionalString(record["responseFingerprint"]),
        mcpAssetId: readOptionalString(record["mcpAssetId"]),
        mcpServerId: readOptionalString(record["mcpServerId"]),
        mcpToolVersion: readOptionalString(record["mcpToolVersion"]),
      };
    },
  );
  const retrievalExecutions = readOptionalArray(
    lifecycle["retrievalExecutions"],
  ).map((entry) => {
    const record = readRecord(entry, "retrievalExecution");
    const documentCount = record["documentCount"];
    if (
      typeof documentCount !== "number" ||
      !Number.isInteger(documentCount) ||
      documentCount < 0
    )
      throw new Error("Invalid retrieval execution documentCount");
    const redacted = record["redacted"];
    if (typeof redacted !== "boolean")
      throw new Error("Invalid retrieval execution redacted");
    return {
      assetId: readString(record["assetId"], "assetId"),
      scope: readString(record["scope"], "scope"),
      workflowId: readOptionalString(record["workflowId"]),
      documentCount,
      provenanceFingerprint: readString(
        record["provenanceFingerprint"],
        "provenanceFingerprint",
      ),
      redacted,
      timestamp: readString(record["timestamp"], "timestamp"),
    };
  });
  return {
    id: readString(lifecycle["id"], "id"),
    state: readString(lifecycle["state"], "state"),
    budgets: readRecord(lifecycle["budgets"], "budgets"),
    transitions: readArray(lifecycle["transitions"], "transitions"),
    promptExecutions,
    agentExecutions,
    retrievalExecutions,
  };
};

const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
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

const readOptionalArray = (value: unknown): ReadonlyArray<unknown> =>
  value === undefined ? [] : readArray(value, "agentExecutions");

const readString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
};

const readPositiveInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
};

const readOptionalString = (value: unknown): string | null =>
  value === undefined || value === null ? null : readString(value, "optional");

const readOptionalPositiveInteger = (value: unknown): number | null =>
  value === undefined || value === null
    ? null
    : readPositiveInteger(value, "optional");

const isSensitivePromptBindingKey = (key: string): boolean => {
  const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return SensitiveBindingKeyFragments.some((fragment) =>
    normalizedKey.includes(fragment),
  );
};
