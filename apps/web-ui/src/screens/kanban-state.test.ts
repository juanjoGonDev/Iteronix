import { describe, expect, it } from "vitest";
import {
  createKanbanBoardView,
  defaultKanbanColumnDefinitions,
  readKanbanStatusFromColumnName
} from "./kanban-state.js";

describe("kanban-state", () => {
  it("maps server columns and tasks into shared kanban primitives", () => {
    const view = createKanbanBoardView(
      [
        createColumnRecord("column-todo", "TODO", 1),
        createColumnRecord("column-ideas", "IDEAS", 0),
        createColumnRecord("column-done", "DONE", 4)
      ],
      [
        createTaskRecord("task-1", "column-todo", "Persist create"),
        createTaskRecord("task-2", "column-ideas", "Persist load")
      ]
    );

    expect(view.columns.map((column) => column.id)).toEqual(
      defaultKanbanColumnDefinitions.map((definition) => definition.id)
    );
    expect(view.columnIdsByStatus.todo).toBe("column-todo");
    expect(view.tasks).toEqual([
      {
        id: "task-2",
        title: "Persist load",
        description: "",
        priority: "medium",
        status: "ideas",
        column: "ideas"
      },
      {
        id: "task-1",
        title: "Persist create",
        description: "",
        priority: "medium",
        status: "todo",
        column: "todo"
      }
    ]);
  });

  it("ignores server tasks from unknown columns", () => {
    const view = createKanbanBoardView(
      [createColumnRecord("column-todo", "TODO", 1)],
      [createTaskRecord("task-1", "missing-column", "Orphan")]
    );

    expect(view.tasks).toEqual([]);
  });

  it("normalizes canonical column names", () => {
    expect(readKanbanStatusFromColumnName("in_progress")).toBe("in_progress");
    expect(readKanbanStatusFromColumnName("Done")).toBe("done");
    expect(readKanbanStatusFromColumnName("review")).toBeNull();
  });
});

const createColumnRecord = (id: string, name: string, position: number) => ({
  id,
  boardId: "board-1",
  name,
  position,
  createdAt: "2026-04-29T07:00:00.000Z",
  updatedAt: "2026-04-29T07:00:00.000Z"
});

const createTaskRecord = (id: string, columnId: string, title: string) => ({
  id,
  boardId: "board-1",
  columnId,
  title,
  position: 0,
  createdAt: "2026-04-29T07:00:00.000Z",
  updatedAt: "2026-04-29T07:00:00.000Z"
});
