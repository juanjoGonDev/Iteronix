import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/EmptyStatePanel.js";
import {
  AssetConfirmDialog,
  AssetEditorDialog,
  AssetRow,
  AssetRowList,
} from "../components/AssetWorkbench.js";
import {
  PageFrame,
  PageIntro,
  PageNoticeStack,
} from "../components/PageScaffold.js";
import {
  SettingsTextField,
  SettingsTextareaField,
} from "../components/SettingsFields.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";
import {
  appendPromptAssetVersion,
  createPromptAssetRecord,
  createPromptAssetsClient,
  formatPromptVariableDefinitions,
  parsePromptVariableDefinitions,
  selectPromptAssetVersion,
  type PromptAssetSummary,
  type PromptAssetUsageSummary,
} from "../shared/prompt-assets-client.js";
import {
  PromptAssetsUrlMode,
  applyPromptAssetsUrlPatch,
  readPromptAssetsUrlState,
  type PromptAssetsUrlState,
} from "./prompt-assets-url-state.js";

const PromptAssetsSelector = {
  Root: "prompt-assets-root",
  Create: "prompt-assets-create",
  Reload: "prompt-assets-reload",
  List: "prompt-assets-list",
  Error: "prompt-assets-error",
  Retry: "prompt-assets-retry",
  RowPrefix: "prompt-assets-row-",
  Editor: "prompt-assets-editor",
  EditorName: "prompt-assets-editor-name",
  EditorTemplate: "prompt-assets-editor-template",
  EditorVariables: "prompt-assets-editor-variables",
  EditorSave: "prompt-assets-editor-save",
  DeletePrefix: "prompt-assets-delete-",
  UsagePrefix: "prompt-assets-usage-",
  DeleteDialog: "prompt-assets-delete-dialog",
  DeleteConfirm: "prompt-assets-delete-confirm",
  DeleteCancel: "prompt-assets-delete-cancel",
  EditorClose: "prompt-assets-editor-close",
} as const;

type PromptAssetsState = {
  prompts: ReadonlyArray<PromptAssetSummary>;
  loading: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  url: PromptAssetsUrlState;
  draftName: string;
  draftTemplate: string;
  draftVariables: string;
  usageByPromptId: Readonly<Record<string, PromptAssetUsageSummary>>;
  busy: boolean;
};

type PromptAssetsEditorDraft = {
  draftName: string;
  draftTemplate: string;
  draftVariables: string;
};

export const selectPromptAssetsNavigationState = (input: {
  prompts: ReadonlyArray<PromptAssetSummary>;
  url: PromptAssetsUrlState;
}): PromptAssetsEditorDraft => {
  const selected = input.url.promptId
    ? input.prompts.find((prompt) => prompt.id === input.url.promptId)
    : undefined;
  const selectedVersion = selectPromptAssetVersion(selected, input.url.version);
  return {
    draftName: selected?.name ?? "",
    draftTemplate: selectedVersion?.template ?? "",
    draftVariables: formatPromptVariableDefinitions(
      selectedVersion?.variables ?? [],
    ),
  };
};

export class PromptAssetsScreen extends Component<
  ComponentProps,
  PromptAssetsState
