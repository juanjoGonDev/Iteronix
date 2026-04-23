import { Component, createElement, type ComponentProps } from "../shared/Component.js";
import { Button } from "../components/Button.js";
import {
  CitationsList,
  ConfidenceBadge,
  EmptyStatePanel,
  EvidenceReportPanel,
  MemoryList,
  SectionPanel,
  WorkflowStepsList
} from "../components/WorkbenchPanels.js";
import { createWorkbenchClient } from "../shared/workbench-client.js";
import { createWorkbenchHistoryStore } from "../shared/workbench-history.js";
import {
  DefaultMemoryQueryLimit,
  ReviewerDecision,
  WorkbenchSkillName,
  type SkillRunResponse,
  type WorkbenchRunHistoryRecord
} from "../shared/workbench-types.js";
import { readServerConnection, writeServerConnection } from "../shared/server-config.js";

interface WorkflowsScreenState {
  serverUrl: string;
  authToken: string;
  sessionId: string;
  skillQuestion: string;
  workflowQuestion: string;
  manualReview: boolean;
  reviewReason: string;
  latestRun: WorkbenchRunHistoryRecord | null;
  pendingAction: "connection" | "skill" | "workflow" | "approve" | "deny" | null;
  errorMessage: string | null;
  noticeMessage: string | null;
}

export class WorkflowsScreen extends Component<ComponentProps, WorkflowsScreenState> {
  private readonly historyStore = createWorkbenchHistoryStore();

  constructor(props: ComponentProps = {}) {
    super(props);
    const connection = readServerConnection();
    const latestRun = this.historyStore.load().runs[0] ?? null;
    this.state = {
      serverUrl: connection.serverUrl,
      authToken: connection.authToken,
      sessionId: createSessionId(),
      skillQuestion: "What does Iteronix include?",
      workflowQuestion: "What is the current AI workbench architecture?",
      manualReview: true,
      reviewReason: "",
      latestRun,
      pendingAction: null,
      errorMessage: null,
      noticeMessage: null
    };
  }

  override render(): HTMLElement {
    return createElement("div", {
      className: "mx-auto flex w-full max-w-[1480px] flex-col gap-6 p-6"
    }, [
      createElement("div", { className: "flex flex-col gap-2" }, [
        createElement("h1", { className: "text-3xl font-semibold text-white" }, ["AI Workbench"]),
        createElement("p", { className: "max-w-3xl text-sm leading-6 text-text-secondary" }, [
          "Run the example skill, send a workflow through planner, retriever, executor and reviewer, and keep the resulting evidence grounded and inspectable."
        ])
      ]),
      this.renderMessages(),
      createElement("div", { className: "grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]" }, [
        createElement("div", { className: "flex flex-col gap-6" }, [
          this.renderConnectionPanel(),
          this.renderSkillPanel(),
          this.renderWorkflowPanel()
        ]),
        createElement("div", { className: "flex flex-col gap-6" }, [
          this.renderLatestRunPanel(),
          this.renderEvidencePanel()
        ])
      ])
    ]);
  }

