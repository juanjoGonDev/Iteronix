import { Component, createElement, ComponentProps } from '../shared/Component.js';
import { Button, IconButton } from '../components/Button.js';

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'ideas' | 'todo' | 'in_progress' | 'qa' | 'done';
  assignee?: string;
  column: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  count: number;
  tasks: Task[];
}

interface KanbanBoardState {
  columns: KanbanColumn[];
  tasks: Task[];
  draggedTask: Task | null;
  selectedTask: Task | null;
}

interface KanbanBoardProps extends ComponentProps {
  className?: string;
}

export class KanbanBoard extends Component<KanbanBoardProps, KanbanBoardState> {
  constructor(props: KanbanBoardProps = {}) {
    super(props, {
      columns: [
        {
          id: 'ideas',
          title: 'IDEAS',
          count: 3,
          tasks: []
        },
        {
          id: 'todo',
          title: 'TODO',
          count: 5,
          tasks: []
        },
        {
          id: 'in_progress',
          title: 'IN_PROGRESS',
          count: 2,
          tasks: []
        },
        {
          id: 'qa',
          title: 'QA',
          count: 1,
          tasks: []
        },
        {
          id: 'done',
          title: 'DONE',
          count: 8,
          tasks: []
        }
      ],
      tasks: [
        {
          id: '1',
          title: 'Explore GraphQL migration for user service',
          description: 'Research GraphQL implementation possibilities',
          priority: 'medium',
          status: 'ideas',
          column: 'ideas'
        },
        {
          id: '2',
          title: 'Implement dark mode toggle in settings',
          description: 'Add dark/light mode preference',
          priority: 'low',
          status: 'ideas',
          column: 'ideas'
        },
        {
          id: '3',
          title: 'Optimize database queries for dashboard',
          description: 'Review and improve slow queries',
          priority: 'high',
          status: 'todo',
          column: 'todo'
        },
        {
          id: '4',
          title: 'Add user authentication flows',
          description: 'Implement login/logout functionality',
          priority: 'high',
          status: 'todo',
          column: 'todo'
        }
      ],
      draggedTask: null,
      selectedTask: null
    });
  }

  private handleDragStart(task: Task, event: DragEvent): void {
    this.setState({ draggedTask: task });
    event.dataTransfer?.setData('text/plain', task.id);
  }

  private handleDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  private handleDrop(columnId: string, event: DragEvent): void {
    event.preventDefault();
    const taskId = event.dataTransfer?.getData('text/plain');
    if (!taskId || !this.state.draggedTask) return;

    const updatedTasks = this.state.tasks.map(task => 
      task.id === taskId ? { ...task, status: columnId as Task['status'], column: columnId } : task
    );

    this.setState({ 
      tasks: updatedTasks,
      draggedTask: null 
    });
  }

  private handleCreateTask(columnId: string): void {
    const newTask: Task = {
      id: Date.now().toString(),
      title: 'New Task',
      description: 'Click to edit description',
      priority: 'medium',
      status: columnId as Task['status'],
      column: columnId
    };

    const updatedTasks = [...this.state.tasks, newTask];
    this.setState({ tasks: updatedTasks });
  }

  private handleTaskClick(task: Task): void {
    this.setState({ selectedTask: task });
  }



  private handleEditTask(task: Task): void {
    // For now, just select the task
    this.handleTaskClick(task);
  }

  override render(): HTMLElement {
    const { columns, tasks, selectedTask } = this.state;

    // Group tasks by column
    const tasksByColumn = columns.reduce((acc, column) => {
      acc[column.id] = tasks.filter(task => task.status === column.id);
      return acc;
    }, {} as Record<string, Task[]>);

    return createElement('div', { 
      className: 'flex-1 overflow-x-auto overflow-y-hidden p-6 bg-[#0d1218] board-scroll'
    }, [
      // Main kanban container
      createElement('div', { 
        className: 'flex h-full gap-6 min-w-max' 
      }, [
        // Render columns
        columns.map((column) => 
          this.renderColumn(column, tasksByColumn[column.id] || [])
        )
      ]),

      // Task Detail Modal
      selectedTask && this.renderTaskModal(selectedTask)
    ]);
  }

  private renderColumn(column: KanbanColumn, tasks: Task[]): HTMLElement {
    const isReviewColumn = column.id === 'qa';
    const isDoneColumn = column.id === 'done';

    return createElement('div', { 
      key: column.id,
      className: 'flex flex-col w-[320px] h-full'
    }, [
      // Column Header
      createElement('div', { 
        className: 'flex items-center justify-between mb-4 px-1'
      }, [
        createElement('div', { 
          className: 'flex items-center gap-2'
        }, [
          createElement('span', { 
            className: `font-bold text-sm tracking-wide ${
              isReviewColumn ? 'text-yellow-500' : 
              isDoneColumn ? 'text-emerald-500' : 
              'text-[#9dabb9]'
            }` 
          }, [column.title]),
          createElement('span', { 
            className: 'bg-surface-dark text-white text-xs font-medium px-2 py-0.5 rounded-full border border-border-dark'
          }, [String(tasks.length)])
        ]),
        // Column Actions
        createElement('div', { className: 'flex gap-1' }, [
          createElement(IconButton, {
            icon: 'add',
            onClick: () => this.handleCreateTask(column.id),
            className: 'text-[#9dabb9] hover:text-white'
          }),
          createElement(IconButton, {
            icon: 'more_horiz',
            className: 'text-[#9dabb9] hover:text-white'
          })
        ])
      ]),

      // Tasks Container
      createElement('div', { 
        className: 'flex flex-col gap-3 h-full overflow-y-auto pr-2 board-scroll pb-10'
      }, [
        // Tasks
        tasks.map(task => this.renderTask(task, column.id))
      ])
    ]);
  }

