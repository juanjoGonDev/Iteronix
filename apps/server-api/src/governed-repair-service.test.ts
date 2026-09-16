import { describe, expect, it } from "vitest";
import {
  GovernanceLifecycleState,
  GovernanceTransitionKind,
  parseGovernanceLifecycles,
} from "../../../packages/domain/src/governance-lifecycle";
import { createGovernanceLifecycleService } from "./governance-lifecycle-service";
import type { GovernanceLifecyclePersistencePort } from "./governance-lifecycle-persistence-port";

const schema = {
  id: "answer",
  version: 1,
  schema: {
    type: "object" as const,
    properties: { answer: { type: "string" as const, minLength: 1 } },
    required: ["answer"],
    additionalProperties: false,
  },
};

describe("governed repair proposals", () => {
  it("persists validated repair evidence through the lifecycle without applying output autonomously", async () => {
    const persistence = createMemoryPersistence();
    const service = createGovernanceLifecycleService(persistence);
    const executing = await createExecutingLifecycle(service);

    const result = await service.proposeBoundedRepair({
      lifecycleId: executing.id,
      proposalId: "repair-1",
      failureEvidence: "validation-failure-fingerprint",
      proposedOutput: { answer: "repaired" },
      schema,
      guardrailPolicy: {
        allowedToolIds: [],
        allowSensitiveData: false,
        requiredProviderCapabilities: [],
        maxNodes: 1,
        maxParallelism: 1,
      },
      guardrailInput: {
        toolIds: [],
        handlesSensitiveData: false,
        providerCapabilities: [],
        nodeCount: 1,
        parallelism: 1,
      },
      now: "2026-07-18T00:00:03.000Z",
    });

    expect(result.lifecycle.state).toBe(GovernanceLifecycleState.Planning);
    const repairTransition = result.lifecycle.transitions.at(-1);
    expect(repairTransition?.kind).toBe(GovernanceTransitionKind.AutoRepair);
    expect(repairTransition?.failure).toEqual({
      classification: "retryable",
      before: "validation-failure-fingerprint",
      after: result.proposal.outputFingerprint,
    });
    expect(result.proposal.proposedOutput).toEqual({ answer: "repaired" });
    expect(persistence.read().governanceLifecycles[0]?.state).toBe(
      GovernanceLifecycleState.Planning,
    );
    expect(persistence.read().governanceLifecycles[0]?.repairProposals).toEqual(
      [result.proposal],
    );
    expect(
      parseGovernanceLifecycles(
        structuredClone(persistence.read().governanceLifecycles),
      )[0]?.repairProposals,
    ).toEqual([result.proposal]);
  });

  it("never creates a repair proposal for an approved lifecycle", async () => {
    const persistence = createMemoryPersistence();
    const service = createGovernanceLifecycleService(persistence);
    const approved = await createApprovedLifecycle(service);

    await expect(
      service.proposeBoundedRepair({
        lifecycleId: approved.id,
        proposalId: "repair-approved",
        failureEvidence: "failure",
        proposedOutput: { answer: "replacement" },
        schema,
        guardrailPolicy: {
          allowedToolIds: [],
          allowSensitiveData: false,
          requiredProviderCapabilities: [],
          maxNodes: 1,
          maxParallelism: 1,
        },
        guardrailInput: {
          toolIds: [],
          handlesSensitiveData: false,
          providerCapabilities: [],
          nodeCount: 1,
          parallelism: 1,
        },
        now: "2026-07-18T00:00:06.000Z",
      }),
    ).rejects.toThrow("Approved lifecycle cannot receive a repair proposal");
  });
});

const createExecutingLifecycle = async (
  service: ReturnType<typeof createGovernanceLifecycleService>,
) => {
  const draft = await service.begin({
    id: "lifecycle-1",
    workflowId: "workflow-1",
    fingerprints: { scope: "scope", evidence: "evidence" },
    limits: { execution: 2, repair: 1, review: 1 },
    now: "2026-07-18T00:00:00.000Z",
  });
  const planning = await transition(
    service,
    draft.id,
    GovernanceTransitionKind.StartPlanning,
    1,
  );
  return transition(
    service,
    planning.id,
    GovernanceTransitionKind.StartExecuting,
    2,
  );
};

const createApprovedLifecycle = async (
  service: ReturnType<typeof createGovernanceLifecycleService>,
) => {
  const executing = await createExecutingLifecycle(service);
  const verifying = await transition(
    service,
    executing.id,
    GovernanceTransitionKind.StartVerifying,
    3,
  );
  const reviewing = await transition(
    service,
    verifying.id,
    GovernanceTransitionKind.StartReviewing,
    4,
  );
  const awaiting = await transition(
    service,
    reviewing.id,
    GovernanceTransitionKind.AwaitUserApproval,
    5,
  );
  return service.transition({
    lifecycleId: awaiting.id,
    kind: GovernanceTransitionKind.Approve,
    actorId: "user-1",
    reason: "Approved.",
    now: "2026-07-18T00:00:06.000Z",
  });
};

const transition = (
  service: ReturnType<typeof createGovernanceLifecycleService>,
  lifecycleId: string,
  kind: GovernanceTransitionKind,
  step: number,
) =>
  service.transition({
    lifecycleId,
    kind,
    actorId: "runtime",
    reason: "Lifecycle transition.",
    now: `2026-07-18T00:00:0${step.toString()}.000Z`,
  });

const createMemoryPersistence = (): GovernanceLifecyclePersistencePort => {
  let governanceLifecycles: ReturnType<
    GovernanceLifecyclePersistencePort["read"]
  >["governanceLifecycles"] = [];
  return {
    read: () => ({ governanceLifecycles }),
    mutateGovernanceLifecycles: async (updater) => {
      governanceLifecycles = updater(governanceLifecycles);
    },
  };
};
