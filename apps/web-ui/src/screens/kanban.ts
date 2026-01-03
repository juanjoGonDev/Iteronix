import { emptyLabel } from "../shared/constants.js";
import {
  clearChildren,
  createElement,
  isHTMLButtonElement,
  isHTMLElement,
  isHTMLInputElement,
  isHTMLSelectElement,
  isHTMLTextAreaElement,
  selectElement
} from "../shared/dom.js";
import { formatTime } from "../shared/format.js";

type KanbanColumn = {
  id: KanbanColumnId;
  label: string;
};

type KanbanColumnId = "IDEAS" | "TODO" | "IN_PROGRESS" | "QA" | "DONE";

type KanbanTask = {
  id: number;
  title: string;
  description: string;
  assignee: string;
  columnId: KanbanColumnId;
  updatedAt: string;
};

type KanbanState = {
  columns: KanbanColumn[];
  tasks: KanbanTask[];
  selectedId: number | null;
  nextId: number;
};

const kanbanColumns: KanbanColumn[] = [
  { id: "IDEAS", label: "Ideas" },
  { id: "TODO", label: "Todo" },
  { id: "IN_PROGRESS", label: "In Progress" },
  { id: "QA", label: "QA" },
  { id: "DONE", label: "Done" }
];

const initialTasks: KanbanTask[] = [
  {
    id: 12,
    title: "Define plugin manifest",
    description: "Draft the manifest schema for server plugins.",
    assignee: "Backend",
    columnId: "IDEAS",
    updatedAt: "Today 10:12"
  },
  {
    id: 11,
    title: "Draft provider UX",
    description: "Outline provider selection and settings flow.",
    assignee: "Product Manager",
    columnId: "TODO",
    updatedAt: "Today 09:02"
  },
  {
    id: 10,
    title: "Provider settings UI",
    description: "Design the settings screen layout.",
    assignee: "Frontend",
    columnId: "IN_PROGRESS",
    updatedAt: "Yesterday 18:40"
  },
  {
    id: 9,
    title: "Server API smoke test",
    description: "Run through core endpoints and SSE streaming.",
    assignee: "DevOps",
    columnId: "QA",
    updatedAt: "Yesterday 16:20"
  },
  {
    id: 8,
    title: "Bootstrap monorepo",
    description: "PNPM workspace, lint, and strict TS ready.",
    assignee: "Backend",
    columnId: "DONE",
    updatedAt: "Earlier"
  }
];

const defaultDescription = "No details yet.";
const defaultAssignee = "Unassigned";

