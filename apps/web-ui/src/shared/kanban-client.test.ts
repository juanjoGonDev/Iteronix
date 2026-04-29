import { describe, expect, it } from "vitest";
import {
  parseKanbanBoardResponse,
  parseKanbanBoardsResponse,
  parseKanbanColumnResponse,
  parseKanbanColumnsResponse,
  parseKanbanTaskResponse,
  parseKanbanTasksResponse
} from "./kanban-client.js";

describe("kanban-client parsers", () => {
  it("parses kanban board responses", () => {
    expect(parseKanbanBoardResponse({ board: createBoardRecord() })).toEqual(
      createBoardRecord()
    );
    expect(parseKanbanBoardsResponse({ boards: [createBoardRecord()] })).toEqual(
      [createBoardRecord()]
    );
  });

  it("parses kanban column responses", () => {
    expect(parseKanbanColumnResponse({ column: createColumnRecord() })).toEqual(
      createColumnRecord()
    );
    expect(
      parseKanbanColumnsResponse({ columns: [createColumnRecord()] })
    ).toEqual([createColumnRecord()]);
  });

  it("parses kanban task responses with optional descriptions", () => {
    expect(parseKanbanTaskResponse({ task: createTaskRecord() })).toEqual(
      createTaskRecord()
    );
    expect(parseKanbanTasksResponse({ tasks: [createTaskRecord()] })).toEqual([
      createTaskRecord()
    ]);
  });

  it("rejects malformed kanban payloads", () => {
    expect(() => parseKanbanTaskResponse({ task: { id: "task-1" } })).toThrow(
      "Invalid kanbanTaskRecord.boardId"
    );
  });
});

const createBoardRecord = () => ({
  id: "board-1",
  projectId: "project-1",
  name: "Workbench",
  createdAt: "2026-04-29T07:00:00.000Z",
  updatedAt: "2026-04-29T07:00:00.000Z"
});

const createColumnRecord = () => ({
  id: "column-1",
  boardId: "board-1",
  name: "TODO",
  position: 1,
  createdAt: "2026-04-29T07:00:00.000Z",
  updatedAt: "2026-04-29T07:00:00.000Z"
});

const createTaskRecord = () => ({
  id: "task-1",
  boardId: "board-1",
  columnId: "column-1",
  title: "Persist Kanban",
  description: "Use the server as source of truth",
  position: 0,
  createdAt: "2026-04-29T07:00:00.000Z",
  updatedAt: "2026-04-29T07:00:00.000Z"
});
