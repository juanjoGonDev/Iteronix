import {
  Component,
  createElement,
  ComponentProps,
} from "../shared/Component.js";
import {
  KanbanColumnPanel,
  KanbanTaskModal,
  type KanbanTask,
  type KanbanTaskStatus
} from "../components/KanbanPrimitives.js";
import { PageNoticeStack } from "../components/PageScaffold.js";
import {
  createKanbanBoardView,
  defaultKanbanBoardName,
  defaultKanbanColumnDefinitions
} from "./kanban-state.js";
import {
  createKanbanClient,
  type KanbanBoardRecord,
  type KanbanClient,
  type KanbanColumnRecord
} from "../shared/kanban-client.js";
import { createQualityGatesClient, type QualityGatesClient } from "../shared/quality-gates-client.js";
import {
  readActiveProjectSessionLabel,
  readProjectSession
} from "../shared/project-session.js";
import type { ProjectRecord } from "../shared/workbench-types.js";

interface KanbanBoardState {
  columns: ReadonlyArray<{ id: KanbanTaskStatus; title: string }>;
  tasks: ReadonlyArray<KanbanTask>;
  columnIdsByStatus: Partial<Record<KanbanTaskStatus, string>>;
  project: ProjectRecord | null;
  boardId: string | null;
  draggedTask: KanbanTask | null;
  selectedTask: KanbanTask | null;
  taskDraft: KanbanTask | null;
  pendingAction: KanbanPendingAction | null;
  errorMessage: string | null;
  noticeMessage: string | null;
}

interface KanbanBoardProps extends ComponentProps {
  className?: string;
}

type KanbanPendingAction = "load" | "create" | "move" | "save" | "delete";

const TaskDefaults = {
  Title: "New Task",
  Description: "Click to edit description",
  Position: 0
} as const;

const KanbanMessage = {
  OpenProjectFirst: "Open a project before using the Kanban board.",
  LoadFailed: "Kanban board could not be loaded.",
  CreateFailed: "Task could not be created.",
  MoveFailed: "Task could not be moved.",
  SaveFailed: "Task could not be saved.",
  DeleteFailed: "Task could not be deleted.",
  LoadNotice: "Loading Kanban board...",
  CreateNotice: "Creating task...",
  MoveNotice: "Moving task...",
  SaveNotice: "Saving task...",
  DeleteNotice: "Deleting task..."
} as const;

export class KanbanBoard extends Component<KanbanBoardProps, KanbanBoardState> {
  private readonly kanbanClient: KanbanClient;
  private readonly qualityGatesClient: QualityGatesClient;

  constructor(props: KanbanBoardProps = {}) {
    super(props, {
      columns: defaultKanbanColumnDefinitions.map((definition) => ({
        id: definition.id,
        title: definition.title
      })),
      tasks: [],
      columnIdsByStatus: {},
      project: null,
      boardId: null,
      draggedTask: null,
      selectedTask: null,
      taskDraft: null,
      pendingAction: null,
      errorMessage: null,
      noticeMessage: null
    });
    this.kanbanClient = createKanbanClient();
    this.qualityGatesClient = createQualityGatesClient();
  }

  override onMount(): void {
    void this.loadBoard();
  }

  private async loadBoard(): Promise<void> {
    const session = readProjectSession();
    if (!session.projectRootPath) {
      this.setState({
        errorMessage: KanbanMessage.OpenProjectFirst,
        noticeMessage: null
      });
      return;
    }

    this.setState({
      pendingAction: "load",
      errorMessage: null,
      noticeMessage: KanbanMessage.LoadNotice
    });

    try {
      const project = await this.qualityGatesClient.openProject({
        rootPath: session.projectRootPath,
        name: readActiveProjectSessionLabel(session)
      });
      const board = await this.readOrCreateBoard(project.id);
      await this.reloadBoardData(project, board.id, null);
    } catch {
      this.setState({
        pendingAction: null,
        errorMessage: KanbanMessage.LoadFailed,
        noticeMessage: null
      });
    }
  }

