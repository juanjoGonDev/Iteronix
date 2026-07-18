import { describe, expect, it } from "vitest";
import {
  GovernanceActorKind,
  GovernanceLifecycleState,
  GovernanceTransitionKind,
  createGovernanceLifecycle,
  recordGovernancePromptExecution,
  transitionGovernanceLifecycle,
  parseGovernanceLifecycles,
} from "./governance-lifecycle";

const fingerprints = {
  scope: "scope-v1",
  evidence: "evidence-v1",
};

const limits = { execution: 2, repair: 1, review: 1 };

describe("governance lifecycle", () => {
  it("persists immutable rendered prompt provenance only while executing", () => {
    const executing = createExecutingLifecycle();
    const recorded = recordGovernancePromptExecution(executing, {
      id: "prompt-1",
      lifecycleId: executing.id,
      assetId: "greeting",
      version: 2,
      bindings: { name: "Ada" },
      renderedFingerprint: "fnv1a-12345678",
      validation: "passed",
      timestamp: "2026-07-18T00:00:03.000Z",
    });

    expect(recorded.promptExecutions).toEqual([
      expect.objectContaining({ assetId: "greeting", version: 2 }),
    ]);
    expect(() =>
      recordGovernancePromptExecution(
        { ...recorded, state: GovernanceLifecycleState.Approved },
        {
          id: "prompt-2",
          lifecycleId: recorded.id,
          assetId: "greeting",
          version: 2,
          bindings: { name: "Grace" },
          renderedFingerprint: "fnv1a-87654321",
          validation: "passed",
          timestamp: "2026-07-18T00:00:04.000Z",
        },
      ),
    ).toThrow("Prompt executions require an executing lifecycle.");
  });

  it("rejects reloaded prompt provenance that is duplicate, forged, or not tied to an execution attempt", () => {
    const executing = createExecutingLifecycle();
    const recorded = recordGovernancePromptExecution(executing, {
      id: "run-1:prompt:1:0",
      lifecycleId: executing.id,
      assetId: "greeting",
      version: 2,
      bindings: { name: "Ada" },
      renderedFingerprint: "fnv1a-12345678",
      validation: "passed",
      timestamp: "2026-07-18T00:00:03.000Z",
    });

    expect(parseGovernanceLifecycles([recorded])).toHaveLength(1);
    expect(
      parseGovernanceLifecycles([
        {
          ...recorded,
          promptExecutions: [
            ...recorded.promptExecutions,
            { ...recorded.promptExecutions[0]!, id: "run-1:prompt:1:0" },
          ],
        },
      ]),
    ).toEqual([]);
    expect(
      parseGovernanceLifecycles([
        {
          ...recorded,
          promptExecutions: [
            { ...recorded.promptExecutions[0]!, id: "run-1:prompt:2:0" },
          ],
        },
      ]),
    ).toEqual([]);
  });

  it("records every finite state transition with immutable proof and budget usage", () => {
    const draft = createGovernanceLifecycle({
      id: "run-1",
      workflowId: "workflow-1",
      fingerprints,
      limits,
      now: "2026-07-17T00:00:00.000Z",
    });
    const planning = transitionGovernanceLifecycle(draft, {
      kind: GovernanceTransitionKind.StartPlanning,
      actor: { kind: GovernanceActorKind.System, id: "runtime" },
      reason: "Initial planning.",
      now: "2026-07-17T00:00:01.000Z",
    });
    const executing = transitionGovernanceLifecycle(planning, {
      kind: GovernanceTransitionKind.StartExecuting,
      actor: { kind: GovernanceActorKind.System, id: "runtime" },
      reason: "Plan accepted.",
      now: "2026-07-17T00:00:02.000Z",
    });

    expect(executing.state).toBe(GovernanceLifecycleState.Executing);
    expect(executing.budgets.execution).toBe(1);
    expect(executing.transitions).toHaveLength(2);
    expect(executing.transitions[1]).toMatchObject({
      from: GovernanceLifecycleState.Planning,
      to: GovernanceLifecycleState.Executing,
      reason: "Plan accepted.",
      fingerprints,
      budgets: { execution: 1, repair: 0, review: 0 },
    });
  });

  it("rejects every illegal transition and exhausted persisted budget", () => {
    const draft = createGovernanceLifecycle({
      id: "run-1",
      workflowId: "workflow-1",
      fingerprints,
      limits: { execution: 0, repair: 0, review: 0 },
      now: "2026-07-17T00:00:00.000Z",
    });

    expect(() =>
      transitionGovernanceLifecycle(draft, {
        kind: GovernanceTransitionKind.Approve,
        actor: { kind: GovernanceActorKind.User, id: "user-1" },
        reason: "No.",
        now: "2026-07-17T00:00:01.000Z",
      }),
    ).toThrow("Illegal governance transition");

    const planning = transitionGovernanceLifecycle(draft, {
      kind: GovernanceTransitionKind.StartPlanning,
      actor: { kind: GovernanceActorKind.System, id: "runtime" },
      reason: "Plan.",
      now: "2026-07-17T00:00:01.000Z",
    });
    expect(() =>
      transitionGovernanceLifecycle(planning, {
        kind: GovernanceTransitionKind.StartExecuting,
        actor: { kind: GovernanceActorKind.System, id: "runtime" },
        reason: "Execute.",
        now: "2026-07-17T00:00:02.000Z",
      }),
    ).toThrow("Execution budget is exhausted");
  });

  it("permits automatic repair only once for classified retryable failures with evidence", () => {
    const executing = createExecutingLifecycle();
    const repaired = transitionGovernanceLifecycle(executing, {
      kind: GovernanceTransitionKind.AutoRepair,
      actor: { kind: GovernanceActorKind.System, id: "repair" },
      reason: "Provider timeout.",
      failure: {
        classification: "retryable",
        before: "before",
        after: "after",
      },
      now: "2026-07-17T00:00:03.000Z",
    });

    expect(repaired.state).toBe(GovernanceLifecycleState.Planning);
    expect(repaired.budgets.repair).toBe(1);
    expect(() =>
      transitionGovernanceLifecycle(executing, {
        kind: GovernanceTransitionKind.AutoRepair,
        actor: { kind: GovernanceActorKind.System, id: "repair" },
        reason: "Validation failed.",
        failure: {
          classification: "non-retryable",
          before: "before",
          after: "after",
        },
        now: "2026-07-17T00:00:03.000Z",
      }),
    ).toThrow("Automatic repair requires a retryable failure");
  });

  it("stops at user approval, records controls, and rejects reruns of an approved fingerprint", () => {
    const awaiting = createAwaitingApprovalLifecycle();
    const continued = transitionGovernanceLifecycle(awaiting, {
      kind: GovernanceTransitionKind.Continue,
      actor: { kind: GovernanceActorKind.User, id: "user-1" },
      reason: "One bounded revision pass.",
      now: "2026-07-17T00:00:06.000Z",
    });
    expect(continued.state).toBe(GovernanceLifecycleState.Planning);
    expect(continued.userAuthorizedPasses).toBe(1);

    const approved = transitionGovernanceLifecycle(awaiting, {
      kind: GovernanceTransitionKind.Approve,
      actor: { kind: GovernanceActorKind.User, id: "user-1" },
      reason: "Approved evidence.",
      now: "2026-07-17T00:00:06.000Z",
    });
    expect(approved.state).toBe(GovernanceLifecycleState.Approved);
    expect(() =>
      createGovernanceLifecycle({
        id: "run-2",
        workflowId: "workflow-1",
        fingerprints,
        limits,
        now: "2026-07-17T00:00:07.000Z",
        priorLifecycles: [approved],
      }),
    ).toThrow("Approved fingerprints require a changed scope or evidence");
  });

  it("rejects tampered persisted transition chains, fingerprints, and budget snapshots", () => {
    const executing = createExecutingLifecycle();
    const tampered = {
      ...executing,
      budgets: { ...executing.budgets, execution: 0 },
    };

    expect(parseGovernanceLifecycles([executing])).toEqual([executing]);
    expect(parseGovernanceLifecycles([tampered])).toEqual([]);
    expect(
      parseGovernanceLifecycles([
        {
          ...executing,
          transitions: executing.transitions.map((transition, index) =>
            index === 0
              ? { ...transition, id: "forged-transition" }
              : transition,
          ),
        },
      ]),
    ).toEqual([]);
  });
});

