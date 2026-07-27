import { describe, expect, it } from "vitest";
import {
  parsePromptVariableDefinitions,
  formatPromptVariableDefinitions,
  selectPromptAssetVersion,
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

  it("normalizes legacy Phase 0 string variables into required string schemas", () => {
    expect(
      parsePromptAssetsResponse({
        assets: [
          {
            id: "prompt-legacy",
            kind: "prompt",
            name: "Legacy reply",
            status: "enabled",
            prompt: {
              activeVersion: 1,
              versions: [
                {
                  version: 1,
                  template: "Hello {{customer}} in {{locale}}",
                  variables: ["customer", "locale"],
                },
              ],
            },
          },
        ],
      }),
    ).toMatchObject([
      {
        id: "prompt-legacy",
        variables: [
          {
            name: "customer",
            required: true,
            schema: {
              id: "prompt-variable-customer",
              version: 1,
              schema: { type: "string" },
            },
          },
          {
            name: "locale",
            required: true,
            schema: {
              id: "prompt-variable-locale",
              version: 1,
              schema: { type: "string" },
            },
          },
        ],
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

  it("preserves the selected immutable version on reload and serializes typed variables", () => {
    const asset = parsePromptAssetsResponse({
      assets: [
        {
          id: "prompt-1",
          kind: "prompt",
          name: "Support reply",
          status: "enabled",
          prompt: {
            activeVersion: 2,
            versions: [
              { version: 1, template: "Old", variables: [] },
              {
                version: 2,
                template: "Hello {{count}}",
                variables: [
                  {
                    name: "count",
                    required: true,
                    schema: {
                      id: "prompt-variable-count",
                      version: 1,
                      schema: { type: "number" },
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    })[0];

    expect(selectPromptAssetVersion(asset, 1)).toMatchObject({
      version: 1,
      template: "Old",
    });
    expect(parsePromptVariableDefinitions("count:number:required")).toEqual([
      {
        name: "count",
        required: true,
        schema: {
          id: "prompt-variable-count",
          version: 1,
          schema: { type: "number" },
        },
      },
    ]);
    expect(
      formatPromptVariableDefinitions(
        parsePromptVariableDefinitions("count:number:required"),
      ),
    ).toBe("count:number:required");
  });
});
