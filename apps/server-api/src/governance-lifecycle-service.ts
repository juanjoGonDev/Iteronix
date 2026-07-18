import {
  GovernanceActorKind,
  GovernanceLifecycleState,
  GovernanceTransitionKind,
  createGovernanceLifecycle,
  transitionGovernanceLifecycle,
  type GovernanceBudgetLimits,
  type GovernanceFingerprints,
  type GovernanceLifecycle,
} from "../../../packages/domain/src/governance-lifecycle";
import {
  createRepairProposal,
  type RepairProposal,
  type VersionedJsonSchema,
  type WorkflowGuardrailInput,
  type WorkflowGuardrailPolicy,
} from "../../../packages/domain/src/governance-validation";
import type { GovernanceLifecyclePersistencePort } from "./governance-lifecycle-persistence-port";

export type GovernanceLifecycleService = {
  read: (lifecycleId: string) => GovernanceLifecycle | undefined;
  begin: (input: {
    id: string;
    workflowId: string;
    fingerprints: GovernanceFingerprints;
    limits: GovernanceBudgetLimits;
    now: string;
  }) => Promise<GovernanceLifecycle>;
  transition: (input: {
    lifecycleId: string;
    kind: GovernanceTransitionKind;
    actorId: string;
    reason: string;
    now: string;
    failure?: {
      classification: "retryable" | "non-retryable";
      before: string;
      after: string;
    };
  }) => Promise<GovernanceLifecycle>;
  executeBoundedPass: (input: {
    lifecycleId: string;
    execute: () => Promise<void>;
    failure?: {
      classification: "retryable" | "non-retryable";
      before: string;
      after: string;
    };
    classifyFailure?: (error: unknown) => {
      classification: "retryable" | "non-retryable";
      before: string;
      after: string;
    };
    now: (step: number) => string;
  }) => Promise<GovernanceLifecycle>;
  proposeBoundedRepair: (input: {
    lifecycleId: string;
    proposalId: string;
    failureEvidence: string;
    proposedOutput: unknown;
    schema: VersionedJsonSchema;
    guardrailPolicy: WorkflowGuardrailPolicy;
    guardrailInput: WorkflowGuardrailInput;
    now: string;
  }) => Promise<{ lifecycle: GovernanceLifecycle; proposal: RepairProposal }>;
};

export const createGovernanceLifecycleService = (
  persistence: GovernanceLifecyclePersistencePort,
): GovernanceLifecycleService => ({
  read: (lifecycleId) =>
    persistence
      .read()
      .governanceLifecycles.find((lifecycle) => lifecycle.id === lifecycleId),
  begin: async (input) => {
    let lifecycle: GovernanceLifecycle | undefined;
    await persistence.mutateGovernanceLifecycles((lifecycles) => {
      const created = createGovernanceLifecycle({
        ...input,
        priorLifecycles: lifecycles,
      });
      lifecycle = created;
      return [...lifecycles, created];
    });
    if (!lifecycle) {
      throw new Error("Governance lifecycle was not created.");
    }
    return lifecycle;
  },
  transition: (input) => transitionPersistedLifecycle(persistence, input),
  proposeBoundedRepair: async (input) => {
    const lifecycle = readLifecycleForRepair(persistence, input.lifecycleId);
    if (lifecycle.state === GovernanceLifecycleState.Approved) {
      throw new Error("Approved lifecycle cannot receive a repair proposal.");
    }
    if (lifecycle.state !== GovernanceLifecycleState.Executing) {
      throw new Error("Repair proposals require an executing lifecycle.");
    }
    const proposal = createRepairProposal({
      id: input.proposalId,
      lifecycleId: input.lifecycleId,
      failureEvidence: input.failureEvidence,
      proposedOutput: input.proposedOutput,
      schema: input.schema,
      guardrailPolicy: input.guardrailPolicy,
      guardrailInput: input.guardrailInput,
    });
    const next = await persistRepairProposal(persistence, {
      lifecycleId: input.lifecycleId,
      proposal,
      now: input.now,
    });
    return { lifecycle: next, proposal };
  },
  executeBoundedPass: async (input) => {
    const executing = await transitionPersistedLifecycle(persistence, {
      lifecycleId: input.lifecycleId,
      kind: GovernanceTransitionKind.StartExecuting,
      actorId: "runtime",
      reason: "Bounded execution pass started.",
      now: input.now(0),
    });
    try {
      await input.execute();
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? error.message : "Workflow execution failed.";
      const failure = input.classifyFailure?.(error) ?? input.failure;
      if (
        failure?.classification === "retryable" &&
        hasRemainingRepairBudget(executing)
      ) {
        return transitionPersistedLifecycle(persistence, {
          lifecycleId: executing.id,
          kind: GovernanceTransitionKind.AutoRepair,
          actorId: "runtime",
          reason,
          failure,
          now: input.now(1),
        });
      }
      return transitionPersistedLifecycle(persistence, {
        lifecycleId: executing.id,
        kind: GovernanceTransitionKind.Fail,
        actorId: "runtime",
        reason,
        now: input.now(1),
      });
    }
    const verifying = await transitionPersistedLifecycle(persistence, {
      lifecycleId: executing.id,
      kind: GovernanceTransitionKind.StartVerifying,
      actorId: "runtime",
      reason: "Execution evidence is ready for verification.",
      now: input.now(1),
    });
    const reviewing = await transitionPersistedLifecycle(persistence, {
      lifecycleId: verifying.id,
      kind: GovernanceTransitionKind.StartReviewing,
      actorId: "runtime",
      reason: "Verification evidence is ready for review.",
      now: input.now(2),
    });
    return transitionPersistedLifecycle(persistence, {
      lifecycleId: reviewing.id,
      kind: GovernanceTransitionKind.AwaitUserApproval,
      actorId: "runtime",
      reason: "Awaiting an explicit user decision.",
      now: input.now(3),
    });
  },
});