export const initKanbanScreen = (root: ParentNode): void => {
  const kanbanBoard = selectElement(root, "[data-kanban-board]", isHTMLElement);
  const kanbanTitleInput = selectElement(
    root,
    "[data-kanban-title]",
    isHTMLInputElement
  );
  const kanbanAssigneeInput = selectElement(
    root,
    "[data-kanban-assignee]",
    isHTMLInputElement
  );
  const kanbanColumnSelect = selectElement(
    root,
    "[data-kanban-column]",
    isHTMLSelectElement
  );
  const kanbanDescriptionInput = selectElement(
    root,
    "[data-kanban-description]",
    isHTMLTextAreaElement
  );
  const kanbanCreateButton = selectElement(
    root,
    "[data-kanban-create]",
    isHTMLButtonElement
  );
  const kanbanDetailStatus = selectElement(
    root,
    "[data-kanban-detail-status]",
    isHTMLElement
  );
  const kanbanDetailEmpty = selectElement(
    root,
    "[data-kanban-detail-empty]",
    isHTMLElement
  );
  const kanbanDetailCard = selectElement(
    root,
    "[data-kanban-detail-card]",
    isHTMLElement
  );
  const kanbanDetailTitle = selectElement(
    root,
    "[data-kanban-detail-title]",
    isHTMLElement
  );
  const kanbanDetailDescription = selectElement(
    root,
    "[data-kanban-detail-description]",
    isHTMLElement
  );
  const kanbanDetailColumn = selectElement(
    root,
    "[data-kanban-detail-column]",
    isHTMLElement
  );
  const kanbanDetailAssignee = selectElement(
    root,
    "[data-kanban-detail-assignee]",
    isHTMLElement
  );
  const kanbanDetailUpdated = selectElement(
    root,
    "[data-kanban-detail-updated]",
    isHTMLElement
  );
  const kanbanDetailPrev = selectElement(
    root,
    "[data-kanban-detail-prev]",
    isHTMLButtonElement
  );
  const kanbanDetailNext = selectElement(
    root,
    "[data-kanban-detail-next]",
    isHTMLButtonElement
  );

  const state: KanbanState = {
    columns: [...kanbanColumns],
    tasks: initialTasks.map((task) => ({ ...task })),
    selectedId: 10,
    nextId: 13
  };

  const renderBoard = (): void => {
    if (!kanbanBoard) {
      return;
    }
    clearChildren(kanbanBoard);
    state.columns.forEach((column) => {
      kanbanBoard.appendChild(buildKanbanColumn(column, state, selectTask, moveTask));
    });
  };

  const renderDetail = (): void => {
    if (!kanbanDetailEmpty || !kanbanDetailCard) {
      return;
    }
    const task = getKanbanTask(state, state.selectedId);
    if (!task) {
      kanbanDetailEmpty.style.display = "block";
      kanbanDetailCard.style.display = "none";
      if (kanbanDetailStatus) {
        kanbanDetailStatus.textContent = emptyLabel;
      }
      return;
    }
    kanbanDetailEmpty.style.display = "none";
    kanbanDetailCard.style.display = "grid";
    if (kanbanDetailTitle) {
      kanbanDetailTitle.textContent = task.title;
    }
    if (kanbanDetailDescription) {
      kanbanDetailDescription.textContent = task.description;
    }
    if (kanbanDetailColumn) {
      kanbanDetailColumn.textContent = getKanbanColumnLabel(state, task.columnId);
    }
    if (kanbanDetailAssignee) {
      kanbanDetailAssignee.textContent = task.assignee;
    }
    if (kanbanDetailUpdated) {
      kanbanDetailUpdated.textContent = task.updatedAt;
    }
    if (kanbanDetailStatus) {
      kanbanDetailStatus.textContent = getKanbanColumnLabel(state, task.columnId);
    }
    if (kanbanDetailPrev) {
      kanbanDetailPrev.disabled = !canMoveKanbanTask(state, task.columnId, "prev");
    }
    if (kanbanDetailNext) {
      kanbanDetailNext.disabled = !canMoveKanbanTask(state, task.columnId, "next");
    }
  };

  const renderForm = (): void => {
    if (!kanbanColumnSelect) {
      return;
    }
    clearChildren(kanbanColumnSelect);
    state.columns.forEach((column) => {
      const option = createElement("option");
      option.value = column.id;
      option.textContent = column.label;
      kanbanColumnSelect.appendChild(option);
    });
    kanbanColumnSelect.value = getDefaultColumn(state);
  };

  const addTask = (task: KanbanTask): void => {
    state.tasks = [task, ...state.tasks];
    state.selectedId = task.id;
    renderBoard();
    renderDetail();
  };

  const moveTask = (taskId: number, direction: "prev" | "next"): void => {
    const task = getKanbanTask(state, taskId);
    if (!task) {
      return;
    }
    const nextColumn = getAdjacentColumn(state, task.columnId, direction);
    if (!nextColumn) {
      return;
    }
    task.columnId = nextColumn.id;
    task.updatedAt = formatKanbanTimestamp(new Date());
    renderBoard();
    renderDetail();
  };

  const selectTask = (taskId: number): void => {
    state.selectedId = taskId;
    renderBoard();
    renderDetail();
  };

  if (kanbanCreateButton) {
    kanbanCreateButton.addEventListener("click", () => {
      if (!kanbanTitleInput || !kanbanColumnSelect) {
        return;
      }
      const title = kanbanTitleInput.value.trim();
      if (title === "") {
        return;
      }
      const description = getDescription(kanbanDescriptionInput);
      const assignee = getAssignee(kanbanAssigneeInput);
      const columnId = resolveColumn(state, kanbanColumnSelect.value);
      addTask(
        createTask(state, {
          title,
          description,
          assignee,
          columnId
        })
      );
      kanbanTitleInput.value = "";
      if (kanbanDescriptionInput) {
        kanbanDescriptionInput.value = "";
      }
      if (kanbanAssigneeInput) {
        kanbanAssigneeInput.value = "";
      }
    });
  }

  if (kanbanDetailPrev) {
    kanbanDetailPrev.addEventListener("click", () => {
      if (state.selectedId === null) {
        return;
      }
      moveTask(state.selectedId, "prev");
    });
  }

  if (kanbanDetailNext) {
    kanbanDetailNext.addEventListener("click", () => {
      if (state.selectedId === null) {
        return;
      }
      moveTask(state.selectedId, "next");
    });
  }

  renderForm();
  renderBoard();
  renderDetail();
};

const createTask = (
  state: KanbanState,
  input: Pick<KanbanTask, "title" | "description" | "assignee" | "columnId">
): KanbanTask => {
  const task: KanbanTask = {
    id: state.nextId,
    title: input.title,
    description: input.description,
    assignee: input.assignee,
    columnId: input.columnId,
    updatedAt: formatKanbanTimestamp(new Date())
  };
  state.nextId += 1;
  return task;
};

