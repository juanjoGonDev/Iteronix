import { Component, createElement, type ComponentProps } from "../shared/Component.js";
import { Card, StatusBadge } from "./Card.js";
import { Button } from "./Button.js";
import type {
  Citation,
  ConfidenceScore,
  EvidenceReport,
  MemorySearchResult,
  WorkflowStep
} from "../shared/workbench-types.js";

interface SectionPanelProps extends ComponentProps {
  title: string;
  subtitle?: string | null;
  actions?: HTMLElement | null;
  children?: unknown;
  className?: string;
}

interface ConfidenceBadgeProps extends ComponentProps {
  confidence: ConfidenceScore;
  className?: string;
}

interface CitationsListProps extends ComponentProps {
  citations: ReadonlyArray<Citation>;
  evidenceSources?: ReadonlyArray<Citation>;
  title?: string;
  emptyLabel?: string;
  className?: string;
}

interface EvidenceReportPanelProps extends ComponentProps {
  report: EvidenceReport;
  className?: string;
}

interface EvidenceReportPanelState {
  activeSourceId: string | null;
}

interface WorkflowStepsListProps extends ComponentProps {
  steps: ReadonlyArray<WorkflowStep>;
  className?: string;
}

interface MemoryListProps extends ComponentProps {
  items: ReadonlyArray<MemorySearchResult>;
  className?: string;
}

interface EmptyStatePanelProps extends ComponentProps {
  icon: string;
  title: string;
  description: string;
  className?: string;
}

export interface CitationEvidenceGroup {
  citation: Citation;
  provenance: ReadonlyArray<Citation>;
}

export interface EvidenceSourceSummary {
  sourceId: string;
  uri: string;
  chunkCount: number;
}

export class SectionPanel extends Component<SectionPanelProps> {
  override render(): HTMLElement {
    const { title, subtitle = null, actions = null, children, className = "" } = this.props;

    return createElement(Card, {
      className: `border border-border-dark bg-surface-dark ${className}`,
      padding: "lg",
      children: [
      createElement("div", { className: "flex items-start justify-between gap-4 border-b border-border-dark pb-4" }, [
        createElement("div", { className: "flex flex-col gap-1" }, [
          createElement("h2", { className: "text-lg font-semibold text-white" }, [title]),
          subtitle
            ? createElement("p", { className: "text-sm text-text-secondary" }, [subtitle])
            : ""
        ]),
        actions ?? ""
      ]),
      createElement("div", { className: "pt-4" }, [children])
    ]
    });
  }
}

export class ConfidenceBadge extends Component<ConfidenceBadgeProps> {
  override render(): HTMLElement {
    const { confidence, className = "" } = this.props;
    const status = confidence.label === "high"
      ? "success"
      : confidence.label === "medium"
        ? "warning"
        : "error";

    return createElement(StatusBadge, {
      status,
      className,
      children: `${confidence.label.toUpperCase()} ${Math.round(confidence.score * 100)}%`
    });
  }
}

export class CitationsList extends Component<CitationsListProps> {
  override render(): HTMLElement {
    const {
      citations,
      evidenceSources = [],
      title = "Citations",
      emptyLabel = "No citations recorded.",
      className = ""
    } = this.props;
    const citationGroups = createCitationEvidenceGroups(citations, evidenceSources);

    return createElement("div", { className: `flex flex-col gap-3 ${className}` }, [
      createElement("div", { className: "flex items-center justify-between" }, [
        createElement("h3", { className: "text-sm font-semibold text-white" }, [title]),
        createElement("span", { className: "text-xs text-text-secondary" }, [`${citations.length} source${citations.length === 1 ? "" : "s"}`])
      ]),
      citations.length === 0
        ? createElement("div", { className: "rounded-lg border border-dashed border-border-dark px-3 py-4 text-sm text-text-secondary" }, [emptyLabel])
        : createElement("div", { className: "flex flex-col gap-3" }, [
            citationGroups.map((group) =>
              createElement("div", {
                key: group.citation.sourceId,
                className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3"
              }, [
                createElement("div", { className: "flex items-center justify-between gap-3" }, [
                  createElement("div", { className: "min-w-0" }, [
                    createElement("p", { className: "truncate text-sm font-medium text-white" }, [group.citation.uri]),
                    createElement("p", { className: "text-xs text-text-secondary" }, [
                      `${group.citation.sourceType} • score ${group.citation.score.toFixed(2)} • ${group.provenance.length} chunk${group.provenance.length === 1 ? "" : "s"}`
                    ])
                  ]),
                  createElement("span", { className: "text-xs text-text-secondary" }, [formatTimestamp(group.citation.retrievedAt)])
                ]),
                createElement("p", { className: "mt-2 text-sm leading-6 text-text-secondary" }, [group.citation.snippet]),
                group.provenance.length > 0
                  ? renderCitationProvenance(group)
                  : ""
              ])
            )
          ])
    ]);
  }
}