  private async readOrCreateBoard(projectId: string): Promise<KanbanBoardRecord> {
    const boards = await this.kanbanClient.listBoards({ projectId });
    return boards[0] ?? this.kanbanClient.createBoard({
      projectId,
      name: defaultKanbanBoardName
    });
  }

  private async reloadBoardData(
    project: ProjectRecord,
    boardId: string,
    noticeMessage: string | null
  ): Promise<void> {
    const columns = await this.readOrCreateColumns(project.id, boardId);
    const tasks = await this.kanbanClient.listTasks({
      projectId: project.id,
      boardId
    });
    const view = createKanbanBoardView(columns, tasks);

    this.setState({
      columns: view.columns,
      tasks: view.tasks,
      columnIdsByStatus: view.columnIdsByStatus,
      project,
      boardId,
      draggedTask: null,
      selectedTask: null,
      taskDraft: null,
      pendingAction: null,
      errorMessage: null,
      noticeMessage
    });
  }

  private async readOrCreateColumns(
    projectId: string,
    boardId: string
  ): Promise<ReadonlyArray<KanbanColumnRecord>> {
    const existingColumns = await this.kanbanClient.listColumns({
      projectId,
      boardId
    });
    const createdColumns: KanbanColumnRecord[] = [];

    for (const definition of defaultKanbanColumnDefinitions) {
      const exists = existingColumns.some(
        (column) => column.name.toLowerCase() === definition.title.toLowerCase()
      );

      if (!exists) {
        createdColumns.push(
          await this.kanbanClient.createColumn({
            projectId,
            boardId,
            name: definition.title,
            position: definition.position
          })
        );
      }
    }

    return [...existingColumns, ...createdColumns];
  }

  private handleDragStart(task: KanbanTask, event: DragEvent): void {
    this.setState({ draggedTask: task });
    event.dataTransfer?.setData("text/plain", task.id);
  }

