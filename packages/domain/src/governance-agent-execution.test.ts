import { describe, expect, it } from "vitest";
import {
  GovernanceActorKind,
  GovernanceLifecycleState,
  GovernanceTransitionKind,
  createGovernanceLifecycle,
  parseGovernanceLifecycles,
  recordGovernanceAgentExecution,
  transitionGovernanceLifecycle,
} from "./governance-lifecycle";

describe("governance agent execution records", () => {
  it("persists immutable provenance only while the lifecycle is executing", () => {
    const executing = createExecutingLifecycle();
    const recorded = recordGovernanceAgentExecution(executing, {
      id: "lifecycle-1:agent:1",
      lifecycleId: "lifecycle-1",
      agentId: "reference-agent",
      pluginId: "reference-knowledge",
      skillId: "knowledge.query",
      skillVersion: 1,
      toolId: "knowledge.query",
      inputFingerprint: "input-fingerprint",
      outputFingerprint: "output-fingerprint",
      artifactFingerprint: "skill-fingerprint",
      responseFingerprint: "response-fingerprint",
      timestamp: "2026-07-18T00:00:02.500Z",
    });

    expect(recorded.agentExecutions).toHaveLength(1);
    expect(parseGovernanceLifecycles([structuredClone(recorded)])).toEqual([
      recorded,
    ]);
    expect(() =>
      recordGovernanceAgentExecution(
        { ...recorded, state: GovernanceLifecycleState.Approved },
        recorded.agentExecutions[0]!,
      ),
    ).toThrow("Agent executions require an executing lifecycle");
  });
});

const createExecutingLifecycle = () => {
  const draft = createGovernanceLifecycle({
    id: "lifecycle-1",
    workflowId: "workflow-1",
    fingerprints: { scope: "scope", evidence: "evidence" },
    limits: { execution: 1, repair: 1, review: 1 },
    now: "2026-07-18T00:00:00.000Z",
  });
  const planning = transitionGovernanceLifecycle(draft, {
    kind: GovernanceTransitionKind.StartPlanning,
    actor: { kind: GovernanceActorKind.System, id: "runtime" },
    reason: "Planning.",
    now: "2026-07-18T00:00:01.000Z",
  });
  return transitionGovernanceLifecycle(planning, {
    kind: GovernanceTransitionKind.StartExecuting,
    actor: { kind: GovernanceActorKind.System, id: "runtime" },
    reason: "Executing.",
    now: "2026-07-18T00:00:02.000Z",
  });
};