export const mayExecuteGovernanceLifecycle = (
  lifecycle: GovernanceLifecycle,
): boolean => lifecycle.state === GovernanceLifecycleState.Executing;

export const isRetryableResumeReady = (
  lifecycle: GovernanceLifecycle,
): boolean =>
  lifecycle.state === GovernanceLifecycleState.Planning &&
  lifecycle.transitions.at(-1)?.kind === GovernanceTransitionKind.AutoRepair &&
  lifecycle.transitions.at(-1)?.failure?.classification === "retryable";

const hasRemainingRepairBudget = (lifecycle: GovernanceLifecycle): boolean =>
  lifecycle.budgets.repair < lifecycle.limits.repair;

const readLifecycleForRepair = (
  persistence: GovernanceLifecyclePersistencePort,
  lifecycleId: string,
): GovernanceLifecycle => {
  const lifecycle = persistence
    .read()
    .governanceLifecycles.find((candidate) => candidate.id === lifecycleId);
  if (!lifecycle) {
    throw new Error(`Governance lifecycle ${lifecycleId} was not found.`);
  }
  return lifecycle;
};

const persistRepairProposal = async (
  persistence: GovernanceLifecyclePersistencePort,
  input: {
    lifecycleId: string;
    proposal: RepairProposal;
    now: string;
  },
): Promise<GovernanceLifecycle> => {
  let next: GovernanceLifecycle | undefined;
  await persistence.mutateGovernanceLifecycles((lifecycles) => {
    const current = lifecycles.find(
      (lifecycle) => lifecycle.id === input.lifecycleId,
    );
    if (!current) {
      throw new Error(
        `Governance lifecycle ${input.lifecycleId} was not found.`,
      );
    }
    if (current.state === GovernanceLifecycleState.Approved) {
      throw new Error("Approved lifecycle cannot receive a repair proposal.");
    }
    if (current.state !== GovernanceLifecycleState.Executing) {
      throw new Error("Repair proposals require an executing lifecycle.");
    }
    const transitioned = transitionGovernanceLifecycle(current, {
      kind: GovernanceTransitionKind.AutoRepair,
      actor: { kind: GovernanceActorKind.System, id: "repair-proposal" },
      reason: "A bounded repair proposal was recorded.",
      failure: {
        classification: "retryable",
        before: input.proposal.failureEvidence,
        after: input.proposal.outputFingerprint,
      },
      now: input.now,
    });
    next = {
      ...transitioned,
      repairProposals: [...current.repairProposals, input.proposal],
    };
    return lifecycles.map((lifecycle) =>
      lifecycle.id === next?.id ? next : lifecycle,
    );
  });
  if (!next) {
    throw new Error("Governance repair proposal was not persisted.");
  }
  return next;
};

const isUserControl = (kind: GovernanceTransitionKind): boolean =>
  kind === GovernanceTransitionKind.Approve ||
  kind === GovernanceTransitionKind.Continue ||
  kind === GovernanceTransitionKind.RejectWithFeedback;

const transitionPersistedLifecycle = async (
  persistence: GovernanceLifecyclePersistencePort,
  input: {
    lifecycleId: string;
    kind: GovernanceTransitionKind;
    actorId: string;
    reason: string;
    now: string;
    failure?: {
      classification: "retryable" | "non-retryable";
      before: string;
      after: string;
    };
  },
): Promise<GovernanceLifecycle> => {
  let next: GovernanceLifecycle | undefined;
  await persistence.mutateGovernanceLifecycles((lifecycles) => {
    const current = lifecycles.find(
      (lifecycle) => lifecycle.id === input.lifecycleId,
    );
    if (!current) {
      throw new Error(
        `Governance lifecycle ${input.lifecycleId} was not found.`,
      );
    }
    next = transitionGovernanceLifecycle(current, {
      kind: input.kind,
      actor: {
        kind: isUserControl(input.kind)
          ? GovernanceActorKind.User
          : GovernanceActorKind.System,
        id: input.actorId,
      },
      reason: input.reason,
      now: input.now,
      ...(input.failure ? { failure: input.failure } : {}),
    });
    return lifecycles.map((lifecycle) =>
      lifecycle.id === next?.id ? next : lifecycle,
    );
  });
  if (!next) {
    throw new Error("Governance lifecycle transition was not applied.");
  }
  return next;
};
