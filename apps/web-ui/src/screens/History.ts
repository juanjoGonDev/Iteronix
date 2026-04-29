import { Component, createElement, type ComponentProps } from "../shared/Component.js";
import { Button } from "../components/Button.js";
import {
  PageFrame,
  PageIntro,
  PageNoticeStack
} from "../components/PageScaffold.js";
import {
  CitationsList,
  ConfidenceBadge,
  EmptyStatePanel,
  EvidenceReportPanel,
  MemoryList,
  SectionPanel,
  WorkflowStepsList,
  renderWorkbenchMetaCell as renderMetaCell,
  renderWorkbenchTextField as renderInputField
} from "../components/WorkbenchPanels.js";
import { createWorkbenchClient } from "../shared/workbench-client.js";
import { createWorkbenchHistoryStore } from "../shared/workbench-history.js";
import {
  MinimalEvalDatasetPath,
  type WorkbenchEvalHistoryRecord,
  type WorkbenchHistoryState,
  type WorkbenchRunHistoryRecord
} from "../shared/workbench-types.js";

interface HistoryScreenState {
  history: WorkbenchHistoryState;
  selectedKind: "run" | "eval";
  selectedId: string | null;
  selectedEvidenceSourceId: string | null;
  datasetPath: string;
  pendingAction: "eval" | null;
  errorMessage: string | null;
  noticeMessage: string | null;
}

export class HistoryScreen extends Component<ComponentProps, HistoryScreenState> {
  private readonly historyStore = createWorkbenchHistoryStore();

  constructor(props: ComponentProps = {}) {
    super(props);
    const history = this.historyStore.load();
    const selection = pickInitialSelection(history);
    this.state = {
      history,
      selectedKind: selection.kind,
      selectedId: selection.id,
      selectedEvidenceSourceId: null,
      datasetPath: MinimalEvalDatasetPath,
      pendingAction: null,
      errorMessage: null,
      noticeMessage: null
    };
  }

  override render(): HTMLElement {
    return createElement(PageFrame, {}, [
      createElement(PageIntro, {
        title: "Run history",
        description: "Browse locally persisted workbench runs, inspect evidence and citations, and trigger the repository-backed evaluation suite from the UI."
      }),
      createElement(PageNoticeStack, {
        errorMessage: this.state.errorMessage,
        noticeMessage: this.state.noticeMessage
      }),
      createElement("div", { className: "grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]" }, [
        createElement("div", { className: "flex flex-col gap-6" }, [
          this.renderEvalPanel(),
          this.renderListPanel()
        ]),
        createElement("div", { className: "flex flex-col gap-6" }, [
          this.renderSelectionPanel()
        ])
      ])
    ]);
  }

  private renderEvalPanel(): HTMLElement {
    const awaitingReviews = this.state.history.runs.filter((run) => run.status === "awaiting_approval").length;

    return createElement(SectionPanel, {
      title: "Eval suite",
      subtitle: "Runs the minimal JSONL dataset through the same backend service used by the rest of the workbench.",
      actions: createElement(Button, {
        variant: "primary",
        size: "sm",
        disabled: this.state.pendingAction === "eval",
        onClick: () => {
          void this.handleRunEvaluation();
        },
        children: this.state.pendingAction === "eval" ? "Running" : "Run eval"
      }),
      children: createElement("div", { className: "flex flex-col gap-4" }, [
        renderInputField({
          label: "Dataset path",
          value: this.state.datasetPath,
          placeholder: MinimalEvalDatasetPath,
          onChange: (value) => this.setState({ datasetPath: value })
        }),
        createElement("div", { className: "grid gap-3 sm:grid-cols-3" }, [
          renderMetaCell("Runs", String(this.state.history.runs.length)),
          renderMetaCell("Awaiting", String(awaitingReviews)),
          renderMetaCell("Evals", String(this.state.history.evals.length))
        ])
      ])
    });
  }

