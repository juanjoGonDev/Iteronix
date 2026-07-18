import { describe, expect, it } from "vitest";
import { summarizePromptAssetUsage } from "./prompt-asset-usage.js";

describe("prompt asset usage", () => {
  it("derives stable usage and a fingerprint from version-pinned workflow nodes", () => {
    const usage = summarizePromptAssetUsage({
      assetId: "prompt-support",
      definitions: [
        workflow({
          id: "workflow-support",
          name: "Support",
          nodes: [
            node("node-reply", "Reply", "prompt-support", 2),
            node("node-other", "Other", "prompt-other", 1),
          ],
        }),
        workflow({
          id: "workflow-sales",
          name: "Sales",
          nodes: [node("node-email", "Email", "prompt-support", 1)],
        }),
      ],
    });

    expect(usage).toMatchObject({
      workflowCount: 2,
      nodeCount: 2,
      usages: [
        {
          workflowId: "workflow-sales",
          nodeId: "node-email",
          promptVersion: 1,
        },
        {
          workflowId: "workflow-support",
          nodeId: "node-reply",
          promptVersion: 2,
        },
      ],
    });
    expect(usage.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});

const workflow = (input: {
  id: string;
  name: string;
  nodes: ReadonlyArray<ReturnType<typeof node>>;
}) => ({
  id: input.id,
  name: input.name,
  nodes: input.nodes,
});

const node = (id: string, label: string, assetId: string, version: number) => ({
  id,
  label,
  config: { promptAsset: { assetId, version, bindings: {} } },
});
