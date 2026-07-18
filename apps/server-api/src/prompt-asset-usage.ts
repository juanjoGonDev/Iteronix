import { createHash } from "node:crypto";
export type PromptAssetUsage = {
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeLabel: string;
  promptVersion: number;
};

export type PromptAssetUsageSummary = {
  assetId: string;
  workflowCount: number;
  nodeCount: number;
  fingerprint: string;
  usages: ReadonlyArray<PromptAssetUsage>;
};

export const summarizePromptAssetUsage = (input: {
  assetId: string;
  definitions: ReadonlyArray<{
    id: string;
    name: string;
    nodes: ReadonlyArray<{
      id: string;
      label: string;
      config: {
        promptAsset?: {
          assetId: string;
          version: number;
        };
      };
    }>;
  }>;
}): PromptAssetUsageSummary => {
  const usages = input.definitions
    .flatMap((definition) =>
      definition.nodes.flatMap((node) => {
        const prompt = node.config.promptAsset;
        return prompt?.assetId === input.assetId
          ? [
              {
                workflowId: definition.id,
                workflowName: definition.name,
                nodeId: node.id,
                nodeLabel: node.label,
                promptVersion: prompt.version,
              },
            ]
          : [];
      }),
    )
    .sort(comparePromptAssetUsage);
  const workflowCount = new Set(usages.map((usage) => usage.workflowId)).size;

  return {
    assetId: input.assetId,
    workflowCount,
    nodeCount: usages.length,
    fingerprint: createUsageFingerprint(input.assetId, usages),
    usages,
  };
};

const comparePromptAssetUsage = (
  left: PromptAssetUsage,
  right: PromptAssetUsage,
): number =>
  left.workflowId.localeCompare(right.workflowId) ||
  left.nodeId.localeCompare(right.nodeId) ||
  left.promptVersion - right.promptVersion;

const createUsageFingerprint = (
  assetId: string,
  usages: ReadonlyArray<PromptAssetUsage>,
): string =>
  createHash("sha256")
    .update(JSON.stringify({ assetId, usages }))
    .digest("hex");