  private renderMessages(): HTMLElement {
    const { errorMessage, noticeMessage } = this.state;

    if (!errorMessage && !noticeMessage) {
      return createElement("div", {});
    }

    return createElement("div", { className: "flex flex-col gap-3" }, [
      errorMessage
        ? createElement("div", {
            className: "rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          }, [errorMessage])
        : "",
      noticeMessage
        ? createElement("div", {
            className: "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          }, [noticeMessage])
        : ""
    ]);
  }

  private renderConnectionPanel(): HTMLElement {
    return createElement(SectionPanel, {
      title: "Connection",
      subtitle: "The workbench uses the same bearer token and base URL stored for the rest of the UI.",
      actions: createElement(Button, {
        variant: "secondary",
        size: "sm",
        disabled: this.state.pendingAction === "connection",
        onClick: () => {
          void this.handleSaveConnection();
        },
        children: this.state.pendingAction === "connection" ? "Saving" : "Save"
      }),
      children: createElement("div", { className: "flex flex-col gap-4" }, [
        renderInputField({
          label: "Server URL",
          value: this.state.serverUrl,
          placeholder: "http://localhost:4000",
          testId: "workbench-server-url",
          onChange: (value) => this.setState({ serverUrl: value })
        }),
        renderInputField({
          label: "Bearer token",
          value: this.state.authToken,
          placeholder: "dev-token",
          testId: "workbench-auth-token",
          type: "password",
          onChange: (value) => this.setState({ authToken: value })
        }),
        renderInputField({
          label: "Session ID",
          value: this.state.sessionId,
          placeholder: "workbench-session",
          testId: "workbench-session-id",
          onChange: (value) => this.setState({ sessionId: value })
        }),
        createElement("div", { className: "flex gap-3" }, [
          createElement(Button, {
            variant: "ghost",
            size: "sm",
            onClick: () => this.setState({
              sessionId: createSessionId(),
              noticeMessage: "New session prepared.",
              errorMessage: null
            }),
            children: "New session"
          }),
          createElement("span", { className: "self-center text-xs text-text-secondary" }, [
            "Use one session across multiple runs to surface working and episodic memory."
          ])
        ])
      ])
    });
  }

  private renderSkillPanel(): HTMLElement {
    return createElement(SectionPanel, {
      title: "Example skill",
      subtitle: "Runs /skills/example-skill against the current repository and stores the response in local history.",
      actions: createElement(Button, {
        variant: "primary",
        size: "sm",
        disabled: this.state.pendingAction === "skill",
        onClick: () => {
          void this.handleRunSkill();
        },
        className: "min-w-[128px]",
        children: this.state.pendingAction === "skill" ? "Running" : "Run skill"
      }),
      children: createElement("div", { className: "flex flex-col gap-4" }, [
        renderInputField({
          label: "Question",
          value: this.state.skillQuestion,
          placeholder: "What does Iteronix include?",
          testId: "workbench-skill-question",
          onChange: (value) => this.setState({ skillQuestion: value })
        }),
        createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3 text-sm text-text-secondary" }, [
          createElement("p", { className: "text-white" }, [WorkbenchSkillName]),
          createElement("p", { className: "mt-1 leading-6" }, [
            "The response is validated, grounded with citations when retrieval is used, and written back as working plus episodic memory."
          ])
        ])
      ])
    });
  }

  private renderWorkflowPanel(): HTMLElement {
    return createElement(SectionPanel, {
      title: "Planner → reviewer workflow",
      subtitle: "Launches the multi-agent flow using the same skill and either stops at reviewer approval or auto-completes.",
      actions: createElement(Button, {
        variant: "primary",
        size: "sm",
        disabled: this.state.pendingAction === "workflow",
        onClick: () => {
          void this.handleRunWorkflow();
        },
        className: "min-w-[152px]",
        children: this.state.pendingAction === "workflow" ? "Launching" : "Launch workflow"
      }),
      children: createElement("div", { className: "flex flex-col gap-4" }, [
        renderInputField({
          label: "Workflow question",
          value: this.state.workflowQuestion,
          placeholder: "What is the current AI workbench architecture?",
          testId: "workbench-workflow-question",
          onChange: (value) => this.setState({ workflowQuestion: value })
        }),
        createElement("label", {
          className: "flex items-start gap-3 rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3 text-sm text-text-secondary"
        }, [
          createElement("input", {
            type: "checkbox",
            checked: this.state.manualReview,
            onChange: (event: Event) => {
              const target = event.target;
              if (target instanceof HTMLInputElement) {
                this.setState({ manualReview: target.checked });
              }
            }
          }),
          createElement("div", { className: "flex flex-col gap-1" }, [
            createElement("span", { className: "font-medium text-white" }, ["Stop at reviewer checkpoint"]),
            createElement("span", {}, [
              "Checked means the workflow pauses at the reviewer stage so the user can approve or deny the action in the UI."
            ])
          ])
        ])
      ])
    });
  }

  private renderLatestRunPanel(): HTMLElement {
    const latestRun = this.state.latestRun;
    if (!latestRun) {
      return createElement(EmptyStatePanel, {
        icon: "smart_toy",
        title: "No runs yet",
        description: "Run the example skill or launch the workflow to populate this panel with answer text, citations, evidence and session memory."
      });
    }

    const finalResult = readFinalResult(latestRun);
    const awaitingReview = latestRun.kind === "workflow" && latestRun.status === "awaiting_approval";
    const review = latestRun.kind === "workflow" ? latestRun.review : undefined;

    return createElement(SectionPanel, {
      title: latestRun.kind === "skill" ? "Latest skill result" : "Latest workflow result",
      subtitle: `${latestRun.skillName} • ${latestRun.sessionId}`,
      actions: createElement(ConfidenceBadge, {
        confidence: finalResult.confidence
      }),
      children: createElement("div", { className: "flex flex-col gap-5" }, [
        createElement("div", { className: "grid gap-3 md:grid-cols-3" }, [
          renderMetaCell("Status", latestRun.status.replace(/_/g, " ")),
          renderMetaCell("Trace", finalResult.traceId.slice(0, 8)),
          renderMetaCell("Updated", formatTimestamp(latestRun.updatedAt))
        ]),
        createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4" }, [
          createElement("p", { className: "text-xs uppercase tracking-wide text-text-secondary" }, ["Answer"]),
          createElement("p", { className: "mt-2 text-sm leading-7 text-white" }, [finalResult.output.answer])
        ]),
        latestRun.kind === "workflow"
          ? createElement("div", { className: "flex flex-col gap-3" }, [
              createElement("h3", { className: "text-sm font-semibold text-white" }, ["Workflow stages"]),
              createElement(WorkflowStepsList, {
                steps: latestRun.result.steps
              })
            ])
          : "",
        createElement("div", { className: "grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]" }, [
          createElement(CitationsList, {
            citations: finalResult.citations,
            evidenceSources: finalResult.evidenceReport.retrievedSources
          }),
          createElement(SectionPanel, {
            title: "Session memory",
            subtitle: "Top working and episodic items for this session.",
            className: "h-full",
            children: createElement(MemoryList, {
              items: latestRun.memory
            })
          })
        ]),
        awaitingReview ? this.renderReviewerActions(latestRun) : "",
        review
          ? createElement("div", {
              className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4"
            }, [
              createElement("div", { className: "flex items-center justify-between gap-3" }, [
                createElement("p", { className: "text-sm font-semibold text-white" }, ["Reviewer decision"]),
                createElement("span", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [review.decision])
              ]),
              createElement("p", { className: "mt-2 text-sm leading-6 text-text-secondary" }, [review.reason]),
              createElement("p", { className: "mt-2 text-xs text-text-secondary" }, [formatTimestamp(review.decidedAt)])
            ])
          : ""
      ])
    });
  }

