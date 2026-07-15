import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/WorkbenchPanels.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";
import { workflowEditorRoute } from "../shared/constants.js";
import { router } from "../shared/Router.js";
import { createWorkflowClient } from "../shared/workflow-client.js";
import { createEmptyWorkflowDefinition } from "./workflows-editor-state.js";
import {
  WorkflowCatalogSort,
  readWorkflowCatalogRows,
} from "./workflows-catalog-state.js";
import type {
  WorkflowDefinitionRecord,
  WorkflowExecutionRecord,
} from "./workflows-editor-state.js";

const WorkflowCatalogSelector = {
  Root: "workflows-catalog-root",
  Search: "workflows-catalog-search",
  Sort: "workflows-catalog-sort",
  Create: "workflows-catalog-create",
  EmptyCreate: "workflows-catalog-empty-create",
  RowPrefix: "workflows-catalog-row-",
  OpenPrefix: "workflows-catalog-open-",
} as const;

type WorkflowsCatalogState = {
  workflows: ReadonlyArray<WorkflowDefinitionRecord>;
  executions: ReadonlyArray<WorkflowExecutionRecord>;
  query: string;
  sort: WorkflowCatalogSort;
  loading: boolean;
  creating: boolean;
  errorMessage: string | null;
};

export class WorkflowsCatalogScreen extends Component<
  ComponentProps,
  WorkflowsCatalogState
