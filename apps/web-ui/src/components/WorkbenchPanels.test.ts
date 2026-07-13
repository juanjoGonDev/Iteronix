import { describe, expect, it } from "vitest";

import { EmptyStatePanel } from "./WorkbenchPanels.js";

describe("empty state panel", () => {
  it("constructs the workflow-only empty-state primitive", () => {
    const panel = new EmptyStatePanel({
      icon: "account_tree",
      title: "No workflows",
      description: "Create a workflow to begin.",
    });

    expect(panel).toBeInstanceOf(EmptyStatePanel);
  });
});
