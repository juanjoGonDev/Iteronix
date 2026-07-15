import { describe, expect, it } from "vitest";
import {
  WorkflowExecutionStatus,
  WorkflowTriggerKind,
  createDefaultWorkflowCatalogState,
  isWorkflowTriggerKindSupportedInMvp,
  resolveWorkflowRuntimeSettings,
} from "./workflows";

describe("workflow shared contracts", () => {
  it("creates an empty workflow catalog state", () => {
    expect(createDefaultWorkflowCatalogState()).toEqual({
      definitions: [],
      assets: [],
      assetUsages: [],
      executions: [],
      definitionVersions: [],
    });
  });

  it("exposes queued as a persisted workflow execution status", () => {
    expect(WorkflowExecutionStatus.Queued).toBe("queued");
  });

  it("supports only manual triggers in the MVP runtime", () => {
    expect(
      isWorkflowTriggerKindSupportedInMvp(WorkflowTriggerKind.Manual),
    ).toBe(true);
    expect(
      isWorkflowTriggerKindSupportedInMvp(WorkflowTriggerKind.Schedule),
    ).toBe(false);
    expect(
      isWorkflowTriggerKindSupportedInMvp(WorkflowTriggerKind.Webhook),
    ).toBe(false);
    expect(isWorkflowTriggerKindSupportedInMvp(WorkflowTriggerKind.Event)).toBe(
      false,
    );
    expect(isWorkflowTriggerKindSupportedInMvp(WorkflowTriggerKind.Init)).toBe(
      false,
    );
  });

  it("merges a workflow runtime override onto application defaults", () => {
    expect(
      resolveWorkflowRuntimeSettings(
        {
          infiniteLoops: false,
          maxLoops: 50,
          externalCalls: true,
          soundEnabled: true,
          webhookUrl: "",
        },
        {
          maxLoops: 12,
          externalCalls: false,
          webhookUrl: "https://notify.example.com/workflows",
        },
      ),
    ).toEqual({
      infiniteLoops: false,
      maxLoops: 12,
      externalCalls: false,
      soundEnabled: true,
      webhookUrl: "https://notify.example.com/workflows",
    });
  });
});