  private handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }

  private async handleDrop(columnId: KanbanTaskStatus, event: DragEvent): Promise<void> {
    event.preventDefault();
    const taskId = event.dataTransfer?.getData("text/plain");
    const targetColumnId = this.state.columnIdsByStatus[columnId];

    if (!taskId || !targetColumnId || !this.state.project || !this.state.boardId) {
      this.setState({ draggedTask: null });
      return;
    }

    this.setState({
      pendingAction: "move",
      errorMessage: null,
      noticeMessage: KanbanMessage.MoveNotice
    });

    try {
      await this.kanbanClient.updateTask({
        projectId: this.state.project.id,
        boardId: this.state.boardId,
        taskId,
        columnId: targetColumnId
      });
      await this.reloadBoardData(this.state.project, this.state.boardId, null);
    } catch {
      this.setState({
        pendingAction: null,
        draggedTask: null,
        errorMessage: KanbanMessage.MoveFailed,
        noticeMessage: null
      });
    }
  }

  private async handleCreateTask(columnId: KanbanTaskStatus): Promise<void> {
    const targetColumnId = this.state.columnIdsByStatus[columnId];
    if (!targetColumnId || !this.state.project || !this.state.boardId) {
      return;
    }

    this.setState({
      pendingAction: "create",
      errorMessage: null,
      noticeMessage: KanbanMessage.CreateNotice
    });

    try {
      await this.kanbanClient.createTask({
        projectId: this.state.project.id,
        boardId: this.state.boardId,
        columnId: targetColumnId,
        title: TaskDefaults.Title,
        description: TaskDefaults.Description,
        position: this.readNextTaskPosition(columnId)
      });
      await this.reloadBoardData(this.state.project, this.state.boardId, null);
    } catch {
      this.setState({
        pendingAction: null,
        errorMessage: KanbanMessage.CreateFailed,
        noticeMessage: null
      });
    }
  }

  private readNextTaskPosition(columnId: KanbanTaskStatus): number {
    return this.state.tasks.filter((task) => task.status === columnId).length;
  }

  private handleTaskClick(task: KanbanTask): void {
    this.setState({
      selectedTask: task,
      taskDraft: task
    });
  }

  private handleTaskTitleChange(value: string): void {
    const draft = this.state.taskDraft;
    if (!draft) {
      return;
    }

    this.setState({
      taskDraft: {
        ...draft,
        title: value
      }
    });
  }

  private handleTaskDescriptionChange(value: string): void {
    const draft = this.state.taskDraft;
    if (!draft) {
      return;
    }

    this.setState({
      taskDraft: {
        ...draft,
        description: value
      }
    });
  }

  private async handleSaveTask(task: KanbanTask): Promise<void> {
    if (!this.state.project || !this.state.boardId) {
      return;
    }

    this.setState({
      pendingAction: "save",
      errorMessage: null,
      noticeMessage: KanbanMessage.SaveNotice
    });

    try {
      await this.kanbanClient.updateTask({
        projectId: this.state.project.id,
        boardId: this.state.boardId,
        taskId: task.id,
        title: task.title,
        description: task.description
      });
      await this.reloadBoardData(this.state.project, this.state.boardId, null);
    } catch {
      this.setState({
        pendingAction: null,
        errorMessage: KanbanMessage.SaveFailed,
        noticeMessage: null
      });
    }
  }

  private async handleDeleteTask(task: KanbanTask): Promise<void> {
    if (!this.state.project || !this.state.boardId) {
      return;
    }

    this.setState({
      pendingAction: "delete",
      errorMessage: null,
      noticeMessage: KanbanMessage.DeleteNotice
    });

    try {
      await this.kanbanClient.deleteTask({
        projectId: this.state.project.id,
        boardId: this.state.boardId,
        taskId: task.id
      });
      await this.reloadBoardData(this.state.project, this.state.boardId, null);
    } catch {
      this.setState({
        pendingAction: null,
        errorMessage: KanbanMessage.DeleteFailed,
        noticeMessage: null
      });
    }
  }

  override render(): HTMLElement {
    const { columns, tasks, selectedTask, taskDraft } = this.state;
    const tasksByColumn = columns.reduce((acc, column) => {
      acc[column.id] = tasks.filter((task) => task.status === column.id);
      return acc;
    }, createEmptyTaskGroups());

    return createElement(
      "div",
      {
        className:
          "relative flex-1 overflow-x-auto overflow-y-hidden bg-[#0d1218] p-6 board-scroll",
        "data-pending-action": this.state.pendingAction ?? ""
      },
      [
        createElement(PageNoticeStack, {
          errorMessage: this.state.errorMessage,
          noticeMessage: this.state.noticeMessage,
          className: "absolute left-6 right-6 top-6 z-20"
        }),
        createElement(
          "div",
          {
            className: "flex h-full min-w-max gap-6",
          },
          [
            columns.map((column) =>
              createElement(KanbanColumnPanel, {
                column,
                tasks: tasksByColumn[column.id],
                selectedTaskId: selectedTask?.id ?? null,
                onCreateTask: (nextColumnId: KanbanTaskStatus) => {
                  void this.handleCreateTask(nextColumnId);
                },
                onTaskClick: (task: KanbanTask) => this.handleTaskClick(task),
                onTaskDragStart: (task: KanbanTask, event: DragEvent) => this.handleDragStart(task, event),
                onTaskDragOver: (event: DragEvent) => this.handleDragOver(event),
                onTaskDrop: (nextColumnId: KanbanTaskStatus, event: DragEvent) => {
                  void this.handleDrop(nextColumnId, event);
                }
              })
            ),
          ]
        ),

        taskDraft && createElement(KanbanTaskModal, {
          task: taskDraft,
          onClose: () => this.setState({ selectedTask: null, taskDraft: null }),
          onDelete: (task: KanbanTask) => {
            void this.handleDeleteTask(task);
          },
          onSave: (task: KanbanTask) => {
            void this.handleSaveTask(task);
          },
          onTitleChange: (value: string) => this.handleTaskTitleChange(value),
          onDescriptionChange: (value: string) => this.handleTaskDescriptionChange(value)
        }),
      ]
    );
  }
}

const createEmptyTaskGroups = (): Record<KanbanTaskStatus, KanbanTask[]> => ({
  ideas: [],
  todo: [],
  in_progress: [],
  qa: [],
  done: []
});
