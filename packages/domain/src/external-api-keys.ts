export const ExternalApiKeyScopeKind = {
  AllWorkflows: "all_workflows",
  SelectedWorkflows: "selected_workflows",
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
  lastUsedAt?: string;
  revokedAt?: string;
};

export type ExternalApiKeyView = Omit<ExternalApiKeyRecord, "secretHash">;

export const isWorkflowAllowedForExternalApiKey = (
  key: ExternalApiKeyRecord,
  workflowId: string,
): boolean => {
  if (key.revokedAt) {
    return false;
  }

  return (
    key.scope.kind === ExternalApiKeyScopeKind.AllWorkflows ||
    key.scope.workflowIds.includes(workflowId)
  );
};

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