  private renderReviewerActions(run: WorkbenchRunHistoryRecord): HTMLElement {
    const summary = run.kind === "workflow" ? run.result.checkpoint?.summary : undefined;

    return createElement(SectionPanel, {
      title: "Reviewer checkpoint",
      subtitle: summary ?? "A manual reviewer action is required.",
      actions: createElement("span", { className: "text-xs uppercase tracking-wide text-amber-300" }, ["Awaiting review"]),
      children: createElement("div", { className: "flex flex-col gap-4" }, [
        renderInputField({
          label: "Reviewer note",
          value: this.state.reviewReason,
          placeholder: "Grounded answer. Safe to continue.",
          testId: "workbench-review-reason",
          onChange: (value) => this.setState({ reviewReason: value })
        }),
        createElement("div", { className: "flex flex-wrap gap-3" }, [
          createElement(Button, {
            variant: "primary",
            size: "sm",
            disabled: this.state.pendingAction === "approve",
            onClick: () => {
              void this.handleApproveWorkflow();
            },
            className: "min-w-[144px]",
            children: this.state.pendingAction === "approve" ? "Approving" : "Approve and continue"
          }),
          createElement(Button, {
            variant: "danger",
            size: "sm",
            disabled: this.state.pendingAction === "deny",
            onClick: () => this.handleDenyWorkflow(),
            className: "min-w-[128px]",
            children: this.state.pendingAction === "deny" ? "Saving" : "Request changes"
          })
        ])
      ])
    });
  }

