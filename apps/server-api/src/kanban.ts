import { randomUUID } from "node:crypto";
import { ErrorMessage } from "./constants";
import { ResultType, err, ok, type Result } from "./result";

export const KanbanStoreErrorCode = {
  InvalidInput: "invalid_input",
  NotFound: "not_found"
} as const;

export type KanbanStoreErrorCode =
  typeof KanbanStoreErrorCode[keyof typeof KanbanStoreErrorCode];

export type KanbanStoreError = {
  code: KanbanStoreErrorCode;
  message: string;
};

export type KanbanBoard = {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type KanbanColumn = {
  id: string;
  boardId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type KanbanTask = {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type KanbanBoardListInput = {
  projectId: string;
};

export type KanbanBoardCreateInput = {
  projectId: string;
  name: string;
};

export type KanbanBoardUpdateInput = {
  projectId: string;
  boardId: string;
  name: string;
};

export type KanbanBoardDeleteInput = {
  projectId: string;
  boardId: string;
};

export type KanbanColumnListInput = {
  projectId: string;
  boardId: string;
};

export type KanbanColumnCreateInput = {
  projectId: string;
  boardId: string;
  name: string;
  position?: number;
};

export type KanbanColumnUpdateInput = {
  projectId: string;
  boardId: string;
  columnId: string;
  name?: string;
  position?: number;
};

export type KanbanColumnDeleteInput = {
  projectId: string;
  boardId: string;
  columnId: string;
};

export type KanbanTaskListInput = {
  projectId: string;
  boardId: string;
  columnId?: string;
};

export type KanbanTaskCreateInput = {
  projectId: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  position?: number;
};

export type KanbanTaskUpdateInput = {
  projectId: string;
  boardId: string;
  taskId: string;
  columnId?: string;
  title?: string;
  description?: string;
  position?: number;
};

export type KanbanTaskDeleteInput = {
  projectId: string;
  boardId: string;
  taskId: string;
};

export type KanbanStore = {
  listBoards: (
    input: KanbanBoardListInput
  ) => Result<ReadonlyArray<KanbanBoard>, KanbanStoreError>;
  createBoard: (
    input: KanbanBoardCreateInput
  ) => Result<KanbanBoard, KanbanStoreError>;
  updateBoard: (
    input: KanbanBoardUpdateInput
  ) => Result<KanbanBoard, KanbanStoreError>;
  deleteBoard: (
    input: KanbanBoardDeleteInput
  ) => Result<KanbanBoard, KanbanStoreError>;
  listColumns: (
    input: KanbanColumnListInput
  ) => Result<ReadonlyArray<KanbanColumn>, KanbanStoreError>;
  createColumn: (
    input: KanbanColumnCreateInput
  ) => Result<KanbanColumn, KanbanStoreError>;
  updateColumn: (
    input: KanbanColumnUpdateInput
  ) => Result<KanbanColumn, KanbanStoreError>;
  deleteColumn: (
    input: KanbanColumnDeleteInput
  ) => Result<KanbanColumn, KanbanStoreError>;
  listTasks: (
    input: KanbanTaskListInput
  ) => Result<ReadonlyArray<KanbanTask>, KanbanStoreError>;
  createTask: (
    input: KanbanTaskCreateInput
  ) => Result<KanbanTask, KanbanStoreError>;
  updateTask: (
    input: KanbanTaskUpdateInput
  ) => Result<KanbanTask, KanbanStoreError>;
  deleteTask: (
    input: KanbanTaskDeleteInput
  ) => Result<KanbanTask, KanbanStoreError>;
  snapshot: () => KanbanStoreSnapshot;
};

export type KanbanStoreSnapshot = {
  boards: ReadonlyArray<KanbanBoard>;
  columns: ReadonlyArray<KanbanColumn>;
  tasks: ReadonlyArray<KanbanTask>;
};

export type KanbanStoreSeed = Partial<KanbanStoreSnapshot>;

export const createKanbanStore = (seed: KanbanStoreSeed = {}): KanbanStore => {
  const boardsById = new Map<string, KanbanBoard>();
  const columnsById = new Map<string, KanbanColumn>();
  const tasksById = new Map<string, KanbanTask>();

  for (const board of seed.boards ?? []) {
    boardsById.set(board.id, board);
  }

  for (const column of seed.columns ?? []) {
    if (boardsById.has(column.boardId)) {
      columnsById.set(column.id, column);
    }
  }

  for (const task of seed.tasks ?? []) {
    if (boardsById.has(task.boardId) && columnsById.has(task.columnId)) {
      tasksById.set(task.id, task);
    }
  }

  const listBoards = (
    input: KanbanBoardListInput
  ): Result<ReadonlyArray<KanbanBoard>, KanbanStoreError> =>
    listBoardsForProject(boardsById, input);

  const createBoard = (
    input: KanbanBoardCreateInput
  ): Result<KanbanBoard, KanbanStoreError> =>
    createBoardRecord(boardsById, input);

  const updateBoard = (
    input: KanbanBoardUpdateInput
  ): Result<KanbanBoard, KanbanStoreError> =>
    updateBoardRecord(boardsById, input);

  const deleteBoard = (
    input: KanbanBoardDeleteInput
  ): Result<KanbanBoard, KanbanStoreError> =>
    deleteBoardRecord(boardsById, columnsById, tasksById, input);

  const listColumns = (
    input: KanbanColumnListInput
  ): Result<ReadonlyArray<KanbanColumn>, KanbanStoreError> =>
    listColumnsForBoard(boardsById, columnsById, input);

  const createColumn = (
    input: KanbanColumnCreateInput
  ): Result<KanbanColumn, KanbanStoreError> =>
    createColumnRecord(boardsById, columnsById, input);

  const updateColumn = (
    input: KanbanColumnUpdateInput
  ): Result<KanbanColumn, KanbanStoreError> =>
    updateColumnRecord(boardsById, columnsById, input);

  const deleteColumn = (
    input: KanbanColumnDeleteInput
  ): Result<KanbanColumn, KanbanStoreError> =>
    deleteColumnRecord(boardsById, columnsById, tasksById, input);

  const listTasks = (
    input: KanbanTaskListInput
  ): Result<ReadonlyArray<KanbanTask>, KanbanStoreError> =>
    listTasksForBoard(boardsById, columnsById, tasksById, input);

  const createTask = (
    input: KanbanTaskCreateInput
  ): Result<KanbanTask, KanbanStoreError> =>
    createTaskRecord(boardsById, columnsById, tasksById, input);

  const updateTask = (
    input: KanbanTaskUpdateInput
  ): Result<KanbanTask, KanbanStoreError> =>
    updateTaskRecord(boardsById, columnsById, tasksById, input);

  const deleteTask = (
    input: KanbanTaskDeleteInput
  ): Result<KanbanTask, KanbanStoreError> =>
    deleteTaskRecord(boardsById, tasksById, input);

  const snapshot = (): KanbanStoreSnapshot => ({
    boards: Array.from(boardsById.values()),
    columns: Array.from(columnsById.values()),
    tasks: Array.from(tasksById.values())
  });

  return {
    listBoards,
    createBoard,
    updateBoard,
    deleteBoard,
    listColumns,
    createColumn,
    updateColumn,
    deleteColumn,
    listTasks,
    createTask,
    updateTask,
    deleteTask,
    snapshot
  };
};

const listBoardsForProject = (
  boardsById: Map<string, KanbanBoard>,
  input: KanbanBoardListInput
): Result<ReadonlyArray<KanbanBoard>, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boards = Array.from(boardsById.values()).filter(
    (board) => board.projectId === projectId
  );
  return ok(boards);
};

const createBoardRecord = (
  boardsById: Map<string, KanbanBoard>,
  input: KanbanBoardCreateInput
): Result<KanbanBoard, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const name = normalizeText(input.name);
  if (!name) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardName
    });
  }

  const board = createBoardEntity({
    projectId,
    name
  });
  boardsById.set(board.id, board);
  return ok(board);
};