export const createCitationEvidenceGroups = (
  citations: ReadonlyArray<Citation>,
  evidenceSources: ReadonlyArray<Citation>
): ReadonlyArray<CitationEvidenceGroup> =>
  citations.map((citation) => ({
    citation,
    provenance: evidenceSources.filter((source) => source.sourceId === citation.sourceId)
  }));

export const createEvidenceSourceSummaries = (
  retrievedSources: ReadonlyArray<Citation>
): ReadonlyArray<EvidenceSourceSummary> => {
  const summaries = new Map<string, EvidenceSourceSummary>();

  for (const source of retrievedSources) {
    const current = summaries.get(source.sourceId);
    if (!current) {
      summaries.set(source.sourceId, {
        sourceId: source.sourceId,
        uri: source.uri,
        chunkCount: 1
      });
      continue;
    }

    summaries.set(source.sourceId, {
      ...current,
      chunkCount: current.chunkCount + 1
    });
  }

  return [...summaries.values()];
};

export const filterEvidenceSourcesBySourceId = (
  retrievedSources: ReadonlyArray<Citation>,
  sourceId: string | null
): ReadonlyArray<Citation> =>
  sourceId
    ? retrievedSources.filter((source) => source.sourceId === sourceId)
    : retrievedSources;

export class EvidenceReportPanel extends Component<EvidenceReportPanelProps, EvidenceReportPanelState> {
  constructor(props?: EvidenceReportPanelProps) {
    if (!props) {
      throw new Error("EvidenceReportPanel requires a report.");
    }

    super(props, {
      activeSourceId: null
    });
  }

