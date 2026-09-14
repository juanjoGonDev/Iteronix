import type {
  ExternalApiKeyScope,
  ExternalWorkflowOperation,
} from "../shared/settings-client.js";

export const ExternalApiKeyScopeSelection = {
  AllWorkflows: "all_workflows",
  SelectedWorkflows: "selected_workflows",
} as const;

export type ExternalApiKeyScopeSelection =
  (typeof ExternalApiKeyScopeSelection)[keyof typeof ExternalApiKeyScopeSelection];

export const ExternalWorkflowCredentialDefaultRateLimit = 60;

export const ExternalWorkflowCredentialOperations = [
  "workflow.read",
  "workflow.invoke",
  "workflow.trigger",
  "run.status",
  "run.approve",
  "run.trace",
] as const satisfies ReadonlyArray<ExternalWorkflowOperation>;

export const ExternalWorkflowCredentialDefaultOperations = [
  "workflow.read",
  "workflow.invoke",
] as const satisfies ReadonlyArray<ExternalWorkflowOperation>;

export type ExternalWorkflowCredentialDraft = {
  name: string;
  scope: ExternalApiKeyScopeSelection;
  workflowIds: ReadonlyArray<string>;
  operations: ReadonlyArray<ExternalWorkflowOperation>;
  expiresAt: string;
  rateLimitPerMinute: number;
};

export type ExternalWorkflowCredentialSecret = {
  credentialId: string;
  plaintextCredential: string;
};

export const createExternalWorkflowCredentialDraft =
  (): ExternalWorkflowCredentialDraft => ({
    name: "",
    scope: ExternalApiKeyScopeSelection.AllWorkflows,
    workflowIds: [],
    operations: ExternalWorkflowCredentialDefaultOperations,
    expiresAt: "",
    rateLimitPerMinute: ExternalWorkflowCredentialDefaultRateLimit,
  });

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

export const readExternalWorkflowCredentialCreateInput = (
  draft: ExternalWorkflowCredentialDraft,
): {
  name: string;
  scope: ExternalApiKeyScope;
  operations: ReadonlyArray<ExternalWorkflowOperation>;
  expiresAt?: string;
  rateLimitPerMinute: number;
} => ({
  name: draft.name.trim(),
  scope: readExternalApiKeyScope(draft.scope, draft.workflowIds),
  operations: readDistinctOperations(draft.operations),
  ...readExternalWorkflowCredentialExpiry(draft.expiresAt),
  rateLimitPerMinute: draft.rateLimitPerMinute,
});

export const showExternalWorkflowCredentialSecret = (
  value: ExternalWorkflowCredentialSecret,
): ExternalWorkflowCredentialSecret => value;

export const dismissExternalWorkflowCredentialSecret = (
  _value: ExternalWorkflowCredentialSecret | null,
): null => null;

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

const readDistinctOperations = (
  operations: ReadonlyArray<ExternalWorkflowOperation>,
): ReadonlyArray<ExternalWorkflowOperation> => Array.from(new Set(operations));

const readExternalWorkflowCredentialExpiry = (
  value: string,
): Partial<Pick<ExternalWorkflowCredentialDraft, "expiresAt">> => {
  const expiresAt = value.trim();
  if (!expiresAt) {
    return {};
  }

  const timestamp = new Date(expiresAt);
  return Number.isNaN(timestamp.getTime())
    ? { expiresAt }
    : { expiresAt: timestamp.toISOString() };
};
