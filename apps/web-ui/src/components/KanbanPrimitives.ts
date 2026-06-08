import { Button, IconButton } from "./Button.js";
import { Component, createElement, type ComponentProps } from "../shared/Component.js";

const KanbanColumnTitleClassName = {
  ideas: "text-[#9dabb9]",
  todo: "text-[#9dabb9]",
  in_progress: "text-[#9dabb9]",
  qa: "text-yellow-500",
  done: "text-emerald-500"
} as const;

const KanbanTaskCardColumnClassName = {
  ideas: "border border-purple-500/30",
  todo: "hover:border-primary/50",
  in_progress: "hover:border-primary/50",
  qa: "border border-yellow-500/30 shadow-lg shadow-yellow-900/10",
  done: "hover:border-primary/50"
} as const;

const KanbanPriorityClassName = {
  low: "bg-gray-500/20 text-gray-400",
  medium: "bg-blue-500/20 text-blue-400",
  high: "bg-red-500/20 text-red-400"
} as const;

const KanbanPriorityIcon = {
  low: "low_priority",
  medium: "remove",
  high: "priority_high"
} as const;

export type KanbanTaskStatus = keyof typeof KanbanColumnTitleClassName;
export type KanbanPriority = keyof typeof KanbanPriorityClassName;

export interface KanbanTask {
  id: string;
  title: string;
  description: string;
  priority: KanbanPriority;
  status: KanbanTaskStatus;
  assignee?: string;
  column: string;
}

export interface KanbanColumnSummary {
  id: KanbanTaskStatus;
  title: string;
}

export interface KanbanColumnPanelProps extends ComponentProps {
  column: KanbanColumnSummary;
  tasks: ReadonlyArray<KanbanTask>;
  selectedTaskId: string | null;
  onCreateTask: (columnId: KanbanTaskStatus) => void;
  onTaskClick: (task: KanbanTask) => void;
  onTaskDragStart: (task: KanbanTask, event: DragEvent) => void;
  onTaskDragOver: (event: DragEvent) => void;
  onTaskDrop: (columnId: KanbanTaskStatus, event: DragEvent) => void;
}

export interface KanbanTaskCardProps extends ComponentProps {
  task: KanbanTask;
  columnId: KanbanTaskStatus;
  selected: boolean;
  onClick: (task: KanbanTask) => void;
  onDragStart: (task: KanbanTask, event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (columnId: KanbanTaskStatus, event: DragEvent) => void;
}

export interface KanbanTaskModalProps extends ComponentProps {
  task: KanbanTask;
  onClose: () => void;
  onDelete: (task: KanbanTask) => void;
  onSave: (task: KanbanTask) => void;
  onTitleChange?: (value: string) => void;
  onDescriptionChange?: (value: string) => void;
}

export class KanbanColumnPanel extends Component<KanbanColumnPanelProps> {
  override render(): HTMLElement {
    const {
      column,
      tasks,
      selectedTaskId,
      onCreateTask,
      onTaskClick,
      onTaskDragStart,
      onTaskDragOver,
      onTaskDrop
    } = this.props;

    return createElement("div", {
      key: column.id,
      className: "flex flex-col w-[320px] h-full"
    }, [
      createElement("div", {
        className: "flex items-center justify-between mb-4 px-1"
      }, [
        createElement("div", {
          className: "flex items-center gap-2"
        }, [
          createElement("span", {
            className: readKanbanColumnTitleClassName(column.id)
          }, [column.title]),
          createElement("span", {
            className: "bg-surface-dark text-white text-xs font-medium px-2 py-0.5 rounded-full border border-border-dark"
          }, [String(tasks.length)])
        ]),
        createElement("div", { className: "flex gap-1" }, [
          createElement(IconButton, {
            icon: "add",
            onClick: () => onCreateTask(column.id),
            className: "text-[#9dabb9] hover:text-white"
          }),
          createElement(IconButton, {
            icon: "more_horiz",
            tooltip: "Column actions are not available yet",
            disabled: true,
            className: "text-[#9dabb9] hover:text-white"
          })
        ])
      ]),
      createElement("div", {
        className: "flex flex-col gap-3 h-full overflow-y-auto pr-2 board-scroll pb-10"
      }, [
        tasks.map((task) =>
          createElement(KanbanTaskCard, {
            task,
            columnId: column.id,
            selected: selectedTaskId === task.id,
            onClick: onTaskClick,
            onDragStart: onTaskDragStart,
            onDragOver: onTaskDragOver,
            onDrop: onTaskDrop
          })
        )
      ])
    ]);
  }
}

export class KanbanTaskCard extends Component<KanbanTaskCardProps> {
  override render(): HTMLElement {
    const { task, columnId, selected, onClick, onDragStart, onDragOver, onDrop } = this.props;
    const taskCard = createElement("div", {
      key: task.id,
      className: readKanbanTaskCardClassName(columnId, selected),
      draggable: true
    }, [
      createElement("div", {
        className: "flex justify-between items-start mb-2"
      }, [
        createElement("span", {
          className: "text-[#5e6b7a] font-mono text-xs"
        }, [`#${task.id}`]),
        createElement("div", {
          className: readKanbanPriorityClassName(task.priority)
        }, [
          createElement("span", {
            className: "material-symbols-outlined text-[16px]"
          }, [readKanbanPriorityIcon(task.priority)])
        ])
      ]),
      createElement("h3", {
        className: "text-gray-200 text-sm font-medium leading-snug mb-3"
      }, [task.title]),
      task.assignee
        ? createElement("div", {
            className: "flex items-center gap-2 mb-3"
          }, [
            createElement("div", {
              className: "w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center"
            }, [
              createElement("span", {
                className: "material-symbols-outlined text-[14px]"
              }, ["person"])
            ]),
            createElement("span", {
              className: "text-xs text-gray-500"
            }, [task.assignee])
          ])
        : "",
      createElement("div", {
        className: "absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
      }, [
        createElement(IconButton, {
          icon: "more_vert",
          size: "sm",
          tooltip: "Task actions are not available yet",
          disabled: true,
          className: "text-gray-500 hover:text-white bg-surface-dark/80"
        })
      ])
    ]);

    taskCard.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick(task);
    });
    taskCard.addEventListener("dragstart", (event) => {
      const dragEvent = readDragEvent(event);
      if (dragEvent) {
        onDragStart(task, dragEvent);
      }
    });
    taskCard.addEventListener("dragover", (event) => {
      const dragEvent = readDragEvent(event);
      if (dragEvent) {
        onDragOver(dragEvent);
      }
    });
    taskCard.addEventListener("drop", (event) => {
      const dragEvent = readDragEvent(event);
      if (dragEvent) {
        onDrop(columnId, dragEvent);
      }
    });