const updateBoardRecord = (
  boardsById: Map<string, KanbanBoard>,
  input: KanbanBoardUpdateInput
): Result<KanbanBoard, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boardId = normalizeId(input.boardId);
  if (!boardId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardId
    });
  }

  const name = normalizeText(input.name);
  if (!name) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardName
    });
  }

  const boardResult = getBoardForProject(boardsById, projectId, boardId);
  if (boardResult.type === ResultType.Err) {
    return boardResult;
  }

  const updated = updateBoardEntity(boardResult.value, {
    name
  });
  boardsById.set(updated.id, updated);
  return ok(updated);
};

const deleteBoardRecord = (
  boardsById: Map<string, KanbanBoard>,
  columnsById: Map<string, KanbanColumn>,
  tasksById: Map<string, KanbanTask>,
  input: KanbanBoardDeleteInput
): Result<KanbanBoard, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boardId = normalizeId(input.boardId);
  if (!boardId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardId
    });
  }

  const boardResult = getBoardForProject(boardsById, projectId, boardId);
  if (boardResult.type === ResultType.Err) {
    return boardResult;
  }

  removeBoardData(boardsById, columnsById, tasksById, boardId);
  return ok(boardResult.value);
};

const listColumnsForBoard = (
  boardsById: Map<string, KanbanBoard>,
  columnsById: Map<string, KanbanColumn>,
  input: KanbanColumnListInput
): Result<ReadonlyArray<KanbanColumn>, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boardId = normalizeId(input.boardId);
  if (!boardId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardId
    });
  }

  const boardResult = getBoardForProject(boardsById, projectId, boardId);
  if (boardResult.type === ResultType.Err) {
    return boardResult;
  }

  const columns = Array.from(columnsById.values()).filter(
    (column) => column.boardId === boardId
  );
  return ok(sortByPosition(columns));
};