  private renderEvidencePanel(): HTMLElement {
    const latestRun = this.state.latestRun;
    if (!latestRun) {
      return createElement(EmptyStatePanel, {
        icon: "fact_check",
        title: "Evidence will appear here",
        description: "Every successful run produces a confidence score, decisions, retrieved sources and usage telemetry."
      });
    }

    return createElement(SectionPanel, {
      title: "Evidence report",
      subtitle: `Trace ${readFinalResult(latestRun).traceId}`,
      children: createElement(EvidenceReportPanel, {
        report: readFinalResult(latestRun).evidenceReport
      })
    });
  }

  private async handleSaveConnection(): Promise<void> {
    this.setState({ pendingAction: "connection", errorMessage: null, noticeMessage: null });

    try {
      const connection = writeServerConnection({
        serverUrl: this.state.serverUrl,
        authToken: this.state.authToken
      });
      this.setState({
        serverUrl: connection.serverUrl,
        authToken: connection.authToken,
        pendingAction: null,
        noticeMessage: "Connection saved.",
        errorMessage: null
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: error instanceof Error ? error.message : "Could not save connection.",
        noticeMessage: null
      });
    }
  }

  private async handleRunSkill(): Promise<void> {
    if (!this.state.skillQuestion.trim()) {
      this.setState({ errorMessage: "A question is required for the example skill.", noticeMessage: null });
      return;
    }

    this.persistConnection();
    this.setState({ pendingAction: "skill", errorMessage: null, noticeMessage: null });

    try {
      const client = createWorkbenchClient();
      const question = this.state.skillQuestion.trim();
      const result = await client.runSkill({
        skillName: WorkbenchSkillName,
        sessionId: this.state.sessionId,
        question
      });
      const memory = await client.queryMemory({
        sessionId: this.state.sessionId,
        query: question,
        limit: DefaultMemoryQueryLimit
      });
      const record = this.historyStore.saveSkillRun({
        skillName: WorkbenchSkillName,
        sessionId: this.state.sessionId,
        question,
        result,
        memory
      });
      this.setState({
        latestRun: record,
        pendingAction: null,
        noticeMessage: "Skill run completed and stored in History.",
        errorMessage: null,
        reviewReason: ""
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: error instanceof Error ? error.message : "Skill execution failed.",
        noticeMessage: null
      });
    }
  }

  private async handleRunWorkflow(): Promise<void> {
    if (!this.state.workflowQuestion.trim()) {
      this.setState({ errorMessage: "A question is required for the workflow.", noticeMessage: null });
      return;
    }

    this.persistConnection();
    this.setState({ pendingAction: "workflow", errorMessage: null, noticeMessage: null });

    try {
      const client = createWorkbenchClient();
      const question = this.state.workflowQuestion.trim();
      const result = await client.runWorkflow({
        skillName: WorkbenchSkillName,
        sessionId: this.state.sessionId,
        question,
        autoApprove: !this.state.manualReview
      });
      const memory = await client.queryMemory({
        sessionId: this.state.sessionId,
        query: question,
        limit: DefaultMemoryQueryLimit
      });
      const record = this.historyStore.saveWorkflowRun({
        skillName: WorkbenchSkillName,
        sessionId: this.state.sessionId,
        question,
        result,
        memory
      });
      this.setState({
        latestRun: record,
        pendingAction: null,
        noticeMessage:
          result.status === "awaiting_approval"
            ? "Workflow paused at reviewer checkpoint."
            : "Workflow completed and stored in History.",
        errorMessage: null,
        reviewReason: ""
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: error instanceof Error ? error.message : "Workflow execution failed.",
        noticeMessage: null
      });
    }
  }

