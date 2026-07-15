type FetchImplementation = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export const dispatchWorkflowNotification = async (input: {
  webhookUrl: string;
  workflowId: string;
  executionId: string;
  status: "completed" | "failed" | "canceled";
  fetchImplementation?: FetchImplementation;
}): Promise<void> => {
  const webhookUrl = input.webhookUrl.trim();
  if (webhookUrl.length === 0) {
    return;
  }

  const fetchImplementation = input.fetchImplementation ?? fetch;
  await fetchImplementation(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: `workflow.execution.${input.status}`,
      workflowId: input.workflowId,
      executionId: input.executionId,
      status: input.status,
    }),
  });
};