const createColumnRecord = (
  boardsById: Map<string, KanbanBoard>,
  columnsById: Map<string, KanbanColumn>,
  input: KanbanColumnCreateInput
): Result<KanbanColumn, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boardId = normalizeId(input.boardId);
  if (!boardId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardId
    });
  }

  const name = normalizeText(input.name);
  if (!name) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingColumnName
    });
  }

  const boardResult = getBoardForProject(boardsById, projectId, boardId);
  if (boardResult.type === ResultType.Err) {
    return boardResult;
  }

  const positionResult = normalizePosition(input.position);
  if (positionResult.type === ResultType.Err) {
    return positionResult;
  }

  const position =
    positionResult.value ??
    getNextPosition(
      Array.from(columnsById.values()).filter(
        (column) => column.boardId === boardId
      )
    );

  const column = createColumnEntity({
    boardId,
    name,
    position
  });
  columnsById.set(column.id, column);
  return ok(column);
};

const updateColumnRecord = (
  boardsById: Map<string, KanbanBoard>,
  columnsById: Map<string, KanbanColumn>,
  input: KanbanColumnUpdateInput
): Result<KanbanColumn, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boardId = normalizeId(input.boardId);
  if (!boardId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardId
    });
  }

  const columnId = normalizeId(input.columnId);
  if (!columnId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingColumnId
    });
  }

  const name = input.name !== undefined ? normalizeText(input.name) : undefined;
  if (input.name !== undefined && !name) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingColumnName
    });
  }

  const positionResult = normalizePosition(input.position);
  if (positionResult.type === ResultType.Err) {
    return positionResult;
  }

  if (name === undefined && positionResult.value === undefined) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.InvalidBody
    });
  }

  const boardResult = getBoardForProject(boardsById, projectId, boardId);
  if (boardResult.type === ResultType.Err) {
    return boardResult;
  }

  const columnResult = getColumnForBoard(columnsById, boardId, columnId);
  if (columnResult.type === ResultType.Err) {
    return columnResult;
  }

  const updateInput: { name?: string; position?: number } = {};
  if (name !== undefined) {
    updateInput.name = name;
  }

  if (positionResult.value !== undefined) {
    updateInput.position = positionResult.value;
  }

  const updated = updateColumnEntity(columnResult.value, updateInput);
  columnsById.set(updated.id, updated);
  return ok(updated);
};

