export const GovernanceLifecycleState = {
  Approved: "approved",
  AwaitingUserApproval: "awaiting-user-approval",
  Cancelled: "cancelled",
  Draft: "draft",
  Executing: "executing",
  Failed: "failed",
  Planning: "planning",
  Rejected: "rejected",
  Reviewing: "reviewing",
  Verifying: "verifying",
} as const;

export type GovernanceLifecycleState =
  (typeof GovernanceLifecycleState)[keyof typeof GovernanceLifecycleState];

export const GovernanceTransitionKind = {
  Approve: "approve",
  AutoRepair: "auto-repair",
  AwaitUserApproval: "await-user-approval",
  Cancel: "cancel",
  Continue: "continue",
  Fail: "fail",
  RejectWithFeedback: "reject-with-feedback",
  StartExecuting: "start-executing",
  StartPlanning: "start-planning",
  StartReviewing: "start-reviewing",
  StartVerifying: "start-verifying",
} as const;

export type GovernanceTransitionKind =
  (typeof GovernanceTransitionKind)[keyof typeof GovernanceTransitionKind];

export const GovernanceActorKind = {
  System: "system",
  User: "user",
} as const;

export type GovernanceActorKind =
  (typeof GovernanceActorKind)[keyof typeof GovernanceActorKind];

export type GovernanceFingerprints = {
  scope: string;
  evidence: string;
};

export type GovernanceBudgetLimits = {
  execution: number;
  repair: number;
  review: number;
};

export type GovernanceBudgetUsage = GovernanceBudgetLimits;

export type GovernanceActor = {
  kind: GovernanceActorKind;
  id: string;
};

export type GovernanceFailureEvidence = {
  classification: "retryable" | "non-retryable";
  before: string;
  after: string;
};

export type GovernanceTransition = {
  id: string;
  kind: GovernanceTransitionKind;
  from: GovernanceLifecycleState;
  to: GovernanceLifecycleState;
  actor: GovernanceActor;
  reason: string;
  timestamp: string;
  fingerprints: GovernanceFingerprints;
  budgets: GovernanceBudgetUsage;
  failure?: GovernanceFailureEvidence;
};

export type GovernanceLifecycle = {
  id: string;
  workflowId: string;
  state: GovernanceLifecycleState;
  fingerprints: GovernanceFingerprints;
  limits: GovernanceBudgetLimits;
  budgets: GovernanceBudgetUsage;
  transitions: ReadonlyArray<GovernanceTransition>;
  userAuthorizedPasses: number;
};

export const createGovernanceLifecycle = (input: {
  id: string;
  workflowId: string;
  fingerprints: GovernanceFingerprints;
  limits: GovernanceBudgetLimits;
  now: string;
  priorLifecycles?: ReadonlyArray<GovernanceLifecycle>;
}): GovernanceLifecycle => {
  assertNonEmpty(input.id, "Lifecycle id is required");
  assertNonEmpty(input.workflowId, "Workflow id is required");
  assertFingerprints(input.fingerprints);
  assertBudgetLimits(input.limits);
  if (input.priorLifecycles?.some((lifecycle) => lifecycle.id === input.id)) {
    throw new Error("Governance lifecycle id already exists.");
  }
  if (
    input.priorLifecycles?.some(
      (lifecycle) =>
        lifecycle.workflowId === input.workflowId &&
        lifecycle.state === GovernanceLifecycleState.Approved &&
        hasSameFingerprints(lifecycle.fingerprints, input.fingerprints),
    )
  ) {
    throw new Error(
      "Approved fingerprints require a changed scope or evidence.",
    );
  }
  return {
    id: input.id,
    workflowId: input.workflowId,
    state: GovernanceLifecycleState.Draft,
    fingerprints: copyFingerprints(input.fingerprints),
    limits: copyBudgets(input.limits),
    budgets: createEmptyBudgets(),
    transitions: [],
    userAuthorizedPasses: 0,
  };
};

