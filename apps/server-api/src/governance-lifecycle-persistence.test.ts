import { describe, expect, it } from "vitest";
import {
  GovernanceActorKind,
  GovernanceTransitionKind,
  createGovernanceLifecycle,
  transitionGovernanceLifecycle,
} from "../../../packages/domain/src/governance-lifecycle";
import {
  createDefaultApplicationState,
  parseApplicationState,
  type ApplicationState,
} from "./application-state";
import { createWorkflowCatalogStore } from "../../../packages/agents/src/workflow-catalog";
import { createProviderStore } from "./providers";
import { createApplicationPersistence } from "./server";

describe("governance lifecycle application persistence", () => {
  it("preserves a restart-safe audit record with spent budget and approval checkpoint", () => {
    const draft = createGovernanceLifecycle({
      id: "run-1",
      workflowId: "workflow-1",
      fingerprints: { scope: "scope-v1", evidence: "evidence-v1" },
      limits: { execution: 1, repair: 1, review: 1 },
      now: "2026-07-17T00:00:00.000Z",
    });
    const planning = transitionGovernanceLifecycle(draft, {
      kind: GovernanceTransitionKind.StartPlanning,
      actor: { kind: GovernanceActorKind.System, id: "runtime" },
      reason: "Plan.",
      now: "2026-07-17T00:00:01.000Z",
    });
    const executing = transitionGovernanceLifecycle(planning, {
      kind: GovernanceTransitionKind.StartExecuting,
      actor: { kind: GovernanceActorKind.System, id: "runtime" },
      reason: "Execute.",
      now: "2026-07-17T00:00:02.000Z",
    });
    const restarted = parseApplicationState({
      ...createDefaultApplicationState(),
      governanceLifecycles: [executing],
    });

    expect(restarted.governanceLifecycles).toEqual([executing]);
    expect(restarted.governanceLifecycles[0]?.budgets.execution).toBe(1);
  });

  it("drops malformed lifecycle records instead of corrupting Phase 0 state", () => {
    const restarted = parseApplicationState({
      ...createDefaultApplicationState(),
      governanceLifecycles: [{ state: "executing" }],
    });

    expect(restarted.governanceLifecycles).toEqual([]);
    expect(restarted.workflows).toEqual(
      createDefaultApplicationState().workflows,
    );
  });

  it("persists lifecycle audit changes through the same server persistence boundary", async () => {
    const initialState = createDefaultApplicationState();
    const savedStates: ApplicationState[] = [];
    const persistence = createApplicationPersistence({
      initialState,
      providerStore: createProviderStore(),
      workflowCatalog: createWorkflowCatalogStore(),
      stateStore: {
        load: async () => initialState,
        save: async (state) => {
          const saved = { ...state, revision: state.revision + 1 };
          savedStates.push(saved);
          return saved;
        },
        update: async (updater) => updater(initialState),
      },
    });
    const lifecycle = createGovernanceLifecycle({
      id: "run-2",
      workflowId: "workflow-1",
      fingerprints: { scope: "scope-v2", evidence: "evidence-v2" },
      limits: { execution: 1, repair: 1, review: 1 },
      now: "2026-07-17T00:00:00.000Z",
    });

    await persistence.updateGovernanceLifecycles([lifecycle]);

    expect(savedStates[0]?.governanceLifecycles).toEqual([lifecycle]);
  });
});