const deleteColumnRecord = (
  boardsById: Map<string, KanbanBoard>,
  columnsById: Map<string, KanbanColumn>,
  tasksById: Map<string, KanbanTask>,
  input: KanbanColumnDeleteInput
): Result<KanbanColumn, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boardId = normalizeId(input.boardId);
  if (!boardId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardId
    });
  }

  const columnId = normalizeId(input.columnId);
  if (!columnId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingColumnId
    });
  }

  const boardResult = getBoardForProject(boardsById, projectId, boardId);
  if (boardResult.type === ResultType.Err) {
    return boardResult;
  }

  const columnResult = getColumnForBoard(columnsById, boardId, columnId);
  if (columnResult.type === ResultType.Err) {
    return columnResult;
  }

  removeColumnData(columnsById, tasksById, columnId);
  return ok(columnResult.value);
};

const listTasksForBoard = (
  boardsById: Map<string, KanbanBoard>,
  columnsById: Map<string, KanbanColumn>,
  tasksById: Map<string, KanbanTask>,
  input: KanbanTaskListInput
): Result<ReadonlyArray<KanbanTask>, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boardId = normalizeId(input.boardId);
  if (!boardId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardId
    });
  }

  const boardResult = getBoardForProject(boardsById, projectId, boardId);
  if (boardResult.type === ResultType.Err) {
    return boardResult;
  }

  let columnFilter: string | undefined;

  if (input.columnId !== undefined) {
    const columnId = normalizeId(input.columnId);
    if (!columnId) {
      return err({
        code: KanbanStoreErrorCode.InvalidInput,
        message: ErrorMessage.MissingColumnId
      });
    }

    const columnResult = getColumnForBoard(columnsById, boardId, columnId);
    if (columnResult.type === ResultType.Err) {
      return columnResult;
    }

    columnFilter = columnId;
  }

  const tasks = Array.from(tasksById.values()).filter((task) => {
    if (task.boardId !== boardId) {
      return false;
    }

    if (columnFilter && task.columnId !== columnFilter) {
      return false;
    }

    return true;
  });

  return ok(sortByPosition(tasks));
};

const createTaskRecord = (
  boardsById: Map<string, KanbanBoard>,
  columnsById: Map<string, KanbanColumn>,
  tasksById: Map<string, KanbanTask>,
  input: KanbanTaskCreateInput
): Result<KanbanTask, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boardId = normalizeId(input.boardId);
  if (!boardId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardId
    });
  }

  const columnId = normalizeId(input.columnId);
  if (!columnId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingColumnId
    });
  }

  const title = normalizeText(input.title);
  if (!title) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingTaskTitle
    });
  }

  const description =
    input.description !== undefined ? normalizeText(input.description) : undefined;

  const boardResult = getBoardForProject(boardsById, projectId, boardId);
  if (boardResult.type === ResultType.Err) {
    return boardResult;
  }

  const columnResult = getColumnForBoard(columnsById, boardId, columnId);
  if (columnResult.type === ResultType.Err) {
    return columnResult;
  }

  const positionResult = normalizePosition(input.position);
  if (positionResult.type === ResultType.Err) {
    return positionResult;
  }

  const position =
    positionResult.value ??
    getNextPosition(
      Array.from(tasksById.values()).filter(
        (task) => task.columnId === columnId
      )
    );

  const taskInput: {
    boardId: string;
    columnId: string;
    title: string;
    position: number;
    description?: string;
  } = {
    boardId,
    columnId,
    title,
    position
  };

  if (description !== undefined) {
    taskInput.description = description;
  }

  const task = createTaskEntity(taskInput);
  tasksById.set(task.id, task);
  return ok(task);
};

