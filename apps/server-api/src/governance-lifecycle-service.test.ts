import { describe, expect, it } from "vitest";
import { GovernanceTransitionKind } from "../../../packages/domain/src/governance-lifecycle";
import {
  createDefaultApplicationState,
  type ApplicationState,
} from "./application-state";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import { createProviderStore } from "./providers";
import { createApplicationPersistence } from "./server";
import {
  createGovernanceLifecycleService,
  mayExecuteGovernanceLifecycle,
} from "./governance-lifecycle-service";

describe("governance lifecycle server adapter", () => {
  it("persists user controls and prevents autonomous execution at approval checkpoint", async () => {
    const persistence = createPersistence();
    const service = createGovernanceLifecycleService(persistence);
    const draft = await service.begin({
      id: "lifecycle-1",
      workflowId: "workflow-1",
      fingerprints: { scope: "scope", evidence: "evidence" },
      limits: { execution: 1, repair: 1, review: 1 },
      now: "2026-07-17T00:00:00.000Z",
    });
    const planning = await transition(
      service,
      draft.id,
      GovernanceTransitionKind.StartPlanning,
      "Plan.",
      1,
    );
    const executing = await transition(
      service,
      planning.id,
      GovernanceTransitionKind.StartExecuting,
      "Execute.",
      2,
    );
    expect(mayExecuteGovernanceLifecycle(executing)).toBe(true);
    const verifying = await transition(
      service,
      executing.id,
      GovernanceTransitionKind.StartVerifying,
      "Verify.",
      3,
    );
    const reviewing = await transition(
      service,
      verifying.id,
      GovernanceTransitionKind.StartReviewing,
      "Review.",
      4,
    );
    const awaiting = await transition(
      service,
      reviewing.id,
      GovernanceTransitionKind.AwaitUserApproval,
      "Wait.",
      5,
    );

    expect(mayExecuteGovernanceLifecycle(awaiting)).toBe(false);
    await expect(
      transition(
        service,
        awaiting.id,
        GovernanceTransitionKind.StartExecuting,
        "No autonomous rerun.",
        6,
      ),
    ).rejects.toThrow("Illegal governance transition");
    const approved = await transition(
      service,
      awaiting.id,
      GovernanceTransitionKind.Approve,
      "Approved.",
      7,
    );
    expect(approved.transitions.at(-1)?.actor.kind).toBe("user");
    expect(persistence.read().governanceLifecycles[0]).toEqual(approved);
  });

  it("stops retryable and non-retryable runtime failures without autonomous loops", async () => {
    const service = createGovernanceLifecycleService(createPersistence());
    const retryable = await beginPlanning(service, "retryable");
    const repaired = await service.executeBoundedPass({
      lifecycleId: retryable.id,
      execute: async () => {
        throw new Error("Provider timeout.");
      },
      failure: {
        classification: "retryable",
        before: "timeout",
        after: "repair proposed",
      },
      now: readNow,
    });
    expect(repaired.state).toBe("planning");
    expect(repaired.budgets).toEqual({ execution: 1, repair: 1, review: 0 });

    const nonRetryable = await beginPlanning(service, "non-retryable");
    const failed = await service.executeBoundedPass({
      lifecycleId: nonRetryable.id,
      execute: async () => {
        throw new Error("Schema mismatch.");
      },
      failure: {
        classification: "non-retryable",
        before: "invalid",
        after: "unchanged",
      },
      now: readNow,
    });
    expect(failed.state).toBe("failed");
    expect(failed.budgets.repair).toBe(0);
  });

  it("fails a second retryable pass after its bounded repair budget is spent", async () => {
    const service = createGovernanceLifecycleService(createPersistence());
    const planning = await beginPlanning(service, "bounded-retry", {
      execution: 2,
      repair: 1,
      review: 1,
    });
    const repaired = await service.executeBoundedPass({
      lifecycleId: planning.id,
      execute: async () => {
        throw new Error("Provider timeout.");
      },
      failure: {
        classification: "retryable",
        before: "timeout",
        after: "repair proposed",
      },
      now: readNow,
    });

    const failed = await service.executeBoundedPass({
      lifecycleId: repaired.id,
      execute: async () => {
        throw new Error("Provider timeout.");
      },
      failure: {
        classification: "retryable",
        before: "timeout",
        after: "repair exhausted",
      },
      now: readNow,
    });

    expect(failed).toMatchObject({
      state: "failed",
      budgets: { execution: 2, repair: 1, review: 0 },
    });
    expect(failed.transitions.map((transition) => transition.kind)).toEqual([
      "start-planning",
      "start-executing",
      "auto-repair",
      "start-executing",
      "fail",
    ]);
  });

  it("serializes concurrent bounded pass attempts so only one execution budget is consumed", async () => {
    const service = createGovernanceLifecycleService(createPersistence());
    const planning = await beginPlanning(service, "serialized");
    const first = service.executeBoundedPass({
      lifecycleId: planning.id,
      execute: async () => undefined,
      now: readNow,
    });
    const second = service.executeBoundedPass({
      lifecycleId: planning.id,
      execute: async () => undefined,
      now: readNow,
    });

    await expect(first).resolves.toMatchObject({
      state: "awaiting-user-approval",
    });
    await expect(second).rejects.toThrow("Illegal governance transition");
  });
});

const transition = (
  service: ReturnType<typeof createGovernanceLifecycleService>,
  lifecycleId: string,
  kind: GovernanceTransitionKind,
  reason: string,
  second: number,
) =>
  service.transition({
    lifecycleId,
    kind,
    actorId: "actor-1",
    reason,
    now: `2026-07-17T00:00:0${second.toString()}.000Z`,
  });

const createPersistence = () => {
  const initialState = createDefaultApplicationState();
  const stateStore = {
    load: async () => initialState,
    save: async (state: ApplicationState) => ({
      ...state,
      revision: state.revision + 1,
    }),
    update: async (updater: (state: ApplicationState) => ApplicationState) =>
      updater(initialState),
  };
  return createApplicationPersistence({
    initialState,
    providerStore: createProviderStore(),
    workflowCatalog: createWorkflowCatalogStore(),
    stateStore,
  });
};

const beginPlanning = async (
  service: ReturnType<typeof createGovernanceLifecycleService>,
  id: string,
  limits = { execution: 1, repair: 1, review: 1 },
) => {
  const draft = await service.begin({
    id,
    workflowId: "workflow-1",
    fingerprints: { scope: `${id}-scope`, evidence: `${id}-evidence` },
    limits,
    now: readNow(0),
  });
  return service.transition({
    lifecycleId: draft.id,
    kind: GovernanceTransitionKind.StartPlanning,
    actorId: "runtime",
    reason: "Plan.",
    now: readNow(1),
  });
};

const readNow = (step: number): string =>
  `2026-07-17T00:00:0${step.toString()}.000Z`;
