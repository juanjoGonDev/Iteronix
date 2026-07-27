import type {
  ArtifactProvenance,
  McpToolResult,
} from "../../../packages/domain/src/agent-tool-contracts";
import { McpToolResultStatus } from "../../../packages/domain/src/agent-tool-contracts";
import type { JsonValue } from "../../../packages/domain/src/governance-validation";

export type McpConnectionBinding = {
  assetId: string;
  serverId: string;
  toolVersion: string;
  timeoutMs?: number;
};

export type ServerMcpConnectionPort = {
  invoke: (input: {
    connection: McpConnectionBinding;
    toolId: string;
    input: JsonValue;
    provenance: ArtifactProvenance;
  }) => Promise<McpToolResult>;
};

export type McpServerConfiguration = {
  serverId: string;
  endpoint: string;
  token: string;
  allowedToolIds: ReadonlyArray<string>;
};

export type McpServerTransport = {
  post: (input: {
    endpoint: string;
    token: string;
    body: JsonValue;
    signal: AbortSignal;
  }) => Promise<unknown>;
};

export const createLocalMcpConnectionPort = (input: {
  invoke: (input: {
    toolId: string;
    input: JsonValue;
    provenance: ArtifactProvenance;
  }) => Promise<McpToolResult>;
}): ServerMcpConnectionPort => ({
  invoke: async (request) => {
    assertConnectionBinding(request.connection);
    return input.invoke({
      toolId: request.toolId,
      input: request.input,
      provenance: request.provenance,
    });
  },
});

export const createConfiguredMcpConnectionPort = (input: {
  servers: ReadonlyArray<McpServerConfiguration>;
  transport?: McpServerTransport;
}): ServerMcpConnectionPort => {
  const servers = new Map(
    input.servers.map((server) => [server.serverId, { ...server }]),
  );
  const transport = input.transport ?? createHttpMcpServerTransport();
  return {
    invoke: async (request) => {
      assertConnectionBinding(request.connection);
      const server = servers.get(request.connection.serverId);
      if (!server) {
        throw new Error("MCP server is not configured.");
      }
      if (!server.allowedToolIds.includes(request.toolId)) {
        throw new Error("MCP tool is not configured for this server.");
      }
      return readMcpToolResult(
        await invokeMcpTransport({
          transport,
          endpoint: server.endpoint,
          token: server.token,
          body: {
            toolId: request.toolId,
            input: request.input,
          },
          timeoutMs: readMcpTimeoutMs(request.connection),
        }),
      );
    },
  };
};

const createHttpMcpServerTransport = (): McpServerTransport => ({
  post: async (input) => {
    try {
      const response = await fetch(input.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input.body),
        redirect: "error",
        signal: input.signal,
      });
      if (!response.ok) {
        throw new Error("MCP server request failed.");
      }
      const body: unknown = await response.json();
      return body;
    } catch {
      throw new Error("MCP server request failed.");
    }
  },
});

const DefaultMcpTimeoutMs = 30_000;

const invokeMcpTransport = async (input: {
  transport: McpServerTransport;
  endpoint: string;
  token: string;
  body: JsonValue;
  timeoutMs: number;
}): Promise<unknown> =>
  new Promise<unknown>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const complete = (
      callback: (value: unknown) => void,
      value: unknown,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      controller.abort();
      complete(reject, new Error("MCP server request timed out."));
    }, input.timeoutMs);
    void Promise.resolve()
      .then(() =>
        input.transport.post({
          endpoint: input.endpoint,
          token: input.token,
          body: input.body,
          signal: controller.signal,
        }),
      )
      .then(
        (response) => complete(resolve, response),
        (error: unknown) => complete(reject, error),
      );
  });

const readMcpToolResult = (value: unknown): McpToolResult => {
  if (!isRecord(value) || !isNonEmptyString(value["toolId"])) {
    throw new Error("MCP server returned an invalid response.");
  }
  const status = value["status"];
  const provenance = readMcpProvenance(value["provenance"]);
  if (
    (status !== McpToolResultStatus.Success &&
      status !== McpToolResultStatus.Failure) ||
    !provenance
  ) {
    throw new Error("MCP server returned an invalid response.");
  }
  return {
    toolId: value["toolId"],
    status,
    ...("output" in value ? { output: value["output"] } : {}),
    provenance,
  };
};

const readMcpProvenance = (
  value: unknown,
): McpToolResult["provenance"] | undefined => {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value["serverId"]) ||
    !isNonEmptyString(value["toolVersion"]) ||
    !isNonEmptyString(value["responseFingerprint"])
  ) {
    return undefined;
  }
  return {
    serverId: value["serverId"],
    toolVersion: value["toolVersion"],
    responseFingerprint: value["responseFingerprint"],
  };
};

const assertConnectionBinding = (binding: McpConnectionBinding): void => {
  for (const value of [
    binding.assetId,
    binding.serverId,
    binding.toolVersion,
  ]) {
    if (value.trim().length === 0) {
      throw new Error("MCP connection binding is invalid.");
    }
  }
  if (
    binding.timeoutMs !== undefined &&
    (!Number.isInteger(binding.timeoutMs) || binding.timeoutMs <= 0)
  ) {
    throw new Error("MCP connection binding is invalid.");
  }
};

const readMcpTimeoutMs = (binding: McpConnectionBinding): number =>
  binding.timeoutMs ?? DefaultMcpTimeoutMs;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