const updateTaskRecord = (
  boardsById: Map<string, KanbanBoard>,
  columnsById: Map<string, KanbanColumn>,
  tasksById: Map<string, KanbanTask>,
  input: KanbanTaskUpdateInput
): Result<KanbanTask, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boardId = normalizeId(input.boardId);
  if (!boardId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardId
    });
  }

  const taskId = normalizeId(input.taskId);
  if (!taskId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingTaskId
    });
  }

  const title =
    input.title !== undefined ? normalizeText(input.title) : undefined;
  if (input.title !== undefined && !title) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingTaskTitle
    });
  }

  const description =
    input.description !== undefined ? normalizeText(input.description) : undefined;

  const positionResult = normalizePosition(input.position);
  if (positionResult.type === ResultType.Err) {
    return positionResult;
  }

  let columnId: string | undefined;
  if (input.columnId !== undefined) {
    const normalized = normalizeId(input.columnId);
    if (!normalized) {
      return err({
        code: KanbanStoreErrorCode.InvalidInput,
        message: ErrorMessage.MissingColumnId
      });
    }

    columnId = normalized;
  }

  if (
    title === undefined &&
    description === undefined &&
    columnId === undefined &&
    positionResult.value === undefined
  ) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.InvalidBody
    });
  }

  const boardResult = getBoardForProject(boardsById, projectId, boardId);
  if (boardResult.type === ResultType.Err) {
    return boardResult;
  }

  const taskResult = getTaskForBoard(tasksById, boardId, taskId);
  if (taskResult.type === ResultType.Err) {
    return taskResult;
  }

  if (columnId) {
    const columnResult = getColumnForBoard(columnsById, boardId, columnId);
    if (columnResult.type === ResultType.Err) {
      return columnResult;
    }
  }

  const updateInput: {
    title?: string;
    description?: string;
    columnId?: string;
    position?: number;
  } = {};

  if (title !== undefined) {
    updateInput.title = title;
  }

  if (description !== undefined) {
    updateInput.description = description;
  }

  if (columnId !== undefined) {
    updateInput.columnId = columnId;
  }

  if (positionResult.value !== undefined) {
    updateInput.position = positionResult.value;
  }

  const updated = updateTaskEntity(taskResult.value, updateInput);
  tasksById.set(updated.id, updated);
  return ok(updated);
};

const deleteTaskRecord = (
  boardsById: Map<string, KanbanBoard>,
  tasksById: Map<string, KanbanTask>,
  input: KanbanTaskDeleteInput
): Result<KanbanTask, KanbanStoreError> => {
  const projectId = normalizeId(input.projectId);
  if (!projectId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingProjectId
    });
  }

  const boardId = normalizeId(input.boardId);
  if (!boardId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingBoardId
    });
  }

  const taskId = normalizeId(input.taskId);
  if (!taskId) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.MissingTaskId
    });
  }

  const boardResult = getBoardForProject(boardsById, projectId, boardId);
  if (boardResult.type === ResultType.Err) {
    return boardResult;
  }

  const taskResult = getTaskForBoard(tasksById, boardId, taskId);
  if (taskResult.type === ResultType.Err) {
    return taskResult;
  }

  tasksById.delete(taskId);
  return ok(taskResult.value);
};

const getBoardForProject = (
  boardsById: Map<string, KanbanBoard>,
  projectId: string,
  boardId: string
): Result<KanbanBoard, KanbanStoreError> => {
  const board = boardsById.get(boardId);
  if (!board || board.projectId !== projectId) {
    return err({
      code: KanbanStoreErrorCode.NotFound,
      message: ErrorMessage.NotFound
    });
  }

  return ok(board);
};

const getColumnForBoard = (
  columnsById: Map<string, KanbanColumn>,
  boardId: string,
  columnId: string
): Result<KanbanColumn, KanbanStoreError> => {
  const column = columnsById.get(columnId);
  if (!column || column.boardId !== boardId) {
    return err({
      code: KanbanStoreErrorCode.NotFound,
      message: ErrorMessage.NotFound
    });
  }

  return ok(column);
};