  override render(): HTMLElement {
    const { report, className = "" } = this.props;
    const sourceSummaries = createEvidenceSourceSummaries(report.retrievedSources);
    const totalRetrievedChunks = report.retrievedSources.length;
    const filteredSources = filterEvidenceSourcesBySourceId(report.retrievedSources, this.state.activeSourceId);
    const activeSourceSummary = this.state.activeSourceId
      ? sourceSummaries.find((summary) => summary.sourceId === this.state.activeSourceId) ?? null
      : null;

    return createElement("div", { className: `grid gap-4 md:grid-cols-2 ${className}` }, [
      createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3" }, [
        createElement("div", { className: "flex items-center justify-between gap-3" }, [
          createElement("h3", { className: "text-sm font-semibold text-white" }, ["Confidence"]),
          createElement(ConfidenceBadge, {
            confidence: report.confidence
          })
        ]),
        createElement("p", { className: "mt-3 text-xs uppercase tracking-wide text-text-secondary" }, ["Signals"]),
        createElement("div", { className: "mt-2 flex flex-wrap gap-2" }, [
          report.confidence.signals.map((signal) =>
            createElement("span", {
              key: signal,
              className: "rounded-md border border-border-dark px-2 py-1 text-xs text-text-secondary"
            }, [signal])
          )
        ])
      ]),
      createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3" }, [
        createElement("h3", { className: "text-sm font-semibold text-white" }, ["Usage"]),
        createElement("dl", { className: "mt-3 grid grid-cols-2 gap-3 text-sm" }, [
          renderDefinition("Prompt", String(report.usage.promptTokens)),
          renderDefinition("Completion", String(report.usage.completionTokens)),
          renderDefinition("Total", String(report.usage.totalTokens)),
          renderDefinition("Latency", `${report.usage.latencyMs} ms`),
          renderDefinition("Cost", `$${report.usage.estimatedCostUsd.toFixed(4)}`),
          renderDefinition("Trace", report.traceId.slice(0, 8))
        ])
      ]),
      createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3 md:col-span-2" }, [
        createElement("h3", { className: "text-sm font-semibold text-white" }, ["Decisions"]),
        createElement("ul", { className: "mt-3 flex flex-col gap-2 text-sm text-text-secondary" }, [
          report.decisions.map((decision, index) =>
            createElement("li", {
              key: `${report.traceId}-decision-${index}`,
              className: "rounded-md border border-border-dark px-3 py-2"
            }, [decision])
          )
        ])
      ]),
      createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3 md:col-span-2" }, [
        createElement("h3", { className: "text-sm font-semibold text-white" }, ["Guardrails"]),
        report.guardrailsTriggered.length === 0
          ? createElement("p", { className: "mt-3 text-sm text-text-secondary" }, ["No guardrail violations were recorded."])
          : createElement("ul", { className: "mt-3 flex flex-col gap-2 text-sm text-text-secondary" }, [
              report.guardrailsTriggered.map((item, index) =>
                createElement("li", {
                  key: `${report.traceId}-guardrail-${index}`,
                  className: "rounded-md border border-border-dark px-3 py-2"
                }, [item])
              )
            ])
      ]),
      createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3 md:col-span-2" }, [
        createElement("div", { className: "flex items-center justify-between gap-3" }, [
          createElement("h3", { className: "text-sm font-semibold text-white" }, ["Provenance summary"]),
          createElement("div", { className: "flex items-center gap-3" }, [
            this.state.activeSourceId
              ? createElement(Button, {
                  variant: "ghost",
                  size: "sm",
                  onClick: () => this.clearSourceFilter(),
                  children: "Show all"
                })
              : "",
            createElement("span", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [
              `${sourceSummaries.length} source${sourceSummaries.length === 1 ? "" : "s"} • ${totalRetrievedChunks} chunk${totalRetrievedChunks === 1 ? "" : "s"}`
            ])
          ])
        ]),
        sourceSummaries.length === 0
          ? createElement("p", { className: "mt-3 text-sm text-text-secondary" }, ["No retrieved sources were recorded."])
          : createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
              sourceSummaries.map((summary) => renderEvidenceSourceSummary(summary, summary.sourceId === this.state.activeSourceId, () => this.handleSourceFilter(summary.sourceId)))
            ])
      ]),
      createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3 md:col-span-2" }, [
        createElement("div", { className: "flex items-center justify-between gap-3" }, [
          createElement("div", { className: "flex flex-col gap-1" }, [
            createElement("h3", { className: "text-sm font-semibold text-white" }, ["Retrieved chunks"]),
            createElement("p", { className: "text-xs text-text-secondary" }, [
              activeSourceSummary
                ? `${filteredSources.length} chunk${filteredSources.length === 1 ? "" : "s"} from ${activeSourceSummary.uri}`
                : `${filteredSources.length} recorded chunk${filteredSources.length === 1 ? "" : "s"}`
            ])
          ]),
          activeSourceSummary
            ? createElement(Button, {
                variant: "secondary",
                size: "sm",
                onClick: () => this.clearSourceFilter(),
                children: "Clear filter"
              })
            : ""
        ]),
        filteredSources.length === 0
          ? createElement("p", { className: "mt-3 text-sm text-text-secondary" }, ["No retrieved chunks match the current source filter."])
          : createElement("div", { className: "mt-3 flex flex-col gap-2" }, [
              filteredSources.map((source) => renderRetrievedEvidenceChunk(source))
            ])
      ])
    ]);
  }

  private handleSourceFilter(sourceId: string): void {
    this.setState({
      activeSourceId: sourceId
    });
  }

  private clearSourceFilter(): void {
    this.setState({
      activeSourceId: null
    });
  }
}

export class WorkflowStepsList extends Component<WorkflowStepsListProps> {
  override render(): HTMLElement {
    const { steps, className = "" } = this.props;

    return createElement("div", { className: `flex flex-col gap-3 ${className}` }, [
      steps.map((step) =>
        createElement("div", {
          key: `${step.stage}-${step.timestamp}`,
          className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3"
        }, [
          createElement("div", { className: "flex items-center justify-between gap-3" }, [
            createElement("div", { className: "flex items-center gap-3" }, [
              createElement("span", { className: "material-symbols-outlined text-text-secondary" }, [iconForStage(step.stage)]),
              createElement("div", { className: "flex flex-col" }, [
                createElement("p", { className: "text-sm font-medium capitalize text-white" }, [step.stage]),
                createElement("p", { className: "text-xs text-text-secondary" }, [formatTimestamp(step.timestamp)])
              ])
            ]),
            createElement(StatusBadge, {
              status: step.status === "completed" ? "success" : "warning"
            }, [step.status === "completed" ? "done" : "waiting"])
          ]),
          createElement("p", { className: "mt-3 text-sm leading-6 text-text-secondary" }, [step.summary])
        ])
      )
    ]);
  }
}