  private async handleApproveWorkflow(): Promise<void> {
    const latestRun = this.state.latestRun;
    if (!latestRun || latestRun.kind !== "workflow" || latestRun.status !== "awaiting_approval") {
      return;
    }

    this.persistConnection();
    this.setState({ pendingAction: "approve", errorMessage: null, noticeMessage: null });

    try {
      const client = createWorkbenchClient();
      const result = await client.runWorkflow({
        skillName: WorkbenchSkillName,
        sessionId: latestRun.sessionId,
        question: latestRun.question,
        autoApprove: true
      });
      const approvedRecord = this.historyStore.applyWorkflowReviewDecision({
        runId: latestRun.id,
        decision: ReviewerDecision.Approved,
        reason: this.state.reviewReason.trim() || "Approved in the workbench UI.",
        replacementResult: result
      });
      this.setState({
        latestRun: approvedRecord,
        pendingAction: null,
        noticeMessage: "Workflow approved and completed.",
        errorMessage: null,
        reviewReason: ""
      });
    } catch (error) {
      this.setState({
        pendingAction: null,
        errorMessage: error instanceof Error ? error.message : "Could not approve the workflow.",
        noticeMessage: null
      });
    }
  }

  private handleDenyWorkflow(): void {
    const latestRun = this.state.latestRun;
    if (!latestRun || latestRun.kind !== "workflow" || latestRun.status !== "awaiting_approval") {
      return;
    }

    const deniedRecord = this.historyStore.applyWorkflowReviewDecision({
      runId: latestRun.id,
      decision: ReviewerDecision.Denied,
      reason: this.state.reviewReason.trim() || "Changes requested from the reviewer checkpoint."
    });
    this.setState({
      latestRun: deniedRecord,
      pendingAction: null,
      noticeMessage: "Workflow marked as denied.",
      errorMessage: null,
      reviewReason: ""
    });
  }

  private persistConnection(): void {
    const connection = writeServerConnection({
      serverUrl: this.state.serverUrl,
      authToken: this.state.authToken
    });

    this.setState({
      serverUrl: connection.serverUrl,
      authToken: connection.authToken
    });
  }
}

const renderInputField = (input: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  testId: string;
}): HTMLElement =>
  createElement("label", { className: "flex flex-col gap-2" }, [
    createElement("span", { className: "text-sm font-medium text-white" }, [input.label]),
    createElement("input", {
      type: input.type ?? "text",
      value: input.value,
      placeholder: input.placeholder,
      className: "h-11 rounded-lg border border-border-dark bg-background-dark/40 px-3 text-sm text-white placeholder-text-secondary focus:border-primary focus:outline-none",
      dataset: {
        testid: input.testId
      },
      onChange: (event: Event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
          input.onChange(target.value);
        }
      }
    })
  ]);

const renderMetaCell = (label: string, value: string): HTMLElement =>
  createElement("div", { className: "rounded-lg border border-border-dark bg-background-dark/40 px-3 py-3" }, [
    createElement("p", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [label]),
    createElement("p", { className: "mt-2 text-sm font-medium text-white" }, [value])
  ]);

const readFinalResult = (
  run: WorkbenchRunHistoryRecord
): SkillRunResponse =>
  run.kind === "skill" ? run.result : run.result.final;

const createSessionId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `session-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `session-${Date.now().toString(36)}`;
};

const formatTimestamp = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};
