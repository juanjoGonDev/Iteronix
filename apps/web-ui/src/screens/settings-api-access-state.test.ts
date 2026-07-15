import { describe, expect, it } from "vitest";
import {
  ExternalApiKeyScopeSelection,
  readExternalApiKeyScope,
} from "./settings-api-access-state.js";

describe("external API key scope selector", () => {
  it("defaults to every workflow", () => {
    expect(
      readExternalApiKeyScope(ExternalApiKeyScopeSelection.AllWorkflows, []),
    ).toEqual({ kind: "all_workflows" });
  });

  it("uses only the workflow IDs selected in the selector", () => {
    expect(
      readExternalApiKeyScope(ExternalApiKeyScopeSelection.SelectedWorkflows, [
        "workflow-a",
        "workflow-b",
        "workflow-a",
      ]),
    ).toEqual({
      kind: "selected_workflows",
      workflowIds: ["workflow-a", "workflow-b"],
    });
  });
});