export const transitionGovernanceLifecycle = (
  lifecycle: GovernanceLifecycle,
  input: {
    kind: GovernanceTransitionKind;
    actor: GovernanceActor;
    reason: string;
    now: string;
    failure?: GovernanceFailureEvidence;
  },
): GovernanceLifecycle => {
  assertNonEmpty(input.actor.id, "Governance actor id is required");
  assertNonEmpty(input.reason, "Governance transition reason is required");
  const transition = readTransition(lifecycle.state, input.kind);
  assertActor(input.actor, input.kind);
  assertFailureEvidence(input);
  const budgets = readNextBudgets(lifecycle, input.kind);
  const record: GovernanceTransition = {
    id: `${lifecycle.id}:${(lifecycle.transitions.length + 1).toString()}`,
    kind: input.kind,
    from: lifecycle.state,
    to: transition.to,
    actor: { ...input.actor },
    reason: input.reason,
    timestamp: input.now,
    fingerprints: copyFingerprints(lifecycle.fingerprints),
    budgets,
    ...(input.failure ? { failure: { ...input.failure } } : {}),
  };
  return {
    ...lifecycle,
    state: transition.to,
    budgets,
    transitions: [...lifecycle.transitions, record],
    userAuthorizedPasses:
      lifecycle.userAuthorizedPasses +
      (input.kind === GovernanceTransitionKind.Continue ? 1 : 0),
  };
};

export const parseGovernanceLifecycles = (
  value: unknown,
): ReadonlyArray<GovernanceLifecycle> =>
  Array.isArray(value)
    ? value.flatMap((candidate) => {
        const parsed = parseGovernanceLifecycle(candidate);
        return parsed ? [parsed] : [];
      })
    : [];

const parseGovernanceLifecycle = (
  value: unknown,
): GovernanceLifecycle | undefined => {
  if (!isRecord(value) || !isLifecycleState(value["state"])) {
    return undefined;
  }
  const id = readNonEmptyString(value["id"]);
  const workflowId = readNonEmptyString(value["workflowId"]);
  const fingerprints = parseFingerprints(value["fingerprints"]);
  const limits = parseBudgets(value["limits"]);
  const budgets = parseBudgets(value["budgets"]);
  const transitions = parseTransitions(value["transitions"]);
  const userAuthorizedPasses = value["userAuthorizedPasses"];
  if (
    !id ||
    !workflowId ||
    !fingerprints ||
    !limits ||
    !budgets ||
    !transitions ||
    !isNonNegativeInteger(userAuthorizedPasses)
  ) {
    return undefined;
  }
  const lifecycle = {
    id,
    workflowId,
    state: value["state"],
    fingerprints,
    limits,
    budgets,
    transitions,
    userAuthorizedPasses,
  };
  return hasValidTransitionHistory(lifecycle) ? lifecycle : undefined;
};

const hasValidTransitionHistory = (lifecycle: GovernanceLifecycle): boolean => {
  let replayed = createGovernanceLifecycle({
    id: lifecycle.id,
    workflowId: lifecycle.workflowId,
    fingerprints: lifecycle.fingerprints,
    limits: lifecycle.limits,
    now: "replay",
  });
  for (const transition of lifecycle.transitions) {
    try {
      replayed = transitionGovernanceLifecycle(replayed, {
        kind: transition.kind,
        actor: transition.actor,
        reason: transition.reason,
        now: transition.timestamp,
        ...(transition.failure ? { failure: transition.failure } : {}),
      });
    } catch {
      return false;
    }
    if (!hasSameTransition(replayed.transitions.at(-1), transition)) {
      return false;
    }
  }
  return (
    replayed.state === lifecycle.state &&
    hasSameFingerprints(replayed.fingerprints, lifecycle.fingerprints) &&
    hasSameBudgets(replayed.budgets, lifecycle.budgets) &&
    replayed.userAuthorizedPasses === lifecycle.userAuthorizedPasses
  );
};

