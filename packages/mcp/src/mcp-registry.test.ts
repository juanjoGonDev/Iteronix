import { describe, expect, it } from "vitest";
import {
  McpTransportKind,
  createIteronixMcpServer,
  createMcpClientConnection,
  createStaticMcpServerRegistry
} from "./index";

describe("mcp integration", () => {
  it("creates MCP server and client adapters for Iteronix capabilities", () => {
    const registry = createStaticMcpServerRegistry({
      skills: ["example-skill"],
      memorySessions: ["session-1"]
    });
    const mcpServer = createIteronixMcpServer({
      registry,
      handlers: {
        runSkill: async () => ({ traceId: "trace-1", answer: "ok" }),
        queryMemory: async () => ({ sessionId: "session-1", items: [] }),
        runEvaluation: async () => ({ datasetId: "dataset-1", passed: true })
      }
    });
    const connection = createMcpClientConnection({
      name: "demo",
      transport: McpTransportKind.Sse,
      url: "http://localhost:65535/sse"
    });

    expect(typeof mcpServer.connect).toBe("function");
    expect(typeof connection.client.connect).toBe("function");
    expect(typeof connection.transport.send).toBe("function");
  });
});