export class MemoryList extends Component<MemoryListProps> {
  override render(): HTMLElement {
    const { items, className = "" } = this.props;

    return createElement("div", { className: `flex flex-col gap-3 ${className}` }, [
      items.length === 0
        ? createElement("div", { className: "rounded-lg border border-dashed border-border-dark px-3 py-4 text-sm text-text-secondary" }, ["No session memory retrieved yet."])
        : items.map((item) =>
            createElement("div", {
              key: item.id,
              className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3"
            }, [
              createElement("div", { className: "flex items-center justify-between gap-3" }, [
                createElement("span", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [item.kind]),
                createElement("span", { className: "text-xs text-text-secondary" }, [`score ${item.score.toFixed(2)}`])
              ]),
              createElement("p", { className: "mt-2 text-sm leading-6 text-text-secondary" }, [item.content]),
              createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [formatTimestamp(item.createdAt)])
            ])
          )
    ]);
  }
}

export class EmptyStatePanel extends Component<EmptyStatePanelProps> {
  override render(): HTMLElement {
    const { icon, title, description, className = "" } = this.props;

    return createElement(Card, {
      className: `border border-dashed border-border-dark bg-surface-dark ${className}`,
      padding: "lg",
      children: [
      createElement("div", { className: "flex flex-col items-start gap-3" }, [
        createElement("span", { className: "material-symbols-outlined text-2xl text-text-secondary" }, [icon]),
        createElement("div", { className: "flex flex-col gap-1" }, [
          createElement("h3", { className: "text-base font-semibold text-white" }, [title]),
          createElement("p", { className: "text-sm leading-6 text-text-secondary" }, [description])
        ])
      ])
    ]
    });
  }
}

const renderDefinition = (label: string, value: string): HTMLElement =>
  createElement("div", { className: "flex flex-col gap-1" }, [
    createElement("dt", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [label]),
    createElement("dd", { className: "text-sm font-medium text-white" }, [value])
  ]);

const renderEvidenceSourceSummary = (
  summary: EvidenceSourceSummary,
  isActive: boolean,
  onClick: () => void
): HTMLElement =>
  createElement("button", {
    type: "button",
    key: summary.sourceId,
    onClick,
    className: `flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left transition-colors ${isActive ? "border-primary bg-primary/10" : "border-border-dark hover:bg-surface-dark-hover"}`
  }, [
    createElement("div", { className: "min-w-0" }, [
      createElement("p", { className: "truncate text-sm font-medium text-white" }, [summary.uri]),
      createElement("p", { className: "text-xs text-text-secondary" }, [summary.sourceId])
    ]),
    createElement("span", {
      className: "shrink-0 rounded-md border border-border-dark px-2 py-1 text-xs uppercase tracking-wide text-text-secondary"
    }, [`${summary.chunkCount} chunk${summary.chunkCount === 1 ? "" : "s"}`])
  ]);

const renderRetrievedEvidenceChunk = (source: Citation): HTMLElement =>
  createElement("div", {
    key: source.chunkId,
    className: "rounded-md border border-border-dark bg-background-dark/40 px-3 py-3"
  }, [
    createElement("div", { className: "flex items-center justify-between gap-3" }, [
      createElement("div", { className: "min-w-0" }, [
        createElement("p", {
          className: "truncate text-xs uppercase tracking-wide text-text-secondary"
        }, [source.chunkId]),
        createElement("p", { className: "mt-1 text-xs text-text-secondary" }, [
          `${source.sourceType} • score ${source.score.toFixed(2)} • updated ${formatTimestamp(source.updatedAt)}`
        ])
      ]),
      createElement("span", { className: "text-xs text-text-secondary" }, [
        formatTimestamp(source.retrievedAt)
      ])
    ]),
    createElement("p", { className: "mt-2 text-sm leading-6 text-text-secondary" }, [source.snippet])
  ]);

const renderCitationProvenance = (group: CitationEvidenceGroup): HTMLElement =>
  createElement("details", {
    className: "mt-3 overflow-hidden rounded-lg border border-border-dark bg-surface-dark/60"
  }, [
    createElement("summary", {
      className: "cursor-pointer list-none px-3 py-3 text-sm text-white"
    }, [
      createElement("div", { className: "flex items-center justify-between gap-3" }, [
        createElement("span", { className: "font-medium" }, ["Inspect chunk provenance"]),
        createElement("span", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [
          `${group.provenance.length} chunk${group.provenance.length === 1 ? "" : "s"}`
        ])
      ])
    ]),
    createElement("div", { className: "flex flex-col gap-2 border-t border-border-dark px-3 py-3" }, [
      group.provenance.map((source) => renderRetrievedEvidenceChunk(source))
    ])
  ]);

const iconForStage = (stage: WorkflowStep["stage"]): string => {
  if (stage === "planner") {
    return "route";
  }

  if (stage === "retriever") {
    return "search";
  }

  if (stage === "executor") {
    return "terminal";
  }

  return "fact_check";
};

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};
