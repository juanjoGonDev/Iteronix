import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/EmptyStatePanel.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";
import {
  appendPromptAssetVersion,
  createPromptAssetRecord,
  createPromptAssetsClient,
  type PromptAssetSummary,
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
  RowPrefix: "prompt-assets-row-",
  Editor: "prompt-assets-editor",
  EditorName: "prompt-assets-editor-name",
  EditorTemplate: "prompt-assets-editor-template",
  EditorSave: "prompt-assets-editor-save",
  DeletePrefix: "prompt-assets-delete-",
  EditorClose: "prompt-assets-editor-close",
} as const;

type PromptAssetsState = {
  prompts: ReadonlyArray<PromptAssetSummary>;
  loading: boolean;
  errorMessage: string | null;
  url: PromptAssetsUrlState;
  draftName: string;
  draftTemplate: string;
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
      url,
      draftName: "",
      draftTemplate: "",
    });
  }

  override onMount(): void {
    window.addEventListener("popstate", this.handleBrowserNavigation);
    void this.loadPrompts();
  }

  override onUnmount(): void {
    window.removeEventListener("popstate", this.handleBrowserNavigation);
  }

  override render(): HTMLElement {
    return createElement(
      "main",
      {
        className:
          "min-h-full bg-[#11161d] px-4 py-5 text-white sm:px-6 lg:px-8",
        "data-testid": PromptAssetsSelector.Root,
      },
      [
        createElement(
          "div",
          { className: "mx-auto flex max-w-6xl flex-col gap-5" },
          [this.renderToolbar(), this.renderContent(), this.renderEditor()],
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
            ["Prompt assets"],
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-text-secondary" },
            ["Reusable, version-pinned prompt templates for workflows."],
          ),
        ]),
        createElement("div", { className: "flex flex-wrap gap-2" }, [
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
      ],
    );
  }

  private renderContent(): HTMLElement {
    if (this.state.loading) {
      return createElement(
        "p",
        {
          className:
            "border border-border-dark bg-[#151b22] px-4 py-8 text-sm text-text-secondary",
        },
        ["Loading prompt assets…"],
      );
    }

    if (this.state.errorMessage) {
      return createElement(
        "div",
        { className: "border border-rose-500/40 bg-rose-500/10 px-4 py-4" },
        [
          createElement("p", { className: "text-sm text-rose-100" }, [
            this.state.errorMessage,
          ]),
        ],
      );
    }

    if (this.state.prompts.length === 0) {
      return createElement(EmptyStatePanel, {
        icon: "chat",
        title: "No prompt assets yet",
        description:
          "Create a reusable prompt, then pin a version from a workflow node.",
      });
    }

    return createElement(
      "section",
      { className: "divide-y divide-border-dark border border-border-dark" },
      this.state.prompts.map((prompt) => this.renderPromptRow(prompt)),
    );
  }

  private renderPromptRow(prompt: PromptAssetSummary): HTMLElement {
    return createElement(
      "article",
      {
        className:
          "flex flex-col gap-3 bg-[#11161d] px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
        "data-testid": `${PromptAssetsSelector.RowPrefix}${prompt.id}`,
      },
      [
        createElement("div", { className: "min-w-0" }, [
          createElement(
            "p",
            { className: "truncate text-sm font-semibold text-white" },
            [prompt.name],
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-text-secondary" },
            [`Version ${prompt.activeVersion} · ${prompt.status}`],
          ),
        ]),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          icon: "edit",
          children: "Open editor",
          onClick: () =>
            this.openEditor({
              mode: PromptAssetsUrlMode.Edit,
              promptId: prompt.id,
              version: prompt.activeVersion,
            }),
        }),
        createElement(Button, {
          variant: "danger",
          size: "sm",
          icon: "delete",
          children: "Delete",
          onClick: () => {
            void this.deletePrompt(prompt);
          },
          dataset: {
            testid: `${PromptAssetsSelector.DeletePrefix}${prompt.id}`,
          },
        }),
      ],
    );
  }

  private renderEditor(): HTMLElement | string {
    if (this.state.url.mode === PromptAssetsUrlMode.Catalog) {
      return "";
    }

    const title =
      this.state.url.mode === PromptAssetsUrlMode.Create
        ? "Create prompt asset"
        : `Edit prompt ${this.state.url.promptId ?? ""}`;
    return createElement(
      "section",
      {
        className:
          "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4",
        "data-testid": PromptAssetsSelector.Editor,
      },
      [
        createElement(
          "div",
          {
            className:
              "w-full max-w-2xl border border-border-dark bg-[#151b22] p-5 shadow-2xl",
          },
          [
            createElement(
              "h2",
              { className: "text-base font-semibold text-white" },
              [title],
            ),
            createElement(
              "p",
              { className: "mt-1 text-sm text-text-secondary" },
              [
                "Prompt content is versioned. Saving always creates a new immutable version.",
              ],
            ),
            createElement(
              "label",
              { className: "mt-4 block text-sm text-text-secondary" },
              [
                "Name",
                createElement("input", {
                  value: this.state.draftName,
                  className:
                    "mt-1 h-10 w-full border border-border-dark bg-[#0f151c] px-3 text-sm text-white outline-none focus:border-primary",
                  "data-testid": PromptAssetsSelector.EditorName,
                  onInput: (event: Event) => this.updateDraftName(event),
                }),
              ],
            ),
            createElement(
              "label",
              { className: "mt-4 block text-sm text-text-secondary" },
              [
                "Template",
                createElement("textarea", {
                  value: this.state.draftTemplate,
                  className:
                    "mt-1 min-h-40 w-full border border-border-dark bg-[#0f151c] px-3 py-2 font-mono text-sm text-white outline-none focus:border-primary",
                  "data-testid": PromptAssetsSelector.EditorTemplate,
                  onInput: (event: Event) => this.updateDraftTemplate(event),
                }),
              ],
            ),
            createElement("div", { className: "mt-5 flex justify-end gap-2" }, [
              createElement(Button, {
                variant: "ghost",
                size: "sm",
                children: "Close",
                onClick: () =>
                  this.openEditor({
                    mode: PromptAssetsUrlMode.Catalog,
                    promptId: null,
                    version: null,
                  }),
                dataset: { testid: PromptAssetsSelector.EditorClose },
              }),
              createElement(Button, {
                variant: "primary",
                size: "sm",
                disabled:
                  this.state.draftName.trim().length === 0 ||
                  this.state.draftTemplate.trim().length === 0,
                children: "Save version",
                onClick: () => {
                  void this.savePrompt();
                },
                dataset: { testid: PromptAssetsSelector.EditorSave },
              }),
            ]),
          ],
        ),
      ],
    );
  }

  private async loadPrompts(): Promise<void> {
    this.setState({ loading: true, errorMessage: null });
    try {
      const prompts = await this.client.list();
      this.setState({ prompts, loading: false });
    } catch (error) {
      this.setState({ loading: false, errorMessage: readErrorMessage(error) });
    }
  }

  private openEditor(url: PromptAssetsUrlState): void {
    const nextUrl = applyPromptAssetsUrlPatch(window.location.href, url);
    window.history.pushState({}, "", nextUrl);
    const selected = url.promptId
      ? this.state.prompts.find((prompt) => prompt.id === url.promptId)
      : undefined;
    this.setState({
      url,
      draftName: selected?.name ?? "",
      draftTemplate: selected?.template ?? "",
    });
  }

  private readonly handleBrowserNavigation = (): void => {
    this.setState({ url: readPromptAssetsUrlState(window.location.href) });
  };

  private updateDraftName(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.setState({ draftName: event.target.value });
    }
  }

  private updateDraftTemplate(event: Event): void {
    if (event.target instanceof HTMLTextAreaElement) {
      this.setState({ draftTemplate: event.target.value });
    }
  }

  private async savePrompt(): Promise<void> {
    const name = this.state.draftName.trim();
    const template = this.state.draftTemplate.trim();
    if (!name || !template) return;
    const selected = this.state.url.promptId
      ? this.state.prompts.find(
          (prompt) => prompt.id === this.state.url.promptId,
        )
      : undefined;
    const now = new Date().toISOString();
    try {
      const asset = await this.client.upsert(
        selected
          ? appendPromptAssetVersion({ asset: selected, name, template, now })
          : createPromptAssetRecord({
              id: crypto.randomUUID(),
              name,
              template,
              now,
            }),
      );
      this.setState({
        prompts: [
          ...this.state.prompts.filter((prompt) => prompt.id !== asset.id),
          asset,
        ],
      });
      this.openEditor({
        mode: PromptAssetsUrlMode.Edit,
        promptId: asset.id,
        version: asset.activeVersion,
      });
    } catch (error) {
      this.setState({ errorMessage: readErrorMessage(error) });
    }
  }

  private async deletePrompt(prompt: PromptAssetSummary): Promise<void> {
    try {
      await this.client.delete(prompt.id);
      this.setState({
        prompts: this.state.prompts.filter(
          (candidate) => candidate.id !== prompt.id,
        ),
      });
      if (this.state.url.promptId === prompt.id) {
        this.openEditor({
          mode: PromptAssetsUrlMode.Catalog,
          promptId: null,
          version: null,
        });
      }
    } catch (error) {
      this.setState({ errorMessage: readErrorMessage(error) });
    }
  }
}

const readErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not load prompt assets.";