    return taskCard;
  }
}

export class KanbanTaskModal extends Component<KanbanTaskModalProps> {
  override render(): HTMLElement {
    const { task, onClose, onDelete, onSave, onTitleChange, onDescriptionChange } = this.props;

    return createElement("div", {
      className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4",
      onClick: () => onClose()
    }, [
      createElement("div", {
        className: "bg-surface-dark rounded-xl p-6 max-w-md w-full border border-border-dark shadow-xl",
        onClick: (event: Event) => event.stopPropagation()
      }, [
        createElement("div", {
          className: "flex justify-between items-center mb-4"
        }, [
          createElement("h2", {
            className: "text-xl font-bold text-white"
          }, [task.title]),
          createElement(IconButton, {
            icon: "close",
            onClick: (event: Event) => {
              event.stopPropagation();
              onClose();
            }
          })
        ]),
        createElement("div", {
          className: "space-y-4"
        }, [
          createElement("div", {}, [
            createElement("label", {
              className: "block text-sm font-medium text-white mb-2"
            }, ["Title"]),
            createElement("input", {
              className: "w-full bg-surface-dark border border-border-dark text-white rounded-lg p-3 placeholder-text-secondary focus:ring-primary focus:border-primary",
              type: "text",
              value: task.title,
              onInput: (event: Event) => onTitleChange?.(readFormControlValue(event))
            })
          ]),
          createElement("div", {}, [
            createElement("label", {
              className: "block text-sm font-medium text-white mb-2"
            }, ["Description"]),
            createElement("textarea", {
              className: "w-full bg-surface-dark border border-border-dark text-white rounded-lg p-3 placeholder-text-secondary focus:ring-primary focus:border-primary",
              rows: 4,
              value: task.description,
              placeholder: "Enter task description...",
              onInput: (event: Event) => onDescriptionChange?.(readFormControlValue(event))
            })
          ]),
          createElement("div", {}, [
            createElement("label", {
              className: "block text-sm font-medium text-white mb-2"
            }, ["Priority"]),
            createElement("select", {
              className: "w-full bg-surface-dark border border-border-dark text-white rounded-lg p-3 focus:ring-primary focus:border-primary",
              value: task.priority,
              disabled: true,
              title: "Priority is not persisted by the server API yet"
            }, [
              createElement("option", { value: "low" }, ["Low"]),
              createElement("option", { value: "medium" }, ["Medium"]),
              createElement("option", { value: "high" }, ["High"])
            ])
          ]),
          createElement("div", {
            className: "flex gap-3 justify-end mt-6"
          }, [
            createElement(Button, {
              variant: "danger",
              onClick: (event: Event) => {
                event.stopPropagation();
                onDelete(task);
              },
              children: "Delete"
            }),
            createElement(Button, {
              variant: "primary",
              onClick: (event: Event) => {
                event.stopPropagation();
                onSave(task);
              },
              children: "Save Changes"
            })
          ])
        ])
      ])
    ]);
  }
}

export const readKanbanColumnTitleClassName = (columnId: KanbanTaskStatus): string =>
  `font-bold text-sm tracking-wide ${KanbanColumnTitleClassName[columnId]}`;

export const readKanbanTaskCardClassName = (columnId: KanbanTaskStatus, selected: boolean): string =>
  `bg-card-dark rounded-lg p-4 border border-border-dark shadow-sm cursor-pointer group relative ${KanbanTaskCardColumnClassName[columnId]} ${selected ? "ring-2 ring-primary/40" : ""}`.trim();

export const readKanbanPriorityClassName = (priority: KanbanPriority): string =>
  `w-6 h-6 rounded-full flex items-center justify-center ${KanbanPriorityClassName[priority]}`;

export const readKanbanPriorityIcon = (priority: KanbanPriority): string =>
  KanbanPriorityIcon[priority];

const readDragEvent = (event: Event): DragEvent | null => {
  if (typeof DragEvent === "undefined") {
    return null;
  }

  return event instanceof DragEvent ? event : null;
};

const readFormControlValue = (event: Event): string => {
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  ) {
    return event.target.value;
  }

  return "";
};
