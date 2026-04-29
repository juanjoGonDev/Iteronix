import type {
  KanbanColumnSummary,
  KanbanTask,
  KanbanTaskStatus
} from "../components/KanbanPrimitives.js";
import type {
  KanbanColumnRecord,
  KanbanTaskRecord
} from "../shared/kanban-client.js";

export type KanbanColumnDefinition = {
  id: KanbanTaskStatus;
  title: string;
  position: number;
};

export type KanbanBoardView = {
  columns: ReadonlyArray<KanbanColumnSummary>;
  tasks: ReadonlyArray<KanbanTask>;
  columnIdsByStatus: Partial<Record<KanbanTaskStatus, string>>;
};

const DefaultPriority = "medium";

export const defaultKanbanBoardName = "Iteronix Workbench";

export const defaultKanbanColumnDefinitions: ReadonlyArray<KanbanColumnDefinition> = [
  { id: "ideas", title: "IDEAS", position: 0 },
  { id: "todo", title: "TODO", position: 1 },
  { id: "in_progress", title: "IN_PROGRESS", position: 2 },
  { id: "qa", title: "QA", position: 3 },
  { id: "done", title: "DONE", position: 4 }
];

export const createKanbanBoardView = (
  columns: ReadonlyArray<KanbanColumnRecord>,
  tasks: ReadonlyArray<KanbanTaskRecord>
): KanbanBoardView => {
  const columnIdsByStatus = createColumnIdsByStatus(columns);
  const statusesByColumnId = createStatusesByColumnId(columnIdsByStatus);

  return {
    columns: defaultKanbanColumnDefinitions.map((definition) => ({
      id: definition.id,
      title: definition.title
    })),
    tasks: tasks
      .filter((task) => statusesByColumnId[task.columnId] !== undefined)
      .sort((first, second) =>
        compareKanbanTaskRecords(first, second, statusesByColumnId)
      )
      .map((task) => createKanbanTask(task, statusesByColumnId[task.columnId])),
    columnIdsByStatus
  };
};

export const readKanbanStatusFromColumnName = (
  columnName: string
): KanbanTaskStatus | null => {
  const normalized = columnName.trim().toLowerCase();
  const definition = defaultKanbanColumnDefinitions.find(
    (item) => item.id === normalized || item.title.toLowerCase() === normalized
  );

  return definition?.id ?? null;
};

const createColumnIdsByStatus = (
  columns: ReadonlyArray<KanbanColumnRecord>
): Partial<Record<KanbanTaskStatus, string>> => {
  const columnIdsByStatus: Partial<Record<KanbanTaskStatus, string>> = {};

  for (const column of columns) {
    const status = readKanbanStatusFromColumnName(column.name);
    if (status && columnIdsByStatus[status] === undefined) {
      columnIdsByStatus[status] = column.id;
    }
  }

  return columnIdsByStatus;
};

const createStatusesByColumnId = (
  columnIdsByStatus: Partial<Record<KanbanTaskStatus, string>>
): Record<string, KanbanTaskStatus> => {
  const statusesByColumnId: Record<string, KanbanTaskStatus> = {};

  for (const definition of defaultKanbanColumnDefinitions) {
    const columnId = columnIdsByStatus[definition.id];
    if (columnId) {
      statusesByColumnId[columnId] = definition.id;
    }
  }

  return statusesByColumnId;
};

const createKanbanTask = (
  task: KanbanTaskRecord,
  status: KanbanTaskStatus | undefined
): KanbanTask => {
  const taskStatus = status ?? "ideas";

  return {
    id: task.id,
    title: task.title,
    description: task.description ?? "",
    priority: DefaultPriority,
    status: taskStatus,
    column: taskStatus
  };
};

const compareKanbanTaskRecords = (
  first: KanbanTaskRecord,
  second: KanbanTaskRecord,
  statusesByColumnId: Record<string, KanbanTaskStatus>
): number => {
  const firstStatus = statusesByColumnId[first.columnId] ?? "ideas";
  const secondStatus = statusesByColumnId[second.columnId] ?? "ideas";
  const statusDifference =
    readKanbanStatusPosition(firstStatus) - readKanbanStatusPosition(secondStatus);

  return statusDifference === 0
    ? first.position - second.position
    : statusDifference;
};

const readKanbanStatusPosition = (status: KanbanTaskStatus): number =>
  defaultKanbanColumnDefinitions.find((definition) => definition.id === status)
    ?.position ?? 0;
