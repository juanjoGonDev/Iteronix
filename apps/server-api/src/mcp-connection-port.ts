import type {
  ArtifactProvenance,
  McpToolResult,
} from "../../../packages/domain/src/agent-tool-contracts";
import type { JsonValue } from "../../../packages/domain/src/governance-validation";

export type McpConnectionBinding = {
  assetId: string;
  serverId: string;
  toolVersion: string;
};

export type ServerMcpConnectionPort = {
  invoke: (input: {
    connection: McpConnectionBinding;
    toolId: string;
    input: JsonValue;
    provenance: ArtifactProvenance;
  }) => Promise<McpToolResult>;
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
};