const createExecutingLifecycle = () => {
  const draft = createGovernanceLifecycle({
    id: "run-1",
    workflowId: "workflow-1",
    fingerprints,
    limits,
    now: "2026-07-17T00:00:00.000Z",
  });
  const planning = transitionGovernanceLifecycle(draft, {
    kind: GovernanceTransitionKind.StartPlanning,
    actor: { kind: GovernanceActorKind.System, id: "runtime" },
    reason: "Plan.",
    now: "2026-07-17T00:00:01.000Z",
  });
  return transitionGovernanceLifecycle(planning, {
    kind: GovernanceTransitionKind.StartExecuting,
    actor: { kind: GovernanceActorKind.System, id: "runtime" },
    reason: "Execute.",
    now: "2026-07-17T00:00:02.000Z",
  });
};

const createAwaitingApprovalLifecycle = () => {
  const executing = createExecutingLifecycle();
  const verifying = transitionGovernanceLifecycle(executing, {
    kind: GovernanceTransitionKind.StartVerifying,
    actor: { kind: GovernanceActorKind.System, id: "runtime" },
    reason: "Verify.",
    now: "2026-07-17T00:00:03.000Z",
  });
  const reviewing = transitionGovernanceLifecycle(verifying, {
    kind: GovernanceTransitionKind.StartReviewing,
    actor: { kind: GovernanceActorKind.System, id: "review" },
    reason: "Review.",
    now: "2026-07-17T00:00:04.000Z",
  });
  return transitionGovernanceLifecycle(reviewing, {
    kind: GovernanceTransitionKind.AwaitUserApproval,
    actor: { kind: GovernanceActorKind.System, id: "review" },
    reason: "Awaiting user decision.",
    now: "2026-07-17T00:00:05.000Z",
  });
};