const hasSameTransition = (
  left: GovernanceTransition | undefined,
  right: GovernanceTransition,
): boolean =>
  left !== undefined &&
  left.id === right.id &&
  left.kind === right.kind &&
  left.from === right.from &&
  left.to === right.to &&
  left.actor.kind === right.actor.kind &&
  left.actor.id === right.actor.id &&
  left.reason === right.reason &&
  left.timestamp === right.timestamp &&
  hasSameFingerprints(left.fingerprints, right.fingerprints) &&
  hasSameBudgets(left.budgets, right.budgets) &&
  hasSameFailure(left.failure, right.failure);

const hasSameFailure = (
  left: GovernanceFailureEvidence | undefined,
  right: GovernanceFailureEvidence | undefined,
): boolean =>
  left === undefined && right === undefined
    ? true
    : left !== undefined &&
      right !== undefined &&
      left.classification === right.classification &&
      left.before === right.before &&
      left.after === right.after;

const parseTransitions = (
  value: unknown,
): ReadonlyArray<GovernanceTransition> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parsed = value.map(parseTransition);
  return parsed.every(
    (transition): transition is GovernanceTransition =>
      transition !== undefined,
  )
    ? parsed
    : undefined;
};

const parseTransition = (value: unknown): GovernanceTransition | undefined => {
  if (
    !isRecord(value) ||
    !isTransitionKind(value["kind"]) ||
    !isLifecycleState(value["from"]) ||
    !isLifecycleState(value["to"])
  ) {
    return undefined;
  }
  const id = readNonEmptyString(value["id"]);
  const reason = readNonEmptyString(value["reason"]);
  const timestamp = readNonEmptyString(value["timestamp"]);
  const actor = parseActor(value["actor"]);
  const fingerprints = parseFingerprints(value["fingerprints"]);
  const budgets = parseBudgets(value["budgets"]);
  const failure = parseFailure(value["failure"]);
  if (
    !id ||
    !reason ||
    !timestamp ||
    !actor ||
    !fingerprints ||
    !budgets ||
    (value["failure"] !== undefined && !failure)
  ) {
    return undefined;
  }
  return {
    id,
    kind: value["kind"],
    from: value["from"],
    to: value["to"],
    actor,
    reason,
    timestamp,
    fingerprints,
    budgets,
    ...(failure ? { failure } : {}),
  };
};

const parseActor = (value: unknown): GovernanceActor | undefined => {
  if (!isRecord(value) || !isActorKind(value["kind"])) {
    return undefined;
  }
  const id = readNonEmptyString(value["id"]);
  return id ? { kind: value["kind"], id } : undefined;
};

const parseFingerprints = (
  value: unknown,
): GovernanceFingerprints | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const scope = readNonEmptyString(value["scope"]);
  const evidence = readNonEmptyString(value["evidence"]);
  return scope && evidence ? { scope, evidence } : undefined;
};

const parseBudgets = (value: unknown): GovernanceBudgetUsage | undefined => {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value["execution"]) ||
    !isNonNegativeInteger(value["repair"]) ||
    !isNonNegativeInteger(value["review"])
  ) {
    return undefined;
  }
  return {
    execution: value["execution"],
    repair: value["repair"],
    review: value["review"],
  };
};

const parseFailure = (
  value: unknown,
): GovernanceFailureEvidence | undefined => {
  if (
    !isRecord(value) ||
    (value["classification"] !== "retryable" &&
      value["classification"] !== "non-retryable")
  ) {
    return undefined;
  }
  const before = readNonEmptyString(value["before"]);
  const after = readNonEmptyString(value["after"]);
  return before && after
    ? { classification: value["classification"], before, after }
    : undefined;
};