  private renderListPanel(): HTMLElement {
    const runItems = this.state.history.runs.map((run) => this.renderListItem({
      id: run.id,
      kind: "run",
      title: run.question,
      meta: `${run.kind} • ${run.status.replace(/_/g, " ")}`,
      timestamp: run.updatedAt
    }));
    const evalItems = this.state.history.evals.map((evaluation) => this.renderListItem({
      id: evaluation.id,
      kind: "eval",
      title: evaluation.datasetPath,
      meta: `${evaluation.result.summary.passed}/${evaluation.result.summary.total} passed`,
      timestamp: evaluation.updatedAt
    }));

    return createElement(SectionPanel, {
      title: "History browser",
      subtitle: "Skill runs, workflow runs and evaluation executions stored in local browser history.",
      children: createElement("div", { className: "flex flex-col gap-4" }, [
        createElement("div", { className: "flex gap-3" }, [
          createElement(Button, {
            variant: this.state.selectedKind === "run" ? "primary" : "secondary",
            size: "sm",
            onClick: () => this.selectFirst("run"),
            children: `Runs ${this.state.history.runs.length}`
          }),
          createElement(Button, {
            variant: this.state.selectedKind === "eval" ? "primary" : "secondary",
            size: "sm",
            onClick: () => this.selectFirst("eval"),
            children: `Evals ${this.state.history.evals.length}`
          })
        ]),
        this.state.selectedKind === "run"
          ? runItems.length > 0
            ? createElement("div", { className: "flex flex-col gap-3" }, [runItems])
            : createElement(EmptyStatePanel, {
                icon: "history",
                title: "No runs stored",
                description: "Execute the example skill or the workflow in the Workflows screen to populate this list."
              })
          : evalItems.length > 0
            ? createElement("div", { className: "flex flex-col gap-3" }, [evalItems])
            : createElement(EmptyStatePanel, {
                icon: "rule",
                title: "No evals stored",
                description: "Run the minimal dataset to record CI-style evaluation results here."
              })
      ])
    });
  }

  private renderSelectionPanel(): HTMLElement {
    const selectedRun = this.getSelectedRun();
    const selectedEval = this.getSelectedEval();

    if (this.state.selectedKind === "run" && selectedRun) {
      return this.renderRunDetail(selectedRun);
    }

    if (this.state.selectedKind === "eval" && selectedEval) {
      return this.renderEvalDetail(selectedEval);
    }

    return createElement(EmptyStatePanel, {
      icon: "visibility",
      title: "Nothing selected",
      description: "Choose a stored run or evaluation from the left column to inspect its details."
    });
  }

