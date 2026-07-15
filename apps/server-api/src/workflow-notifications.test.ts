import { describe, expect, it, vi } from "vitest";
import { dispatchWorkflowNotification } from "./workflow-notifications";

describe("workflow notifications", () => {
  it("delivers a redacted workflow outcome only when an effective webhook is configured", async () => {
    const fetchImplementation = vi.fn(
      async () => new Response(null, { status: 204 }),
    );

    await dispatchWorkflowNotification({
      webhookUrl: "https://notify.example.com/workflows",
      workflowId: "workflow-1",
      executionId: "execution-1",
      status: "completed",
      fetchImplementation,
    });
    await dispatchWorkflowNotification({
      webhookUrl: "",
      workflowId: "workflow-1",
      executionId: "execution-2",
      status: "failed",
      fetchImplementation,
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://notify.example.com/workflows",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          event: "workflow.execution.completed",
          workflowId: "workflow-1",
          executionId: "execution-1",
          status: "completed",
        }),
      }),
    );
  });
});