const getTaskForBoard = (
  tasksById: Map<string, KanbanTask>,
  boardId: string,
  taskId: string
): Result<KanbanTask, KanbanStoreError> => {
  const task = tasksById.get(taskId);
  if (!task || task.boardId !== boardId) {
    return err({
      code: KanbanStoreErrorCode.NotFound,
      message: ErrorMessage.NotFound
    });
  }

  return ok(task);
};

const removeBoardData = (
  boardsById: Map<string, KanbanBoard>,
  columnsById: Map<string, KanbanColumn>,
  tasksById: Map<string, KanbanTask>,
  boardId: string
): void => {
  boardsById.delete(boardId);

  for (const column of columnsById.values()) {
    if (column.boardId === boardId) {
      columnsById.delete(column.id);
    }
  }

  for (const task of tasksById.values()) {
    if (task.boardId === boardId) {
      tasksById.delete(task.id);
    }
  }
};

const removeColumnData = (
  columnsById: Map<string, KanbanColumn>,
  tasksById: Map<string, KanbanTask>,
  columnId: string
): void => {
  columnsById.delete(columnId);

  for (const task of tasksById.values()) {
    if (task.columnId === columnId) {
      tasksById.delete(task.id);
    }
  }
};

const createBoardEntity = (input: {
  projectId: string;
  name: string;
}): KanbanBoard => {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    projectId: input.projectId,
    name: input.name,
    createdAt: now,
    updatedAt: now
  };
};

const updateBoardEntity = (
  board: KanbanBoard,
  input: { name: string }
): KanbanBoard => ({
  ...board,
  name: input.name,
  updatedAt: new Date().toISOString()
});

const createColumnEntity = (input: {
  boardId: string;
  name: string;
  position: number;
}): KanbanColumn => {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    boardId: input.boardId,
    name: input.name,
    position: input.position,
    createdAt: now,
    updatedAt: now
  };
};

const updateColumnEntity = (
  column: KanbanColumn,
  input: { name?: string; position?: number }
): KanbanColumn => {
  const updated: KanbanColumn = {
    ...column,
    updatedAt: new Date().toISOString()
  };

  if (input.name !== undefined) {
    updated.name = input.name;
  }

  if (input.position !== undefined) {
    updated.position = input.position;
  }

  return updated;
};

const createTaskEntity = (input: {
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  position: number;
}): KanbanTask => {
  const now = new Date().toISOString();
  const task: KanbanTask = {
    id: randomUUID(),
    boardId: input.boardId,
    columnId: input.columnId,
    title: input.title,
    position: input.position,
    createdAt: now,
    updatedAt: now
  };

  if (input.description !== undefined) {
    task.description = input.description;
  }

  return task;
};

const updateTaskEntity = (
  task: KanbanTask,
  input: { title?: string; description?: string; columnId?: string; position?: number }
): KanbanTask => {
  const updated: KanbanTask = {
    ...task,
    updatedAt: new Date().toISOString()
  };

  if (input.title !== undefined) {
    updated.title = input.title;
  }

  if (input.description !== undefined) {
    updated.description = input.description;
  }

  if (input.columnId !== undefined) {
    updated.columnId = input.columnId;
  }

  if (input.position !== undefined) {
    updated.position = input.position;
  }

  return updated;
};

const normalizeId = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeText = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizePosition = (
  value: number | undefined
): Result<number | undefined, KanbanStoreError> => {
  if (value === undefined) {
    return ok(undefined);
  }

  if (!Number.isFinite(value) || value < 0) {
    return err({
      code: KanbanStoreErrorCode.InvalidInput,
      message: ErrorMessage.InvalidBody
    });
  }

  return ok(Math.floor(value));
};

const getNextPosition = (items: ReadonlyArray<{ position: number }>): number => {
  if (items.length === 0) {
    return 0;
  }

  let max = items[0]?.position ?? 0;
  for (const item of items) {
    if (item.position > max) {
      max = item.position;
    }
  }

  return max + 1;
};

const sortByPosition = <T extends { position: number }>(
  items: ReadonlyArray<T>
): ReadonlyArray<T> =>
  [...items].sort((a, b) => a.position - b.position);