> {
  private readonly workflowClient = createWorkflowClient();

  constructor(props: ComponentProps = {}) {
    super(props, {
      workflows: [],
      executions: [],
      query: "",
      sort: WorkflowCatalogSort.UpdatedDescending,
      loading: true,
      creating: false,
      errorMessage: null,
    });
  }

  override onMount(): void {
    void this.loadCatalog();
  }

  override render(): HTMLElement {
    const rows = readWorkflowCatalogRows({
      workflows: this.state.workflows,
      executions: this.state.executions,
      query: this.state.query,
      sort: this.state.sort,
    });

    return createElement(
      "main",
      {
        className:
          "min-h-full bg-[#11161d] px-4 py-5 text-white sm:px-6 lg:px-8",
        "data-testid": WorkflowCatalogSelector.Root,
      },
      [
        createElement(
          "div",
          { className: "mx-auto flex max-w-6xl flex-col gap-5" },
          [
            this.renderToolbar(),
            this.state.errorMessage
              ? createElement(
                  "p",
                  {
                    className:
                      "border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100",
                  },
                  [this.state.errorMessage],
                )
              : "",
            this.state.loading
              ? this.renderLoadingState()
              : rows.length === 0
                ? this.renderEmptyState()
                : this.renderRows(rows),
          ],
        ),
      ],
    );
  }

  private renderToolbar(): HTMLElement {
    return createElement(
      "section",
      {
        className:
          "flex flex-col gap-4 border-b border-border-dark pb-5 sm:flex-row sm:items-end sm:justify-between",
      },
      [
        createElement("div", { className: "min-w-0" }, [
          createElement(
            "h1",
            { className: "text-xl font-semibold tracking-tight text-white" },
            ["Workflows"],
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-text-secondary" },
            [
              "Create, select, and monitor your persisted workflow definitions.",
            ],
          ),
        ]),
        createElement(Button, {
          variant: "primary",
          size: "sm",
          disabled: this.state.creating,
          onClick: () => {
            void this.createWorkflow();
          },
          icon: "add",
          children: this.state.creating ? "Creating" : "Create workflow",
          dataset: { testid: WorkflowCatalogSelector.Create },
        }),
      ],
    );
  }

  private renderLoadingState(): HTMLElement {
    return createElement(
      "div",
      { className: "border border-border-dark bg-[#151b22] px-4 py-8" },
      [
        createElement("p", { className: "text-sm text-text-secondary" }, [
          "Loading workflows…",
        ]),
      ],
    );
  }

  private renderEmptyState(): HTMLElement {
    const hasSearch = this.state.query.trim().length > 0;
    return createElement("div", { className: "py-8" }, [
      createElement(EmptyStatePanel, {
        icon: hasSearch ? "search_off" : "account_tree",
        title: hasSearch ? "No matching workflows" : "No workflows yet",
        description: hasSearch
          ? "Try another search term or clear the search to see every workflow."
          : "Create a workflow to open its editor and start building.",
        className: "min-h-64",
      }),
      !hasSearch
        ? createElement("div", { className: "mt-4 flex justify-center" }, [
            createElement(Button, {
              variant: "primary",
              size: "sm",
              disabled: this.state.creating,
              onClick: () => {
                void this.createWorkflow();
              },
              icon: "add",
              children: "Create workflow",
              dataset: { testid: WorkflowCatalogSelector.EmptyCreate },
            }),
          ])
        : "",
    ]);
  }

  private renderRows(
    rows: ReturnType<typeof readWorkflowCatalogRows>,
  ): HTMLElement {
    return createElement(
      "section",
      { className: "border border-border-dark" },
      [
        this.renderFilters(),
        createElement(
          "div",
          { className: "divide-y divide-border-dark" },
          rows.map((row) => this.renderRow(row)),
        ),
      ],
    );
  }

  private renderFilters(): HTMLElement {
    return createElement(
      "div",
      {
        className:
          "flex flex-col gap-3 border-b border-border-dark bg-[#151b22] p-3 sm:flex-row sm:items-center",
      },
      [
        createElement("label", { className: "min-w-0 flex-1" }, [
          createElement("span", { className: "sr-only" }, ["Search workflows"]),
          createElement("input", {
            type: "search",
            value: this.state.query,
            placeholder: "Search workflows",
            className:
              "h-10 w-full border border-border-dark bg-[#0f151c] px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-primary",
            "data-testid": WorkflowCatalogSelector.Search,
            onInput: (event: Event) => {
              const target = event.target;
              if (target instanceof HTMLInputElement) {
                this.setState({ query: target.value });
              }
            },
          }),
        ]),
        createElement("label", { className: "flex items-center gap-2" }, [
          createElement("span", { className: "text-sm text-text-secondary" }, [
            "Sort",
          ]),
          createElement(
            "select",
            {
              value: this.state.sort,
              className:
                "h-10 border border-border-dark bg-[#0f151c] px-3 text-sm text-white outline-none focus:border-primary",
              "data-testid": WorkflowCatalogSelector.Sort,
              onChange: (event: Event) => {
                const target = event.target;
                if (target instanceof HTMLSelectElement) {
                  this.setState({
                    sort:
                      target.value === WorkflowCatalogSort.NameAscending
                        ? WorkflowCatalogSort.NameAscending
                        : WorkflowCatalogSort.UpdatedDescending,
                  });
                }
              },
            },
            [
              createElement(
                "option",
                { value: WorkflowCatalogSort.UpdatedDescending },
                ["Last updated"],
              ),
              createElement(
                "option",
                { value: WorkflowCatalogSort.NameAscending },
                ["Name"],
              ),
            ],
          ),
        ]),
      ],
    );
  }

  private renderRow(
    row: ReturnType<typeof readWorkflowCatalogRows>[number],
  ): HTMLElement {
    const latestExecution = row.execution.latest;
    const executionLabel = latestExecution
      ? `${latestExecution.status} · ${formatTimestamp(latestExecution.startedAt)}`
      : "No executions yet";

    return createElement(
      "article",
      {
        className:
          "flex flex-col gap-3 bg-[#11161d] px-4 py-4 transition-colors hover:bg-[#171e27] sm:flex-row sm:items-center sm:justify-between",
        "data-testid": `${WorkflowCatalogSelector.RowPrefix}${row.workflow.id}`,
      },
      [
        createElement("div", { className: "min-w-0" }, [
          createElement(
            "p",
            { className: "truncate text-sm font-semibold text-white" },
            [row.workflow.name],
          ),
          createElement(
            "p",
            { className: "mt-1 truncate text-sm text-text-secondary" },
            [row.workflow.description || "No description yet"],
          ),
          createElement(
            "div",
            {
              className:
                "mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary",
            },
            [
              createElement("span", {}, [
                `Updated ${formatTimestamp(row.workflow.updatedAt)}`,
              ]),
              createElement("span", {}, [
                `${row.execution.total.toString()} execution${row.execution.total === 1 ? "" : "s"}`,
              ]),
              createElement(
                "span",
                {
                  className:
                    latestExecution?.status === "failed" ? "text-rose-200" : "",
                },
                [executionLabel],
              ),
            ],
          ),
        ]),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          onClick: () => router.navigate(workflowEditorRoute(row.workflow.id)),
          icon: "arrow_forward",
          children: "Open",
          dataset: {
            testid: `${WorkflowCatalogSelector.OpenPrefix}${row.workflow.id}`,
          },
        }),
      ],
    );
  }

  private async loadCatalog(): Promise<void> {
    this.setState({ loading: true, errorMessage: null });
    try {
      const [workflows, executions] = await Promise.all([
        this.workflowClient.listDefinitions(),
        this.workflowClient.listExecutions(),
      ]);
      this.setState({ workflows, executions, loading: false });
    } catch (error) {
      this.setState({
        loading: false,
        errorMessage: readErrorMessage(error, "Could not load workflows."),
      });
    }
  }

  private async createWorkflow(): Promise<void> {
    this.setState({ creating: true, errorMessage: null });
    try {
      const workflow = await this.workflowClient.upsertDefinition({
        definition: createEmptyWorkflowDefinition({
          name: `Workflow ${this.state.workflows.length + 1}`,
        }),
      });
      router.navigate(workflowEditorRoute(workflow.id));
    } catch (error) {
      this.setState({
        creating: false,
        errorMessage: readErrorMessage(error, "Could not create the workflow."),
      });
    }
  }
}

const formatTimestamp = (value: string): string => {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toLocaleString();
};

const readErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
