import type {
  WorkflowDefinitionRecord,
  WorkflowExecutionRecord,
} from "./workflows-editor-state.js";

export const WorkflowCatalogSort = {
  UpdatedDescending: "updated-desc",
  NameAscending: "name-asc",
} as const;

export type WorkflowCatalogSort =
  (typeof WorkflowCatalogSort)[keyof typeof WorkflowCatalogSort];

export type WorkflowCatalogRow = {
  workflow: WorkflowDefinitionRecord;
  execution: {
    total: number;
    latest: WorkflowExecutionRecord | null;
  };
};

export const readWorkflowCatalogRows = (input: {
  workflows: ReadonlyArray<WorkflowDefinitionRecord>;
  executions: ReadonlyArray<WorkflowExecutionRecord>;
  query: string;
  sort: WorkflowCatalogSort;
}): ReadonlyArray<WorkflowCatalogRow> => {
  const normalizedQuery = input.query.trim().toLocaleLowerCase();
  const executionsByWorkflowId = groupExecutionsByWorkflowId(input.executions);

  return input.workflows
    .filter((workflow) =>
      normalizedQuery.length === 0
        ? true
        : workflow.name.toLocaleLowerCase().includes(normalizedQuery),
    )
    .map((workflow) => {
      const executions = executionsByWorkflowId.get(workflow.id) ?? [];
      return {
        workflow,
        execution: {
          total: executions.length,
          latest: executions[0] ?? null,
        },
      };
    })
    .sort((left, right) => compareWorkflowCatalogRows(left, right, input.sort));
};

export const readWorkflowEditorTarget = (
  workflows: ReadonlyArray<WorkflowDefinitionRecord>,
  workflowId: string,
): WorkflowDefinitionRecord | null =>
  workflows.find((workflow) => workflow.id === workflowId) ?? null;

const groupExecutionsByWorkflowId = (
  executions: ReadonlyArray<WorkflowExecutionRecord>,
): ReadonlyMap<string, ReadonlyArray<WorkflowExecutionRecord>> => {
  const grouped = new Map<string, WorkflowExecutionRecord[]>();

  executions.forEach((execution) => {
    const values = grouped.get(execution.workflowId) ?? [];
    values.push(execution);
    grouped.set(execution.workflowId, values);
  });

  grouped.forEach((values) => {
    values.sort(
      (left, right) =>
        right.startedAt.localeCompare(left.startedAt) ||
        right.id.localeCompare(left.id),
    );
  });

  return grouped;
};

const compareWorkflowCatalogRows = (
  left: WorkflowCatalogRow,
  right: WorkflowCatalogRow,
  sort: WorkflowCatalogSort,
): number => {
  if (sort === WorkflowCatalogSort.NameAscending) {
    return (
      left.workflow.name.localeCompare(right.workflow.name) ||
      left.workflow.id.localeCompare(right.workflow.id)
    );
  }

  return (
    right.workflow.updatedAt.localeCompare(left.workflow.updatedAt) ||
    left.workflow.name.localeCompare(right.workflow.name) ||
    left.workflow.id.localeCompare(right.workflow.id)
  );
};
