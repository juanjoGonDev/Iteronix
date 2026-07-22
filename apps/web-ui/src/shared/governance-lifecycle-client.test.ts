import { describe, expect, it } from "vitest";
import {
  createGovernanceLifecycleClient,
  parseGovernanceLifecycleResponse,
  redactLifecyclePromptBindings,
} from "./governance-lifecycle-client.js";

const OpenAiApiKeyBinding = "OpenAI API Key";

describe("prompt execution binding redaction", () => {
  it("redacts secret-bearing binding values while preserving normal values", () => {
    expect(
      redactLifecyclePromptBindings({
        customerName: "Ada",
        retryCount: 2,
        secret: "secret-value",
        accessToken: "token-value",
        database_password: "password-value",
        apiKey: "api-key-value",
        [OpenAiApiKeyBinding]: "openai-key-value",
      }),
    ).toEqual({
      customerName: "Ada",
      retryCount: 2,
      secret: "[REDACTED]",
      accessToken: "[REDACTED]",
      database_password: "[REDACTED]",
      apiKey: "[REDACTED]",
      [OpenAiApiKeyBinding]: "[REDACTED]",
    });
  });
});

describe("governance lifecycle skill provenance", () => {
  it("parses governed skill provenance for the execution inspector", () => {
    expect(
      parseGovernanceLifecycleResponse({
        lifecycle: {
          id: "lifecycle-1",
          state: "Approved",
          budgets: {},
          transitions: [],
          promptExecutions: [],
          agentExecutions: [
            {
              agentId: "agent-1",
              skillId: "skill-support",
              skillVersion: 2,
              artifactFingerprint: "skill-fingerprint",
            },
          ],
        },
      }),
    ).toMatchObject({
      agentExecutions: [
        {
          agentId: "agent-1",
          skillId: "skill-support",
          skillVersion: 2,
          artifactFingerprint: "skill-fingerprint",
        },
      ],
    });
  });
});

describe("governance lifecycle controls", () => {
  it("sends credentialed approval controls and parses the UI-safe lifecycle", async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    const requests: Array<RequestInit> = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "http://localhost:5173" } },
    });
    globalThis.fetch = async (_input, init) => {
      requests.push(init ?? {});
      return new Response(
        JSON.stringify({
          lifecycle: {
            id: "lifecycle-1",
            state: "approved",
            budgets: {},
            transitions: [],
            promptExecutions: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    try {
      const lifecycle = await createGovernanceLifecycleClient().approve({
        lifecycleId: "lifecycle-1",
        reason: "Evidence accepted",
      });
      expect(lifecycle.state).toBe("approved");
      expect(requests[0]).toMatchObject({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          lifecycleId: "lifecycle-1",
          reason: "Evidence accepted",
        }),
      });
    } finally {
      globalThis.fetch = originalFetch;
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});

describe("governance lifecycle retrieval provenance", () => {
  it("parses metadata-only redacted retrieval traces for the inspector", () => {
    expect(
      parseGovernanceLifecycleResponse({
        lifecycle: {
          id: "lifecycle-1",
          state: "Approved",
          budgets: {},
          transitions: [],
          promptExecutions: [],
          agentExecutions: [],
          retrievalExecutions: [
            {
              assetId: "memory-1",
              scope: "tenant/workflow",
              workflowId: "workflow-1",
              documentCount: 2,
              provenanceFingerprint: "retrieval-fingerprint",
              redacted: true,
              timestamp: "2026-07-21T20:00:00.000Z",
            },
          ],
        },
      }),
    ).toMatchObject({
      retrievalExecutions: [
        { assetId: "memory-1", documentCount: 2, redacted: true },
      ],
    });
  });
});

describe("governance lifecycle MCP provenance", () => {
  it("parses MCP metadata from agent provenance without untrusted response content", () => {
    expect(
      parseGovernanceLifecycleResponse({
        lifecycle: {
          id: "lifecycle-1",
          state: "Approved",
          budgets: {},
          transitions: [],
          promptExecutions: [],
          agentExecutions: [
            {
              agentId: "agent-1",
              mcpAssetId: "mcp-1",
              mcpServerId: "search-server",
              mcpToolVersion: "2.0.0",
              responseFingerprint: "mcp-fingerprint",
            },
          ],
        },
      }),
    ).toMatchObject({
      agentExecutions: [
        {
          mcpAssetId: "mcp-1",
          mcpServerId: "search-server",
          mcpToolVersion: "2.0.0",
        },
      ],
    });
  });
});

describe("reference asset acceptance provenance", () => {
  it("keeps reference Skill, Plugin, MCP, and redacted RAG evidence available to the inspector", () => {
    const lifecycle = parseGovernanceLifecycleResponse({
      lifecycle: {
        id: "lifecycle-reference-assets",
        state: "awaiting-user-approval",
        budgets: { execution: { remaining: 0 } },
        transitions: [],
        promptExecutions: [],
        agentExecutions: [
          {
            agentId: "reference-agent",
            skillId: "knowledge.query",
            skillVersion: 1,
            artifactFingerprint: "skill-fingerprint",
            mcpAssetId: "mcp-knowledge",
            mcpServerId: "reference-knowledge",
            mcpToolVersion: "1.0.0",
            responseFingerprint: "mcp-response-fingerprint",
          },
          {
            agentId: "reference-agent",
            skillId: "plugin-1",
            skillVersion: 1,
            pluginAssetId: "plugin-1",
            pluginVersion: "1",
            pluginFingerprint: "plugin-fingerprint",
            pluginIsolation: "process",
            pluginAuditAction: "invoked",
          },
        ],
        retrievalExecutions: [
          {
            assetId: "memory-reference",
            scope: "tenant-1:workflow-1",
            workflowId: "workflow-1",
            documentCount: 1,
            provenanceFingerprint: "retrieval-fingerprint",
            redacted: true,
            timestamp: "2026-07-22T00:00:00.000Z",
            content: "retrieved document content",
          },
        ],
      },
    });

    expect(lifecycle).toMatchObject({
      id: "lifecycle-reference-assets",
      agentExecutions: [
        {
          skillId: "knowledge.query",
          mcpAssetId: "mcp-knowledge",
          mcpServerId: "reference-knowledge",
          mcpToolVersion: "1.0.0",
        },
        {
          pluginAssetId: "plugin-1",
          pluginIsolation: "process",
          pluginAuditAction: "invoked",
        },
      ],
      retrievalExecutions: [
        {
          assetId: "memory-reference",
          documentCount: 1,
          redacted: true,
        },
      ],
    });
    expect(JSON.stringify(lifecycle)).not.toContain(
      "retrieved document content",
    );
  });
});