  private renderTask(task: Task, columnId: string): HTMLElement {
    const isSelected = this.state.selectedTask?.id === task.id;
    const priorityColors = {
      low: 'bg-gray-500/20 text-gray-400',
      medium: 'bg-blue-500/20 text-blue-400', 
      high: 'bg-red-500/20 text-red-400'
    };

    const columnStyles = {
      ideas: 'border border-purple-500/30',
      todo: 'hover:border-primary/50',
      in_progress: 'hover:border-primary/50',
      qa: 'border border-yellow-500/30 shadow-lg shadow-yellow-900/10',
      done: 'hover:border-primary/50'
    };

    const taskCard = createElement('div', {
      key: task.id,
      className: `bg-card-dark rounded-lg p-4 border border-border-dark shadow-sm cursor-pointer group relative ${
        columnStyles[columnId as keyof typeof columnStyles]
      } ${isSelected ? 'ring-2 ring-primary/40' : ''}`,
      draggable: true,
      onDragStart: (e: DragEvent) => this.handleDragStart(task, e),
      onDragOver: (e: DragEvent) => this.handleDragOver(e),
      onDrop: (e: DragEvent) => this.handleDrop(columnId, e),
        onClick: (e: Event) => {
        e.stopPropagation();
        this.handleTaskClick(task);
      }
      }, [
      // Task Header
      createElement('div', { 
        className: 'flex justify-between items-start mb-2'
      }, [
        createElement('span', { 
          className: 'text-[#5e6b7a] font-mono text-xs'
        }, [`#${task.id}`]),
        createElement('div', {
          className: `w-6 h-6 rounded-full flex items-center justify-center ${priorityColors[task.priority]}`
        }, [
          createElement('span', { 
            className: 'material-symbols-outlined text-[16px]'
          }, [
            task.priority === 'high' ? 'priority_high' : 
            task.priority === 'medium' ? 'remove' : 'low_priority'
          ])
        ])
      ]),

      // Task Title
      createElement('h3', { 
        className: 'text-gray-200 text-sm font-medium leading-snug mb-3'
      }, [task.title]),

      // Task Meta (optional)
      task.assignee && createElement('div', { 
        className: 'flex items-center gap-2 mb-3'
      }, [
        createElement('div', {
          className: 'w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center'
        }, [
          createElement('span', { 
            className: 'material-symbols-outlined text-[14px]'
          }, ['person'])
        ]),
        createElement('span', { 
          className: 'text-xs text-gray-500'
        }, [task.assignee])
      ]),

      // Task Actions (on hover)
      createElement('div', { 
        className: 'absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity'
      }, [
        createElement(IconButton, {
          icon: 'more_vert',
          size: 'sm',
          className: 'text-gray-500 hover:text-white bg-surface-dark/80',
          onClick: (e: Event) => {
            e.stopPropagation();
            // Show task menu
          }
        })
      ])
    ]);

    return taskCard;
  }

  private renderTaskModal(task: Task): HTMLElement {
    return createElement('div', {
      className: 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4',
        onClick: () => this.setState({ selectedTask: null })
    }, [
      createElement('div', {
        className: 'bg-surface-dark rounded-xl p-6 max-w-md w-full border border-border-dark shadow-xl',
        onClick: (e: Event) => e.stopPropagation()
      }, [
        // Modal Header
        createElement('div', { 
          className: 'flex justify-between items-center mb-4'
        }, [
          createElement('h2', { 
            className: 'text-xl font-bold text-white'
          }, [task.title]),
          createElement(IconButton, {
            icon: 'close',
            onClick: (e: Event) => {
            e.stopPropagation();
            this.setState({ selectedTask: null });
          }
          })
        ]),

        // Task Details
        createElement('div', { 
          className: 'space-y-4'
        }, [
          // Description
          createElement('div', {}, [
            createElement('label', { 
              className: 'block text-sm font-medium text-white mb-2'
            }, ['Description']),
            createElement('textarea', {
              className: 'w-full bg-surface-dark border border-border-dark text-white rounded-lg p-3 placeholder-text-secondary focus:ring-primary focus:border-primary',
              rows: 4,
              value: task.description,
              placeholder: 'Enter task description...'
            })
          ]),

          // Priority
          createElement('div', null, [
            createElement('label', { 
              className: 'block text-sm font-medium text-white mb-2'
            }, ['Priority']),
            createElement('select', {
              className: 'w-full bg-surface-dark border border-border-dark text-white rounded-lg p-3 focus:ring-primary focus:border-primary',
              value: task.priority
            }, [
              createElement('option', { value: 'low' }, ['Low']),
              createElement('option', { value: 'medium' }, ['Medium']),
              createElement('option', { value: 'high' }, ['High'])
            ])
          ]),

          // Actions
          createElement('div', { 
            className: 'flex gap-3 justify-end mt-6'
          }, [
            createElement(Button, {
              variant: 'ghost',
            onClick: (e: Event) => {
              e.stopPropagation();
              this.handleEditTask(task);
            }
            }, ['Delete']),
            createElement(Button, {
              variant: 'primary',
              onClick: (e: Event) => {
                e.stopPropagation();
                this.handleEditTask(task);
              }
            }, ['Save Changes'])
          ])
        ])
      ])
    ]);
  }
}