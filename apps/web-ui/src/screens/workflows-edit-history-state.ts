export type WorkflowEditHistoryEntry<TWorkflow> = {
  id: string;
  label: string;
  changedAt: string;
  hash: string;
  workflow: TWorkflow;
};

export type WorkflowEditHistoryState<TWorkflow> = {
  current: TWorkflow;
  history: ReadonlyArray<WorkflowEditHistoryEntry<TWorkflow>>;
  future: ReadonlyArray<WorkflowEditHistoryEntry<TWorkflow>>;
};

const HashSeed = 0x811c9dc5;
const HashPrime = 0x01000193;
const HashBase = 16;
const HashLength = 8;
const HistoryFallbackLabel = "Workflow draft";

export const createWorkflowEditHistoryEntry = <TWorkflow>(
  workflow: TWorkflow,
  changedAt = new Date().toISOString(),
): WorkflowEditHistoryEntry<TWorkflow> => {
  const hash = readWorkflowEditHistoryHash(workflow);
  return {
    id: `${changedAt}-${hash}`,
    label: readWorkflowEditHistoryLabel(workflow),
    changedAt,
    hash,
    workflow,
  };
};

export const readWorkflowEditHistoryHash = (workflow: unknown): string =>
  readStableHash(JSON.stringify(workflow));

export const undoWorkflowEditHistory = <TWorkflow>(
  state: WorkflowEditHistoryState<TWorkflow>,
): WorkflowEditHistoryState<TWorkflow> => {
  const [previous, ...history] = state.history;
  if (!previous) {
    return state;
  }

  return {
    current: previous.workflow,
    history,
    future: [createWorkflowEditHistoryEntry(state.current), ...state.future],
  };
};

export const redoWorkflowEditHistory = <TWorkflow>(
  state: WorkflowEditHistoryState<TWorkflow>,
): WorkflowEditHistoryState<TWorkflow> => {
  const [next, ...future] = state.future;
  if (!next) {
    return state;
  }

  return {
    current: next.workflow,
    history: [createWorkflowEditHistoryEntry(state.current), ...state.history],
    future,
  };
};

export const restoreWorkflowEditHistoryEntry = <TWorkflow>(input: {
  current: TWorkflow;
  entry: WorkflowEditHistoryEntry<TWorkflow>;
  history: ReadonlyArray<WorkflowEditHistoryEntry<TWorkflow>>;
  future: ReadonlyArray<WorkflowEditHistoryEntry<TWorkflow>>;
}): WorkflowEditHistoryState<TWorkflow> => ({
  current: input.entry.workflow,
  history: [
    createWorkflowEditHistoryEntry(input.current),
    ...input.history.filter((entry) => entry.id !== input.entry.id),
  ],
  future: [],
});

const readWorkflowEditHistoryLabel = (workflow: unknown): string => {
  if (
    workflow !== null &&
    typeof workflow === "object" &&
    "name" in workflow &&
    typeof workflow.name === "string" &&
    workflow.name.trim().length > 0
  ) {
    return workflow.name;
  }

  return HistoryFallbackLabel;
};

const readStableHash = (value: string): string => {
  let hash = HashSeed;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, HashPrime);
  }

  return (hash >>> 0).toString(HashBase).padStart(HashLength, "0");
};