const isLifecycleState = (value: unknown): value is GovernanceLifecycleState =>
  value === GovernanceLifecycleState.Approved ||
  value === GovernanceLifecycleState.AwaitingUserApproval ||
  value === GovernanceLifecycleState.Cancelled ||
  value === GovernanceLifecycleState.Draft ||
  value === GovernanceLifecycleState.Executing ||
  value === GovernanceLifecycleState.Failed ||
  value === GovernanceLifecycleState.Planning ||
  value === GovernanceLifecycleState.Rejected ||
  value === GovernanceLifecycleState.Reviewing ||
  value === GovernanceLifecycleState.Verifying;

const isTransitionKind = (value: unknown): value is GovernanceTransitionKind =>
  typeof value === "string" &&
  Object.values(GovernanceTransitionKind).some((kind) => kind === value);

const isActorKind = (value: unknown): value is GovernanceActorKind =>
  typeof value === "string" &&
  Object.values(GovernanceActorKind).some((kind) => kind === value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readNonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const readTransition = (
  from: GovernanceLifecycleState,
  kind: GovernanceTransitionKind,
): { to: GovernanceLifecycleState } => {
  const to = TransitionTargets[`${from}:${kind}`];
  if (!to) {
    throw new Error(`Illegal governance transition: ${from} -> ${kind}.`);
  }
  return { to };
};

const readNextBudgets = (
  lifecycle: GovernanceLifecycle,
  kind: GovernanceTransitionKind,
): GovernanceBudgetUsage => {
  const budgets = copyBudgets(lifecycle.budgets);
  if (kind === GovernanceTransitionKind.StartExecuting) {
    assertRemainingBudget(
      budgets.execution,
      lifecycle.limits.execution,
      "Execution",
    );
    budgets.execution += 1;
  }
  if (kind === GovernanceTransitionKind.AutoRepair) {
    assertRemainingBudget(budgets.repair, lifecycle.limits.repair, "Repair");
    budgets.repair += 1;
  }
  if (kind === GovernanceTransitionKind.StartReviewing) {
    assertRemainingBudget(budgets.review, lifecycle.limits.review, "Review");
    budgets.review += 1;
  }
  return budgets;
};

const assertActor = (
  actor: GovernanceActor,
  kind: GovernanceTransitionKind,
): void => {
  const requiresUser =
    kind === GovernanceTransitionKind.Approve ||
    kind === GovernanceTransitionKind.Continue ||
    kind === GovernanceTransitionKind.RejectWithFeedback;
  if (requiresUser && actor.kind !== GovernanceActorKind.User) {
    throw new Error(
      "User authorization is required for this governance control.",
    );
  }
  if (!requiresUser && actor.kind !== GovernanceActorKind.System) {
    throw new Error(
      "System actor is required for autonomous governance activity.",
    );
  }
};

const assertFailureEvidence = (input: {
  kind: GovernanceTransitionKind;
  failure?: GovernanceFailureEvidence;
}): void => {
  if (input.kind !== GovernanceTransitionKind.AutoRepair) {
    return;
  }
  if (
    input.failure?.classification !== "retryable" ||
    input.failure.before.trim().length === 0 ||
    input.failure.after.trim().length === 0
  ) {
    throw new Error(
      "Automatic repair requires a retryable failure with before/after evidence.",
    );
  }
};

const assertRemainingBudget = (
  consumed: number,
  limit: number,
  name: string,
): void => {
  if (consumed >= limit) {
    throw new Error(`${name} budget is exhausted.`);
  }
};

const assertBudgetLimits = (limits: GovernanceBudgetLimits): void => {
  for (const value of Object.values(limits)) {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(
        "Governance budget limits must be non-negative integers.",
      );
    }
  }
};

const assertFingerprints = (fingerprints: GovernanceFingerprints): void => {
  assertNonEmpty(fingerprints.scope, "Scope fingerprint is required");
  assertNonEmpty(fingerprints.evidence, "Evidence fingerprint is required");
};