> {
  private readonly client = createPromptAssetsClient();

  constructor(props: ComponentProps = {}) {
    const url = readPromptAssetsUrlState(window.location.href);
    super(props, {
      prompts: [],
      loading: true,
      errorMessage: null,
      noticeMessage: null,
      url,
      draftName: "",
      draftTemplate: "",
      draftVariables: "",
      usageByPromptId: {},
      busy: false,
    });
  }

  override onMount(): void {
    window.addEventListener("popstate", this.handleBrowserNavigation);
    window.addEventListener("keydown", this.handleKeyboardShortcut);
    void this.loadPrompts();
  }

  override onUnmount(): void {
    window.removeEventListener("popstate", this.handleBrowserNavigation);
    window.removeEventListener("keydown", this.handleKeyboardShortcut);
  }

  override render(): HTMLElement {
    return createElement(
      "main",
      {
        className: "min-h-full text-white",
        "data-testid": PromptAssetsSelector.Root,
      },
      [
        createElement(
          PageFrame,
          { className: "max-w-[1380px] gap-7 pb-28 md:pb-10" },
          [
            createElement(PageNoticeStack, {
              errorMessage: this.state.errorMessage,
              noticeMessage: this.state.noticeMessage,
            }),
            this.renderIntro(),
            this.renderContent(),
            this.renderEditor(),
            this.renderDeleteConfirmation(),
          ],
        ),
      ],
    );
  }

  private renderIntro(): HTMLElement {
    return createElement(PageIntro, {
      title: "Prompt assets",
      description: `Reusable, version-pinned prompt templates for workflows. ${this.state.prompts.length} available.`,
      actions: createElement("div", { className: "flex flex-wrap gap-2" }, [
        createElement(Button, {
          variant: "ghost",
          size: "sm",
          icon: "refresh",
          children: "Reload",
          onClick: () => {
            void this.loadPrompts();
          },
          dataset: { testid: PromptAssetsSelector.Reload },
        }),
        createElement(Button, {
          variant: "primary",
          size: "sm",
          icon: "add",
          children: "Create prompt",
          onClick: () =>
            this.openEditor({
              mode: PromptAssetsUrlMode.Create,
              promptId: null,
              version: null,
            }),
          dataset: { testid: PromptAssetsSelector.Create },
        }),
      ]),
    });
  }

  private renderContent(): HTMLElement {
    if (this.state.loading) {
      return createElement(
        "section",
        {
          className:
            "rounded-2xl border border-[#202832] bg-[#171c22] px-6 py-10 text-sm text-text-secondary",
          "aria-busy": "true",
        },
        ["Loading prompt assets…"],
      );
    }

    if (this.state.errorMessage) {
      return createElement(
        "section",
        {
          className:
            "flex flex-col items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-6 py-6 sm:flex-row sm:items-center sm:justify-between",
          role: "alert",
          "data-testid": PromptAssetsSelector.Error,
        },
        [
          createElement("div", { className: "flex min-w-0 flex-col gap-1" }, [
            createElement(
              "p",
              { className: "text-sm font-semibold text-rose-100" },
              ["Could not load prompt assets"],
            ),
            createElement("p", { className: "text-sm text-rose-100/80" }, [
              this.state.errorMessage,
            ]),
          ]),
          createElement(Button, {
            variant: "secondary",
            size: "sm",
            icon: "refresh",
            children: "Retry",
            onClick: () => {
              void this.loadPrompts();
            },
            dataset: { testid: PromptAssetsSelector.Retry },
          }),
        ],
      );
    }

    if (this.state.prompts.length === 0) {
      return createElement(EmptyStatePanel, {
        icon: "chat",
        title: "No prompt assets yet",
        description:
          "Create a reusable prompt, then pin a version from a workflow node.",
        action: createElement(Button, {
          variant: "primary",
          size: "sm",
          icon: "add",
          children: "Create prompt",
          onClick: () =>
            this.openEditor({
              mode: PromptAssetsUrlMode.Create,
              promptId: null,
              version: null,
            }),
        }),
      });
    }

    return createElement(AssetRowList, {
      testId: PromptAssetsSelector.List,
      rows: this.state.prompts.map((prompt) => this.renderPromptRow(prompt)),
    });
  }

  private renderPromptRow(prompt: PromptAssetSummary): HTMLElement {
    return createElement(AssetRow, {
      testId: `${PromptAssetsSelector.RowPrefix}${prompt.id}`,
      icon: "chat",
      title: prompt.name,
      subtitle: prompt.id,
      status: prompt.status,
      meta: [
        `Version ${prompt.activeVersion} · ${prompt.versions.length} immutable versions`,
      ],
      chips: prompt.variables.map(
        (variable) => `${variable.name}:${variable.schema.schema.type}`,
      ),
      extra: createElement("div", {}, [
        this.renderUsageSummary(prompt),
        this.renderUsageLinks(prompt),
      ]),
      actions: [
        {
          label: "Open editor",
          icon: "edit",
          variant: "secondary",
          onClick: () =>
            this.openEditor({
              mode: PromptAssetsUrlMode.Edit,
              promptId: prompt.id,
              version: prompt.activeVersion,
            }),
        },
        {
          label: "Delete",
          icon: "delete",
          variant: "danger",
          testId: `${PromptAssetsSelector.DeletePrefix}${prompt.id}`,
          onClick: () => {
            this.openDeleteConfirmation(prompt);
          },
        },
      ],
    });
  }

  private renderUsageSummary(prompt: PromptAssetSummary): HTMLElement {
    const usage = this.state.usageByPromptId[prompt.id];
    const summary = usage
      ? `${usage.workflowCount} workflow${usage.workflowCount === 1 ? "" : "s"} · ${usage.nodeCount} node${usage.nodeCount === 1 ? "" : "s"}`
      : "Usage unavailable";
    return createElement(
      "p",
      {
        className: "mt-1 text-xs text-text-secondary",
        "data-testid": `${PromptAssetsSelector.UsagePrefix}${prompt.id}`,
      },
      [summary],
    );
  }

  private renderUsageLinks(prompt: PromptAssetSummary): HTMLElement | string {
    const usage = this.state.usageByPromptId[prompt.id];
    if (!usage || usage.nodeCount === 0) return "";
    return createElement(
      "ul",
      { className: "mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" },
      usage.usages.map((item) =>
        createElement("li", {}, [
          createElement(
            "a",
            {
              href: createWorkflowNodeHref(item.workflowId, item.nodeId),
              className:
                "text-primary underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-primary",
            },
            [
              `${item.workflowName} / ${item.nodeLabel} · v${item.promptVersion}`,
            ],
          ),
        ]),
      ),
    );
  }

  private renderDeleteConfirmation(): HTMLElement | string {
    if (
      this.state.url.mode !== PromptAssetsUrlMode.Delete ||
      !this.state.url.promptId
    ) {
      return "";
    }
    const prompt = this.state.prompts.find(
      (candidate) => candidate.id === this.state.url.promptId,
    );
    if (!prompt) return "";
    const usage = this.state.usageByPromptId[prompt.id];
    const hasUsages = (usage?.nodeCount ?? 0) > 0;
    return createElement(
      AssetConfirmDialog,
      {
        testId: PromptAssetsSelector.DeleteDialog,
        title: hasUsages
          ? "Delete prompt with workflow impact"
          : "Delete prompt asset",
        message: hasUsages
          ? `This deletes ${prompt.name} without changing ${usage?.workflowCount ?? 0} workflow(s) or ${usage?.nodeCount ?? 0} node(s).`
          : "This prompt is not referenced by any persisted workflow node.",
        confirmLabel: "Delete prompt",
        confirmTestId: PromptAssetsSelector.DeleteConfirm,
        confirmDisabled: this.state.busy,
        onConfirm: () => void this.deletePrompt(prompt, usage),
        cancelLabel: "Cancel",
        cancelTestId: PromptAssetsSelector.DeleteCancel,
        onCancel: () => this.closeDeleteConfirmation(),
      },
      [
        hasUsages && usage
          ? createElement(
              "ul",
              {
                className:
                  "max-h-48 space-y-2 overflow-auto border-y border-border-dark py-3 text-sm",
              },
              usage.usages.map((item) =>
                createElement("li", {}, [
                  createElement(
                    "a",
                    {
                      href: createWorkflowNodeHref(
                        item.workflowId,
                        item.nodeId,
                      ),
                      className:
                        "text-primary underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-primary",
                    },
                    [
                      `${item.workflowName} / ${item.nodeLabel} · v${item.promptVersion}`,
                    ],
                  ),
                ]),
              ),
            )
          : null,
      ],
    );
  }

  private renderEditor(): HTMLElement | string {
    if (
      this.state.url.mode === PromptAssetsUrlMode.Catalog ||
      this.state.url.mode === PromptAssetsUrlMode.Delete
    ) {
      return "";
    }

    const isCreate = this.state.url.mode === PromptAssetsUrlMode.Create;
    const saveDisabled =
      this.state.busy ||
      this.state.draftName.trim().length === 0 ||
      this.state.draftTemplate.trim().length === 0;
    return createElement(AssetEditorDialog, {
      testId: PromptAssetsSelector.Editor,
      title: isCreate
        ? "Create prompt asset"
        : `Edit prompt ${this.state.url.promptId ?? ""}`,
      description:
        "Prompt content is versioned. Saving always creates a new immutable version; workflow nodes pin versions explicitly.",
      closeTestId: PromptAssetsSelector.EditorClose,
      onClose: () =>
        this.openEditor({
          mode: PromptAssetsUrlMode.Catalog,
          promptId: null,
          version: null,
        }),
      save: {
        label: "Save version",
        testId: PromptAssetsSelector.EditorSave,
        disabled: saveDisabled,
        disabledReason: "Name and template are required to save a version.",
        onClick: () => {
          void this.savePrompt();
        },
      },
      children: createElement("div", { className: "grid gap-4" }, [
        createElement(SettingsTextField, {
          label: "Name",
          value: this.state.draftName,
          placeholder: "Support triage instruction",
          testId: PromptAssetsSelector.EditorName,
          onChange: (value: string) => this.setState({ draftName: value }),
        }),
        createElement(SettingsTextareaField, {
          label:
            "Variables (name:type:required or name:type:optional, one per line)",
          value: this.state.draftVariables,
          placeholder: "issue:object:required",
          testId: PromptAssetsSelector.EditorVariables,
          hint: "Workflow node bindings must satisfy these typed variables before the prompt can run.",
          onChange: (value: string) => this.setState({ draftVariables: value }),
        }),
        createElement(SettingsTextareaField, {
          label: "Template",
          value: this.state.draftTemplate,
          placeholder: "Triage the issue {{issue}} and answer in {{language}}.",
          testId: PromptAssetsSelector.EditorTemplate,
          rows: 10,
          hint: "Use {{variable}} placeholders; unknown placeholders are rejected at run time.",
          onChange: (value: string) => this.setState({ draftTemplate: value }),
        }),
      ]),
    });
  }

  private async loadPrompts(): Promise<void> {
    this.setState({ loading: true, errorMessage: null });
    try {
      const prompts = await this.client.list();
      const usageEntries = await Promise.all(
        prompts.map(
          async (prompt) =>
            [prompt.id, await this.client.usage(prompt.id)] as const,
        ),
      );
      const selected = this.state.url.promptId
        ? prompts.find((prompt) => prompt.id === this.state.url.promptId)
        : undefined;
      const selectedVersion = selectPromptAssetVersion(
        selected,
        this.state.url.version,
      );
      this.setState({
        prompts,
        loading: false,
        usageByPromptId: Object.fromEntries(usageEntries),
        draftName: selected?.name ?? this.state.draftName,
        draftTemplate: selectedVersion?.template ?? this.state.draftTemplate,
        draftVariables: selectedVersion
          ? formatPromptVariableDefinitions(selectedVersion.variables)
          : this.state.draftVariables,
      });
    } catch (error) {
      this.setState({ loading: false, errorMessage: readErrorMessage(error) });
    }
  }

  private openEditor(url: PromptAssetsUrlState): void {
    const nextUrl = applyPromptAssetsUrlPatch(window.location.href, url);
    window.history.pushState({}, "", nextUrl);
    const draft = selectPromptAssetsNavigationState({
      prompts: this.state.prompts,
      url,
    });
    this.setState({
      url,
      ...draft,
    });
  }

  private readonly handleBrowserNavigation = (): void => {
    const url = readPromptAssetsUrlState(window.location.href);
    const draft = selectPromptAssetsNavigationState({
      prompts: this.state.prompts,
      url,
    });
    this.setState({ url, ...draft });
    if (url.mode === PromptAssetsUrlMode.Delete && url.promptId) {
      void this.loadPromptUsage(url.promptId);
    }
  };

  private readonly handleKeyboardShortcut = (event: KeyboardEvent): void => {
    if (
      event.key === "Escape" &&
      this.state.url.mode === PromptAssetsUrlMode.Delete
    ) {
      this.closeDeleteConfirmation();
    }
  };

  private async savePrompt(): Promise<void> {
    const name = this.state.draftName.trim();
    const template = this.state.draftTemplate.trim();
    if (!name || !template) return;
    this.setState({ busy: true });
    const selected = this.state.url.promptId
      ? this.state.prompts.find(
          (prompt) => prompt.id === this.state.url.promptId,
        )
      : undefined;
    const now = new Date().toISOString();
    try {
      const variables = parsePromptVariableDefinitions(
        this.state.draftVariables,
      );
      const asset = await this.client.upsert(
        selected
          ? appendPromptAssetVersion({
              asset: selected,
              name,
              template,
              variables,
              now,
            })
          : createPromptAssetRecord({
              id: crypto.randomUUID(),
              name,
              template,
              variables,
              now,
            }),
      );
      this.setState({
        prompts: [
          ...this.state.prompts.filter((prompt) => prompt.id !== asset.id),
          asset,
        ],
        busy: false,
        noticeMessage: `Prompt "${asset.name}" saved as version ${asset.activeVersion}.`,
      });
      this.openEditor({
        mode: PromptAssetsUrlMode.Edit,
        promptId: asset.id,
        version: asset.activeVersion,
      });
    } catch (error) {
      this.setState({ busy: false, errorMessage: readErrorMessage(error) });
    }
  }

  private openDeleteConfirmation(prompt: PromptAssetSummary): void {
    this.openEditor({
      mode: PromptAssetsUrlMode.Delete,
      promptId: prompt.id,
      version: prompt.activeVersion,
    });
    void this.loadPromptUsage(prompt.id);
  }

  private closeDeleteConfirmation(): void {
    this.openEditor({
      mode: PromptAssetsUrlMode.Catalog,
      promptId: null,
      version: null,
    });
  }

  private async loadPromptUsage(promptId: string): Promise<void> {
    try {
      const usage = await this.client.usage(promptId);
      this.setState({
        usageByPromptId: { ...this.state.usageByPromptId, [promptId]: usage },
      });
    } catch (error) {
      this.setState({ errorMessage: readErrorMessage(error) });
    }
  }

  private async deletePrompt(
    prompt: PromptAssetSummary,
    usage: PromptAssetUsageSummary | undefined,
  ): Promise<void> {
    this.setState({ busy: true });
    try {
      await this.client.delete({
        assetId: prompt.id,
        ...(usage?.nodeCount
          ? { usageFingerprint: usage.fingerprint, confirmImpact: true }
          : {}),
      });
      this.setState({
        prompts: this.state.prompts.filter(
          (candidate) => candidate.id !== prompt.id,
        ),
        busy: false,
        noticeMessage: `Prompt "${prompt.name}" deleted.`,
      });
      if (this.state.url.promptId === prompt.id) {
        this.closeDeleteConfirmation();
      }
    } catch (error) {
      this.setState({ busy: false, errorMessage: readErrorMessage(error) });
    }
  }
}

const readErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not load prompt assets.";

const createWorkflowNodeHref = (workflowId: string, nodeId: string): string =>
  `/workflows/${encodeURIComponent(workflowId)}?panel=nodes&modal=node-editor&node=${encodeURIComponent(nodeId)}`;
