import { requestJson } from "./server-api-client.js";

const EndpointPath = {
  BoardsCreate: "/kanban/boards/create",
  BoardsList: "/kanban/boards/list",
  ColumnsCreate: "/kanban/columns/create",
  ColumnsList: "/kanban/columns/list",
  TasksCreate: "/kanban/tasks/create",
  TasksList: "/kanban/tasks/list",
  TasksUpdate: "/kanban/tasks/update",
  TasksDelete: "/kanban/tasks/delete"
} as const;

export type KanbanBoardRecord = {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type KanbanColumnRecord = {
  id: string;
  boardId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type KanbanTaskRecord = {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type KanbanClient = {
  listBoards: (input: { projectId: string }) => Promise<ReadonlyArray<KanbanBoardRecord>>;
  createBoard: (input: { projectId: string; name: string }) => Promise<KanbanBoardRecord>;
  listColumns: (input: {
    projectId: string;
    boardId: string;
  }) => Promise<ReadonlyArray<KanbanColumnRecord>>;
  createColumn: (input: {
    projectId: string;
    boardId: string;
    name: string;
    position: number;
  }) => Promise<KanbanColumnRecord>;
  listTasks: (input: {
    projectId: string;
    boardId: string;
  }) => Promise<ReadonlyArray<KanbanTaskRecord>>;
  createTask: (input: {
    projectId: string;
    boardId: string;
    columnId: string;
    title: string;
    description: string;
    position: number;
  }) => Promise<KanbanTaskRecord>;
  updateTask: (input: {
    projectId: string;
    boardId: string;
    taskId: string;
    columnId?: string;
    title?: string;
    description?: string;
    position?: number;
  }) => Promise<KanbanTaskRecord>;
  deleteTask: (input: {
    projectId: string;
    boardId: string;
    taskId: string;
  }) => Promise<KanbanTaskRecord>;
};

export const createKanbanClient = (): KanbanClient => ({
  listBoards: (input) =>
    requestJson({
      path: EndpointPath.BoardsList,
      body: { projectId: input.projectId },
      parse: parseKanbanBoardsResponse
    }),
  createBoard: (input) =>
    requestJson({
      path: EndpointPath.BoardsCreate,
      body: {
        projectId: input.projectId,
        name: input.name
      },
      parse: parseKanbanBoardResponse
    }),
  listColumns: (input) =>
    requestJson({
      path: EndpointPath.ColumnsList,
      body: {
        projectId: input.projectId,
        boardId: input.boardId
      },
      parse: parseKanbanColumnsResponse
    }),
  createColumn: (input) =>
    requestJson({
      path: EndpointPath.ColumnsCreate,
      body: {
        projectId: input.projectId,
        boardId: input.boardId,
        name: input.name,
        position: input.position
      },
      parse: parseKanbanColumnResponse
    }),
  listTasks: (input) =>
    requestJson({
      path: EndpointPath.TasksList,
      body: {
        projectId: input.projectId,
        boardId: input.boardId
      },
      parse: parseKanbanTasksResponse
    }),
  createTask: (input) =>
    requestJson({
      path: EndpointPath.TasksCreate,
      body: {
        projectId: input.projectId,
        boardId: input.boardId,
        columnId: input.columnId,
        title: input.title,
        description: input.description,
        position: input.position
      },
      parse: parseKanbanTaskResponse
    }),
  updateTask: (input) =>
    requestJson({
      path: EndpointPath.TasksUpdate,
      body: {
        projectId: input.projectId,
        boardId: input.boardId,
        taskId: input.taskId,
        ...(input.columnId !== undefined ? { columnId: input.columnId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.position !== undefined ? { position: input.position } : {})
      },
      parse: parseKanbanTaskResponse
    }),
  deleteTask: (input) =>
    requestJson({
      path: EndpointPath.TasksDelete,
      body: {
        projectId: input.projectId,
        boardId: input.boardId,
        taskId: input.taskId
      },
      parse: parseKanbanTaskResponse
    })
});

export const parseKanbanBoardResponse = (value: unknown): KanbanBoardRecord =>
  parseKanbanBoardRecord(readRequiredRecord(value, "kanbanBoardResponse", "board"));

export const parseKanbanBoardsResponse = (
  value: unknown
): ReadonlyArray<KanbanBoardRecord> =>
  readRequiredArray(value, "kanbanBoardsResponse", "boards").map((item) =>
    parseKanbanBoardRecord(ensureRecord(item, "kanbanBoardRecord"))
  );

export const parseKanbanColumnResponse = (value: unknown): KanbanColumnRecord =>
  parseKanbanColumnRecord(readRequiredRecord(value, "kanbanColumnResponse", "column"));

export const parseKanbanColumnsResponse = (
  value: unknown
): ReadonlyArray<KanbanColumnRecord> =>
  readRequiredArray(value, "kanbanColumnsResponse", "columns").map((item) =>
    parseKanbanColumnRecord(ensureRecord(item, "kanbanColumnRecord"))
  );

export const parseKanbanTaskResponse = (value: unknown): KanbanTaskRecord =>
  parseKanbanTaskRecord(readRequiredRecord(value, "kanbanTaskResponse", "task"));

export const parseKanbanTasksResponse = (
  value: unknown
): ReadonlyArray<KanbanTaskRecord> =>
  readRequiredArray(value, "kanbanTasksResponse", "tasks").map((item) =>
    parseKanbanTaskRecord(ensureRecord(item, "kanbanTaskRecord"))
  );

const parseKanbanBoardRecord = (
  value: Record<string, unknown>
): KanbanBoardRecord => ({
  id: readRequiredString(value, "kanbanBoardRecord", "id"),
  projectId: readRequiredString(value, "kanbanBoardRecord", "projectId"),
  name: readRequiredString(value, "kanbanBoardRecord", "name"),
  createdAt: readRequiredString(value, "kanbanBoardRecord", "createdAt"),
  updatedAt: readRequiredString(value, "kanbanBoardRecord", "updatedAt")
});

const parseKanbanColumnRecord = (
  value: Record<string, unknown>
): KanbanColumnRecord => ({
  id: readRequiredString(value, "kanbanColumnRecord", "id"),
  boardId: readRequiredString(value, "kanbanColumnRecord", "boardId"),
  name: readRequiredString(value, "kanbanColumnRecord", "name"),
  position: readRequiredNumber(value, "kanbanColumnRecord", "position"),
  createdAt: readRequiredString(value, "kanbanColumnRecord", "createdAt"),
  updatedAt: readRequiredString(value, "kanbanColumnRecord", "updatedAt")
});

const parseKanbanTaskRecord = (
  value: Record<string, unknown>
): KanbanTaskRecord => {
  const description = readOptionalString(value, "kanbanTaskRecord", "description");

  return {
    id: readRequiredString(value, "kanbanTaskRecord", "id"),
    boardId: readRequiredString(value, "kanbanTaskRecord", "boardId"),
    columnId: readRequiredString(value, "kanbanTaskRecord", "columnId"),
    title: readRequiredString(value, "kanbanTaskRecord", "title"),
    position: readRequiredNumber(value, "kanbanTaskRecord", "position"),
    createdAt: readRequiredString(value, "kanbanTaskRecord", "createdAt"),
    updatedAt: readRequiredString(value, "kanbanTaskRecord", "updatedAt"),
    ...(description !== undefined ? { description } : {})
  };
};

const ensureRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }

  return value as Record<string, unknown>;
};

const readRequiredRecord = (
  value: unknown,
  label: string,
  key: string
): Record<string, unknown> => {
  const record = ensureRecord(value, label);
  return ensureRecord(record[key], `${label}.${key}`);
};

const readRequiredArray = (
  value: unknown,
  label: string,
  key: string
): ReadonlyArray<unknown> => {
  const record = ensureRecord(value, label);
  const nested = record[key];
  if (!Array.isArray(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredString = (
  value: Record<string, unknown>,
  label: string,
  key: string
): string => {
  const nested = value[key];
  if (typeof nested !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readOptionalString = (
  value: Record<string, unknown>,
  label: string,
  key: string
): string | undefined => {
  const nested = value[key];
  if (nested === undefined) {
    return undefined;
  }

  if (typeof nested !== "string") {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};

const readRequiredNumber = (
  value: Record<string, unknown>,
  label: string,
  key: string
): number => {
  const nested = value[key];
  if (typeof nested !== "number" || Number.isNaN(nested)) {
    throw new Error(`Invalid ${label}.${key}`);
  }

  return nested;
};
