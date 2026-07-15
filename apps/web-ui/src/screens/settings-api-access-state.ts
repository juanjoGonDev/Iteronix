import type { ExternalApiKeyScope } from "../shared/settings-client.js";

export const ExternalApiKeyScopeSelection = {
  AllWorkflows: "all_workflows",
  SelectedWorkflows: "selected_workflows",
} as const;

export type ExternalApiKeyScopeSelection =
  (typeof ExternalApiKeyScopeSelection)[keyof typeof ExternalApiKeyScopeSelection];

export const readExternalApiKeyScope = (
  selection: ExternalApiKeyScopeSelection,
  workflowIds: ReadonlyArray<string>,
): ExternalApiKeyScope => {
  if (selection === ExternalApiKeyScopeSelection.AllWorkflows) {
    return { kind: "all_workflows" };
  }

  return {
    kind: "selected_workflows",
    workflowIds: readDistinctWorkflowIds(workflowIds),
  };
};

const readDistinctWorkflowIds = (
  workflowIds: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Array.from(
    new Set(
      workflowIds
        .map((workflowId) => workflowId.trim())
        .filter((workflowId) => workflowId.length > 0),
    ),
  );