const getDescription = (input: HTMLTextAreaElement | null): string => {
  if (!input) {
    return defaultDescription;
  }
  const value = input.value.trim();
  if (value === "") {
    return defaultDescription;
  }
  return value;
};

const getAssignee = (input: HTMLInputElement | null): string => {
  if (!input) {
    return defaultAssignee;
  }
  const value = input.value.trim();
  if (value === "") {
    return defaultAssignee;
  }
  return value;
};

const buildKanbanColumn = (
  column: KanbanColumn,
  state: KanbanState,
  onSelect: (id: number) => void,
  onMove: (id: number, direction: "prev" | "next") => void
): HTMLElement => {
  const wrapper = createElement("div", "kanban-column");
  const header = createElement("div", "kanban-header");
  const title = createElement("span");
  title.textContent = column.label;
  const count = createElement("span", "chip");
  const columnTasks = getColumnTasks(state, column.id);
  count.textContent = String(columnTasks.length);
  header.appendChild(title);
  header.appendChild(count);
  const list = createElement("div", "kanban-list");
  columnTasks.forEach((task) => {
    list.appendChild(buildKanbanTask(task, state, onSelect, onMove));
  });
  wrapper.appendChild(header);
  wrapper.appendChild(list);
  return wrapper;
};

const buildKanbanTask = (
  task: KanbanTask,
  state: KanbanState,
  onSelect: (id: number) => void,
  onMove: (id: number, direction: "prev" | "next") => void
): HTMLElement => {
  const card = createElement("div", "kanban-task");
  card.dataset["taskId"] = String(task.id);
  if (task.id === state.selectedId) {
    card.dataset["active"] = "true";
  }
  const strip = createElement("div", "accent-strip");
  const header = createElement("div", "kanban-task-header");
  const title = createElement("strong", "kanban-task-title");
  title.textContent = task.title;
  const actions = createElement("div", "kanban-task-actions");
  actions.appendChild(buildMoveButton(task, state, "prev", "Back", onMove));
  actions.appendChild(buildMoveButton(task, state, "next", "Next", onMove));
  header.appendChild(title);
  header.appendChild(actions);
  const description = createElement("small");
  description.textContent = task.description;
  const meta = createElement("div", "kanban-task-meta");
  const assignee = createElement("span");
  assignee.textContent = task.assignee;
  const updated = createElement("span");
  updated.textContent = task.updatedAt;
  meta.appendChild(assignee);
  meta.appendChild(updated);
  card.appendChild(strip);
  card.appendChild(header);
  card.appendChild(description);
  card.appendChild(meta);
  card.addEventListener("click", () => {
    onSelect(task.id);
  });
  return card;
};

const buildMoveButton = (
  task: KanbanTask,
  state: KanbanState,
  direction: "prev" | "next",
  label: string,
  onMove: (id: number, direction: "prev" | "next") => void
): HTMLElement => {
  const button = createElement("button", "kanban-move");
  button.type = "button";
  button.textContent = label;
  button.disabled = !canMoveKanbanTask(state, task.columnId, direction);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onMove(task.id, direction);
  });
  return button;
};

const getColumnTasks = (state: KanbanState, columnId: KanbanColumnId): KanbanTask[] =>
  state.tasks.filter((task) => task.columnId === columnId);

const getKanbanTask = (state: KanbanState, taskId: number | null): KanbanTask | null => {
  if (taskId === null) {
    return null;
  }
  return state.tasks.find((task) => task.id === taskId) ?? null;
};

const getDefaultColumn = (state: KanbanState): KanbanColumnId => {
  const preferred = state.columns.find((column) => column.id === "TODO");
  return preferred?.id ?? state.columns[0]?.id ?? "TODO";
};

const resolveColumn = (state: KanbanState, value: string): KanbanColumnId => {
  const column = state.columns.find((item) => item.id === value);
  if (column) {
    return column.id;
  }
  return getDefaultColumn(state);
};

const getKanbanColumnLabel = (state: KanbanState, columnId: KanbanColumnId): string => {
  const column = state.columns.find((item) => item.id === columnId);
  if (!column) {
    return emptyLabel;
  }
  return column.label;
};

const getAdjacentColumn = (
  state: KanbanState,
  columnId: KanbanColumnId,
  direction: "prev" | "next"
): KanbanColumn | null => {
  const index = state.columns.findIndex((column) => column.id === columnId);
  if (index === -1) {
    return null;
  }
  const nextIndex = direction === "prev" ? index - 1 : index + 1;
  return state.columns[nextIndex] ?? null;
};

const canMoveKanbanTask = (
  state: KanbanState,
  columnId: KanbanColumnId,
  direction: "prev" | "next"
): boolean => getAdjacentColumn(state, columnId, direction) !== null;

const formatKanbanTimestamp = (date: Date): string => `Today ${formatTime(date)}`;