  private renderRunDetail(run: WorkbenchRunHistoryRecord): HTMLElement {
    const finalResult = run.kind === "skill" ? run.result : run.result.final;
    const review = run.kind === "workflow" ? run.review : undefined;

    return createElement("div", { className: "flex flex-col gap-6" }, [
      createElement(SectionPanel, {
        title: run.question,
        subtitle: `${run.skillName} • ${run.sessionId}`,
        actions: createElement(ConfidenceBadge, {
          confidence: finalResult.confidence
        }),
        children: createElement("div", { className: "flex flex-col gap-5" }, [
          createElement("div", { className: "grid gap-3 md:grid-cols-3" }, [
            renderMetaCell("Status", run.status.replace(/_/g, " ")),
            renderMetaCell("Trace", finalResult.traceId.slice(0, 8)),
            renderMetaCell("Updated", formatTimestamp(run.updatedAt))
          ]),
          createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
            createElement("p", { className: "text-xs uppercase tracking-wide text-text-secondary" }, ["Answer"]),
            createElement("p", { className: "mt-2 text-sm leading-7 text-white" }, [finalResult.output.answer])
          ]),
          run.kind === "workflow"
            ? createElement(SectionPanel, {
                title: "Workflow stages",
                subtitle: "Planner, retriever, executor and reviewer summaries for this run.",
                children: createElement(WorkflowStepsList, {
                  steps: run.result.steps
                })
              })
            : "",
          review
            ? createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
                createElement("div", { className: "flex items-center justify-between gap-3" }, [
                  createElement("p", { className: "text-sm font-semibold text-white" }, ["Reviewer note"]),
                  createElement("span", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [review.decision])
                ]),
                createElement("p", { className: "mt-2 text-sm leading-6 text-text-secondary" }, [review.reason]),
                createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [formatTimestamp(review.decidedAt)])
              ])
            : ""
        ])
      }),
      createElement(SectionPanel, {
        title: "Evidence report",
        subtitle: `Confidence ${Math.round(finalResult.confidence.score * 100)}% • ${finalResult.citations.length} citations`,
        children: createElement(EvidenceReportPanel, {
          report: finalResult.evidenceReport,
          activeSourceId: this.state.selectedEvidenceSourceId,
          onSourceSelect: (sourceId) => this.setState({ selectedEvidenceSourceId: sourceId })
        })
      }),
      createElement("div", { className: "grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]" }, [
        createElement(SectionPanel, {
          title: "Citations",
          subtitle: "Retrieved sources and provenance for the selected run.",
          children: createElement(CitationsList, {
            citations: finalResult.citations,
            evidenceSources: finalResult.evidenceReport.retrievedSources,
            activeSourceId: this.state.selectedEvidenceSourceId,
            onSourceSelect: (sourceId) => this.setState({ selectedEvidenceSourceId: sourceId }),
            emptyLabel: "This run did not store citations."
          })
        }),
        createElement(SectionPanel, {
          title: "Session memory",
          subtitle: "Persisted working and episodic items for the same session.",
          children: createElement(MemoryList, {
            items: run.memory
          })
        })
      ])
    ]);
  }

  private renderEvalDetail(evaluation: WorkbenchEvalHistoryRecord): HTMLElement {
    return createElement("div", { className: "flex flex-col gap-6" }, [
      createElement(SectionPanel, {
        title: "Evaluation result",
        subtitle: evaluation.datasetPath,
        children: createElement("div", { className: "flex flex-col gap-5" }, [
          createElement("div", { className: "grid gap-3 md:grid-cols-4" }, [
            renderMetaCell("Total", String(evaluation.result.summary.total)),
            renderMetaCell("Passed", String(evaluation.result.summary.passed)),
            renderMetaCell("Failed", String(evaluation.result.summary.failed)),
            renderMetaCell("Updated", formatTimestamp(evaluation.updatedAt))
          ]),
          createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 overflow-hidden" }, [
            createElement("div", { className: "grid grid-cols-[140px_110px_140px_minmax(0,1fr)] border-b border-border-dark px-4 py-3 text-xs uppercase tracking-wide text-text-secondary" }, [
              createElement("span", {}, ["Case"]),
              createElement("span", {}, ["Status"]),
              createElement("span", {}, ["Trace"]),
              createElement("span", {}, ["Reasons"])
            ]),
            evaluation.result.results.map((result) =>
              createElement("div", {
                key: `${evaluation.id}-${result.caseId}`,
                className: "grid grid-cols-[140px_110px_140px_minmax(0,1fr)] gap-3 border-b border-border-dark px-4 py-3 text-sm last:border-b-0"
              }, [
                createElement("span", { className: "font-medium text-white" }, [result.caseId]),
                createElement("span", { className: result.passed ? "text-emerald-300" : "text-rose-300" }, [result.passed ? "passed" : "failed"]),
                createElement("span", { className: "font-mono text-text-secondary" }, [result.traceId.slice(0, 8)]),
                createElement("span", { className: "text-text-secondary" }, [result.reasons.length > 0 ? result.reasons.join("; ") : "No issues recorded."])
              ])
            )
          ])
        ])
      })
    ]);
  }

  private renderListItem(input: {
    id: string;
    kind: "run" | "eval";
    title: string;
    meta: string;
    timestamp: string;
  }): HTMLElement {
    const selected = this.state.selectedKind === input.kind && this.state.selectedId === input.id;

    return createElement("button", {
      className: `rounded-lg border px-3 py-3 text-left transition-colors ${selected ? "border-primary bg-primary/10" : "border-border-dark bg-background-dark/40 hover:bg-surface-dark-hover"}`,
      onClick: () => this.setState({
        selectedKind: input.kind,
        selectedId: input.id,
        selectedEvidenceSourceId: null
      })
    }, [
      createElement("p", { className: "truncate text-sm font-medium text-white" }, [input.title]),
      createElement("p", { className: "mt-1 text-xs uppercase tracking-wide text-text-secondary" }, [input.meta]),
      createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [formatTimestamp(input.timestamp)])
    ]);
  }

  private async handleRunEvaluation(): Promise<void> {
    if (!this.state.datasetPath.trim()) {
      this.setState({ errorMessage: "A dataset path is required.", noticeMessage: null });
      return;
    }

    this.setState({ pendingAction: "eval", errorMessage: null, noticeMessage: null });

    try {
      const client = createWorkbenchClient();
      const result = await client.runEvaluation({
        datasetPath: this.state.datasetPath.trim()
      });
      const record = this.historyStore.saveEvalRun({
        datasetPath: this.state.datasetPath.trim(),
        result
      });
      const history = this.historyStore.load();
      this.setState({
        history,
        selectedKind: "eval",
        selectedId: record.id,
        selectedEvidenceSourceId: null,
        pendingAction: null,
        noticeMessage: "Evaluation stored in History.",
        errorMessage: null
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: error instanceof Error ? error.message : "Could not run the evaluation suite.",
        noticeMessage: null
      });
    }
  }

  private selectFirst(kind: "run" | "eval"): void {
    const history = this.historyStore.load();
    const selectedId = kind === "run"
      ? history.runs[0]?.id ?? null
      : history.evals[0]?.id ?? null;

    this.setState({
      history,
      selectedKind: kind,
      selectedId,
      selectedEvidenceSourceId: null,
      errorMessage: null,
      noticeMessage: null
    });
  }

  private getSelectedRun(): WorkbenchRunHistoryRecord | undefined {
    return this.state.history.runs.find((run) => run.id === this.state.selectedId);
  }

  private getSelectedEval(): WorkbenchEvalHistoryRecord | undefined {
    return this.state.history.evals.find((evaluation) => evaluation.id === this.state.selectedId);
  }
}

const pickInitialSelection = (history: WorkbenchHistoryState): {
  kind: "run" | "eval";
  id: string | null;
} => {
  const runId = history.runs[0]?.id ?? null;
  if (runId) {
    return {
      kind: "run",
      id: runId
    };
  }

  return {
    kind: "eval",
    id: history.evals[0]?.id ?? null
  };
};

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};