const assertNonEmpty = (value: string, message: string): void => {
  if (value.trim().length === 0) {
    throw new Error(`${message}.`);
  }
};

const copyFingerprints = (
  fingerprints: GovernanceFingerprints,
): GovernanceFingerprints => ({ ...fingerprints });

const copyBudgets = (
  budgets: GovernanceBudgetUsage,
): GovernanceBudgetUsage => ({
  execution: budgets.execution,
  repair: budgets.repair,
  review: budgets.review,
});

const createEmptyBudgets = (): GovernanceBudgetUsage => ({
  execution: 0,
  repair: 0,
  review: 0,
});

const hasSameFingerprints = (
  left: GovernanceFingerprints,
  right: GovernanceFingerprints,
): boolean => left.scope === right.scope && left.evidence === right.evidence;

const hasSameBudgets = (
  left: GovernanceBudgetUsage,
  right: GovernanceBudgetUsage,
): boolean =>
  left.execution === right.execution &&
  left.repair === right.repair &&
  left.review === right.review;

const TransitionTargets: Readonly<Record<string, GovernanceLifecycleState>> = {
  [`${GovernanceLifecycleState.Draft}:${GovernanceTransitionKind.StartPlanning}`]:
    GovernanceLifecycleState.Planning,
  [`${GovernanceLifecycleState.Planning}:${GovernanceTransitionKind.StartExecuting}`]:
    GovernanceLifecycleState.Executing,
  [`${GovernanceLifecycleState.Executing}:${GovernanceTransitionKind.StartVerifying}`]:
    GovernanceLifecycleState.Verifying,
  [`${GovernanceLifecycleState.Executing}:${GovernanceTransitionKind.AutoRepair}`]:
    GovernanceLifecycleState.Planning,
  [`${GovernanceLifecycleState.Verifying}:${GovernanceTransitionKind.StartReviewing}`]:
    GovernanceLifecycleState.Reviewing,
  [`${GovernanceLifecycleState.Reviewing}:${GovernanceTransitionKind.AwaitUserApproval}`]:
    GovernanceLifecycleState.AwaitingUserApproval,
  [`${GovernanceLifecycleState.AwaitingUserApproval}:${GovernanceTransitionKind.Approve}`]:
    GovernanceLifecycleState.Approved,
  [`${GovernanceLifecycleState.AwaitingUserApproval}:${GovernanceTransitionKind.Continue}`]:
    GovernanceLifecycleState.Planning,
  [`${GovernanceLifecycleState.AwaitingUserApproval}:${GovernanceTransitionKind.RejectWithFeedback}`]:
    GovernanceLifecycleState.Rejected,
  [`${GovernanceLifecycleState.Draft}:${GovernanceTransitionKind.Fail}`]:
    GovernanceLifecycleState.Failed,
  [`${GovernanceLifecycleState.Planning}:${GovernanceTransitionKind.Fail}`]:
    GovernanceLifecycleState.Failed,
  [`${GovernanceLifecycleState.Executing}:${GovernanceTransitionKind.Fail}`]:
    GovernanceLifecycleState.Failed,
  [`${GovernanceLifecycleState.Verifying}:${GovernanceTransitionKind.Fail}`]:
    GovernanceLifecycleState.Failed,
  [`${GovernanceLifecycleState.Reviewing}:${GovernanceTransitionKind.Fail}`]:
    GovernanceLifecycleState.Failed,
  [`${GovernanceLifecycleState.Draft}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
  [`${GovernanceLifecycleState.Planning}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
  [`${GovernanceLifecycleState.Executing}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
  [`${GovernanceLifecycleState.Verifying}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
  [`${GovernanceLifecycleState.Reviewing}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
  [`${GovernanceLifecycleState.AwaitingUserApproval}:${GovernanceTransitionKind.Cancel}`]:
    GovernanceLifecycleState.Cancelled,
};
