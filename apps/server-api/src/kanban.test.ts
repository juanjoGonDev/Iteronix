import { describe, expect, it } from "vitest";
import { ResultType } from "./result";
import {
  KanbanStoreErrorCode,
  createKanbanStore
} from "./kanban";

const ProjectId = "project-1";
const BoardName = "Board A";
const BoardUpdatedName = "Board B";
const ColumnName = "Todo";
const TaskTitle = "Task A";

describe("kanban store", () => {
  it("creates, lists, updates, and deletes boards", () => {
    const store = createKanbanStore();
    const created = store.createBoard({
      projectId: ProjectId,
      name: BoardName
    });

    expect(created.type).toBe(ResultType.Ok);
    if (created.type !== ResultType.Ok) {
      return;
    }

    const listed = store.listBoards({ projectId: ProjectId });
    expect(listed.type).toBe(ResultType.Ok);
    if (listed.type === ResultType.Ok) {
      expect(listed.value).toHaveLength(1);
    }

    const updated = store.updateBoard({
      projectId: ProjectId,
      boardId: created.value.id,
      name: BoardUpdatedName
    });

    expect(updated.type).toBe(ResultType.Ok);
    if (updated.type === ResultType.Ok) {
      expect(updated.value.name).toBe(BoardUpdatedName);
    }

    const deleted = store.deleteBoard({
      projectId: ProjectId,
      boardId: created.value.id
    });

    expect(deleted.type).toBe(ResultType.Ok);
    if (deleted.type !== ResultType.Ok) {
      return;
    }

    const afterDelete = store.listBoards({ projectId: ProjectId });
    expect(afterDelete.type).toBe(ResultType.Ok);
    if (afterDelete.type === ResultType.Ok) {
      expect(afterDelete.value).toHaveLength(0);
    }
  });

  it("cascades tasks when deleting a column", () => {
    const store = createKanbanStore();
    const board = store.createBoard({
      projectId: ProjectId,
      name: BoardName
    });

    if (board.type !== ResultType.Ok) {
      throw new Error("Expected board");
    }

    const column = store.createColumn({
      projectId: ProjectId,
      boardId: board.value.id,
      name: ColumnName
    });

    if (column.type !== ResultType.Ok) {
      throw new Error("Expected column");
    }

    const task = store.createTask({
      projectId: ProjectId,
      boardId: board.value.id,
      columnId: column.value.id,
      title: TaskTitle
    });

    expect(task.type).toBe(ResultType.Ok);

    const listed = store.listTasks({
      projectId: ProjectId,
      boardId: board.value.id,
      columnId: column.value.id
    });

    expect(listed.type).toBe(ResultType.Ok);
    if (listed.type === ResultType.Ok) {
      expect(listed.value).toHaveLength(1);
    }

    const deleted = store.deleteColumn({
      projectId: ProjectId,
      boardId: board.value.id,
      columnId: column.value.id
    });

    expect(deleted.type).toBe(ResultType.Ok);

    const afterDelete = store.listTasks({
      projectId: ProjectId,
      boardId: board.value.id
    });

    expect(afterDelete.type).toBe(ResultType.Ok);
    if (afterDelete.type === ResultType.Ok) {
      expect(afterDelete.value).toHaveLength(0);
    }
  });

  it("rejects unknown board or column", () => {
    const store = createKanbanStore();
    const column = store.createColumn({
      projectId: ProjectId,
      boardId: "missing",
      name: ColumnName
    });

    expect(column.type).toBe(ResultType.Err);
    if (column.type === ResultType.Err) {
      expect(column.error.code).toBe(KanbanStoreErrorCode.NotFound);
    }

    const board = store.createBoard({
      projectId: ProjectId,
      name: BoardName
    });

    if (board.type !== ResultType.Ok) {
      throw new Error("Expected board");
    }

    const task = store.createTask({
      projectId: ProjectId,
      boardId: board.value.id,
      columnId: "missing-column",
      title: TaskTitle
    });

    expect(task.type).toBe(ResultType.Err);
    if (task.type === ResultType.Err) {
      expect(task.error.code).toBe(KanbanStoreErrorCode.NotFound);
    }
  });
});
