import { describe, expect, it } from "vitest";
import {
  createPromptAssetRecord,
  parsePromptAssetUsageResponse,
  parsePromptAssetsResponse,
} from "./prompt-assets-client.js";

describe("prompt assets client", () => {
  it("filters non-prompt assets while preserving prompt identity and active version", () => {
    expect(
      parsePromptAssetsResponse({
        assets: [
          {
            id: "agent-1",
            kind: "agent",
            name: "Agent",
            status: "enabled",
            prompt: { activeVersion: 1 },
          },
          {
            id: "prompt-1",
            kind: "prompt",
            name: "Support reply",
            status: "enabled",
            prompt: {
              activeVersion: 3,
              versions: [{ version: 3, template: "Hello" }],
            },
          },
        ],
      }),
    ).toEqual([
      {
        id: "prompt-1",
        name: "Support reply",
        status: "enabled",
        activeVersion: 3,
        template: "Hello",
        variables: [],
        versions: [{ version: 3, template: "Hello", variables: [] }],
        asset: {
          id: "prompt-1",
          kind: "prompt",
          name: "Support reply",
          status: "enabled",
          prompt: {
            activeVersion: 3,
            versions: [{ version: 3, template: "Hello" }],
          },
        },
      },
    ]);
  });
});

describe("prompt asset usage response", () => {
  it("parses a server-derived usage summary with direct workflow node metadata", () => {
    expect(
      parsePromptAssetUsageResponse({
        assetId: "prompt-1",
        workflowCount: 1,
        nodeCount: 1,
        fingerprint: "a".repeat(64),
        usages: [
          {
            workflowId: "workflow-1",
            workflowName: "Support",
            nodeId: "node-1",
            nodeLabel: "Reply",
            promptVersion: 2,
          },
        ],
      }),
    ).toMatchObject({
      assetId: "prompt-1",
      workflowCount: 1,
      nodeCount: 1,
      usages: [{ workflowId: "workflow-1", nodeId: "node-1" }],
    });
  });
});

describe("prompt asset payloads", () => {
  it("creates a complete first immutable version for an IDE-authenticated save", () => {
    expect(
      createPromptAssetRecord({
        id: "prompt-1",
        name: "Support reply",
        template: "Hello {{customer}}",
        now: "2026-07-18T10:00:00.000Z",
      }),
    ).toMatchObject({
      id: "prompt-1",
      kind: "prompt",
      prompt: {
        activeVersion: 1,
        versions: [{ version: 1, template: "Hello {{customer}}" }],
      },
    });
  });
});
