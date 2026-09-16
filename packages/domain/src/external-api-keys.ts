export const ExternalApiKeyScopeKind = {
  AllWorkflows: "all_workflows",
  SelectedWorkflows: "selected_workflows",
} as const;

export const ExternalWorkflowOperation = {
  WorkflowRead: "workflow.read",
  WorkflowInvoke: "workflow.invoke",
  WorkflowTrigger: "workflow.trigger",
  RunStatus: "run.status",
  RunApprove: "run.approve",
  RunTrace: "run.trace",
} as const;

export type ExternalWorkflowOperation =
  (typeof ExternalWorkflowOperation)[keyof typeof ExternalWorkflowOperation];

export const ExternalWorkflowRateLimit = {
  DefaultPerMinute: 60,
  MinimumPerMinute: 1,
  MaximumPerMinute: 600,
  isValid: (value: number): boolean =>
    Number.isInteger(value) &&
    value >= ExternalWorkflowRateLimit.MinimumPerMinute &&
    value <= ExternalWorkflowRateLimit.MaximumPerMinute,
} as const;

export type ExternalApiKeyScope =
  | { kind: typeof ExternalApiKeyScopeKind.AllWorkflows }
  | {
      kind: typeof ExternalApiKeyScopeKind.SelectedWorkflows;
      workflowIds: ReadonlyArray<string>;
    };

export type ExternalApiKeyRecord = {
  id: string;
  name: string;
  scope: ExternalApiKeyScope;
  secretHash: string;
  createdAt: string;
  operations?: ReadonlyArray<ExternalWorkflowOperation>;
  expiresAt?: string;
  rateLimitPerMinute?: number;
  generation?: number;
  lastUsedAt?: string;
  revokedAt?: string;
};

export type ExternalApiKeyView = Omit<ExternalApiKeyRecord, "secretHash">;

export const isExternalWorkflowCredentialValid = (
  key: ExternalApiKeyRecord,
  now: string,
): boolean =>
  !key.revokedAt &&
  (!key.expiresAt ||
    new Date(key.expiresAt).getTime() > new Date(now).getTime());

export const isExternalWorkflowCredentialAuthorized = (
  key: ExternalApiKeyRecord,
  operation: string,
  workflowId: string,
  now: string = new Date().toISOString(),
): boolean =>
  isExternalWorkflowOperation(operation) &&
  isExternalWorkflowCredentialValid(key, now) &&
  (key.operations ?? defaultExternalWorkflowOperations()).includes(operation) &&
  isWorkflowAllowedForExternalApiKey(key, workflowId);

export const isWorkflowAllowedForExternalApiKey = (
  key: ExternalApiKeyRecord,
  workflowId: string,
): boolean =>
  !key.revokedAt &&
  (key.scope.kind === ExternalApiKeyScopeKind.AllWorkflows ||
    key.scope.workflowIds.includes(workflowId));

export const toExternalApiKeyView = (
  key: ExternalApiKeyRecord,
): ExternalApiKeyView => {
  const { secretHash: _secretHash, ...view } = key;
  return view;
};

export const isExternalApiKeyNameAvailable = (
  keys: ReadonlyArray<ExternalApiKeyRecord>,
  name: string,
  excludedKeyId?: string,
): boolean => {
  const normalizedName = name.trim().toLocaleLowerCase();
  return !keys.some(
    (key) =>
      key.id !== excludedKeyId &&
      key.name.trim().toLocaleLowerCase() === normalizedName,
  );
};

export const readWorkflowExternalApiKeyDependencies = (
  keys: ReadonlyArray<ExternalApiKeyRecord>,
  workflowId: string,
): ReadonlyArray<ExternalApiKeyView> =>
  keys
    .filter(
      (key) =>
        key.scope.kind === ExternalApiKeyScopeKind.SelectedWorkflows &&
        key.scope.workflowIds.includes(workflowId),
    )
    .map(toExternalApiKeyView);

export const revokeExternalApiKeysForWorkflow = (input: {
  keys: ReadonlyArray<ExternalApiKeyRecord>;
  workflowId: string;
  revokedAt: string;
}): {
  keys: ReadonlyArray<ExternalApiKeyRecord>;
  revoked: ReadonlyArray<ExternalApiKeyView>;
} => {
  const revoked: ExternalApiKeyView[] = [];
  const keys = input.keys.map((key) => {
    const isDependent =
      key.scope.kind === ExternalApiKeyScopeKind.SelectedWorkflows &&
      key.scope.workflowIds.includes(input.workflowId);
    if (!isDependent || key.revokedAt) {
      return key;
    }

    const next = { ...key, revokedAt: input.revokedAt };
    revoked.push(toExternalApiKeyView(next));
    return next;
  });

  return { keys, revoked };
};

const isExternalWorkflowOperation = (
  value: string,
): value is ExternalWorkflowOperation =>
  Object.values(ExternalWorkflowOperation).includes(
    value as ExternalWorkflowOperation,
  );

const defaultExternalWorkflowOperations =
  (): ReadonlyArray<ExternalWorkflowOperation> => [
    ExternalWorkflowOperation.WorkflowRead,
    ExternalWorkflowOperation.WorkflowInvoke,
  ];
