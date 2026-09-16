import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/EmptyStatePanel.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";
import {
  createMemoryAssetRecord,
  createMemoryAssetsClient,
  type MemoryAssetScope,
  type MemoryAssetSummary,
} from "../shared/memory-assets-client.js";
import {
  MemoryAssetsUrlMode,
  applyMemoryAssetsUrlPatch,
  readMemoryAssetsUrlState,
  type MemoryAssetsUrlPanel,
  type MemoryAssetsUrlState,
} from "./memory-assets-url-state.js";

const Selector = {
  Root: "memory-assets-root",
  Create: "memory-assets-create",
  Editor: "memory-assets-editor",
  Name: "memory-assets-name",
  Workflow: "memory-assets-workflow",
  Indexing: "memory-assets-indexing",
  Retention: "memory-assets-retention",
  Redaction: "memory-assets-redaction",
  Documents: "memory-assets-documents",
  Save: "memory-assets-save",
  RowPrefix: "memory-assets-row-",
} as const;
type MemoryAssetsState = {
  assets: ReadonlyArray<MemoryAssetSummary>;
  loading: boolean;
  errorMessage: string | null;
  url: MemoryAssetsUrlState;
  name: string;
  scope: MemoryAssetScope;
  workflowId: string;
  indexingEnabled: boolean;
  retentionDays: string;
  redactionEnabled: boolean;
};

export class MemoryAssetsScreen extends Component<
  ComponentProps,
  MemoryAssetsState
> {
  private readonly client = createMemoryAssetsClient();
  constructor(props: ComponentProps = {}) {
    const url = readMemoryAssetsUrlState(window.location.href);
    super(props, {
      assets: [],
      loading: true,
      errorMessage: null,
      url,
      name: "",
      scope: "workflow",
      workflowId: "",
      indexingEnabled: false,
      retentionDays: "30",
      redactionEnabled: true,
    });
  }
  override onMount(): void {
    window.addEventListener("popstate", this.handleBrowserNavigation);
    void this.loadAssets();
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
        "data-testid": Selector.Root,
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
        createElement("div", {}, [
          createElement(
            "h1",
            { className: "text-xl font-semibold tracking-tight text-white" },
            ["Memory & RAG sources"],
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-text-secondary" },
            [
              "Bounded retrieval sources with opt-in indexing and retained provenance.",
            ],
          ),
        ]),
        createElement(Button, {
          variant: "primary",
          size: "sm",
          icon: "add",
          children: "Create source",
          onClick: () =>
            this.openEditor({
              mode: MemoryAssetsUrlMode.Create,
              memoryId: null,
              panel: "config",
            }),
          dataset: { testid: Selector.Create },
        }),
      ],
    );
  }
  private renderContent(): HTMLElement {
    if (this.state.loading)
      return createElement(
        "p",
        {
          className:
            "border border-border-dark bg-[#151b22] px-4 py-8 text-sm text-text-secondary",
        },
        ["Loading memory sources…"],
      );
    if (this.state.errorMessage)
      return createElement(
        "p",
        {
          className:
            "border border-rose-500/40 bg-rose-500/10 px-4 py-4 text-sm text-rose-100",
        },
        [this.state.errorMessage],
      );
    if (this.state.assets.length === 0)
      return createElement(EmptyStatePanel, {
        icon: "database",
        title: "No memory sources yet",
        description: "Create an opt-in source before enabling retrieval.",
      });
    return createElement(
      "section",
      { className: "divide-y divide-border-dark border border-border-dark" },
      this.state.assets.map((asset) => this.renderRow(asset)),
    );
  }
  private renderRow(asset: MemoryAssetSummary): HTMLElement {
    return createElement(
      "article",
      {
        className:
          "flex flex-col gap-3 bg-[#11161d] px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
        "data-testid": `${Selector.RowPrefix}${asset.id}`,
      },
      [
        createElement("div", { className: "min-w-0" }, [
          createElement(
            "p",
            { className: "truncate text-sm font-semibold text-white" },
            [asset.name],
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-text-secondary" },
            [
              `${asset.scope} · ${asset.status} · ${asset.indexingEnabled ? "indexing on" : "indexing off"}`,
            ],
          ),
          createElement(
            "p",
            { className: "mt-1 text-xs text-text-secondary" },
            [
              `${asset.documents.length} indexed document${asset.documents.length === 1 ? "" : "s"} · ${asset.retentionDays} day retention · ${asset.redactionEnabled ? "redacted" : "unredacted"}`,
            ],
          ),
        ]),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          icon: "edit",
          children: "Open editor",
          onClick: () =>
            this.openEditor({
              mode: MemoryAssetsUrlMode.Edit,
              memoryId: asset.id,
              panel: "config",
            }),
        }),
      ],
    );
  }
  private renderEditor(): HTMLElement | string {
    if (this.state.url.mode === MemoryAssetsUrlMode.Catalog) return "";
    return createElement(
      "section",
      {
        className:
          "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4",
        role: "dialog",
        "aria-modal": "true",
        "data-testid": Selector.Editor,
      },
      [
        createElement(
          "div",
          {
            className:
              "max-h-full w-full max-w-2xl overflow-y-auto border border-border-dark bg-[#151b22] p-5 shadow-2xl",
          },
          [
            createElement(
              "div",
              { className: "flex items-center justify-between" },
              [
                createElement(
                  "h2",
                  { className: "text-base font-semibold text-white" },
                  [
                    this.state.url.mode === MemoryAssetsUrlMode.Create
                      ? "Create memory source"
                      : "Edit memory source",
                  ],
                ),
                this.renderPanelButton("Configuration", "config"),
                this.renderPanelButton("Documents", "documents"),
              ],
            ),
            this.state.url.panel === "documents"
              ? this.renderDocuments()
              : this.renderConfiguration(),
            createElement("div", { className: "mt-5 flex justify-end gap-2" }, [
              createElement(Button, {
                variant: "ghost",
                size: "sm",
                children: "Close",
                onClick: () =>
                  this.openEditor({
                    mode: MemoryAssetsUrlMode.Catalog,
                    memoryId: null,
                    panel: "config",
                  }),
              }),
              createElement(Button, {
                variant: "primary",
                size: "sm",
                children: "Save source",
                disabled:
                  this.state.name.trim().length === 0 ||
                  this.state.workflowId.trim().length === 0,
                onClick: () => void this.saveAsset(),
                dataset: { testid: Selector.Save },
              }),
            ]),
          ],
        ),
      ],
    );
  }
  private renderPanelButton(
    label: string,
    panel: MemoryAssetsUrlPanel,
  ): HTMLElement {
    return createElement(Button, {
      variant: this.state.url.panel === panel ? "secondary" : "ghost",
      size: "sm",
      children: label,
      onClick: () => this.openEditor({ ...this.state.url, panel }),
    });
  }
  private renderConfiguration(): HTMLElement {
    return createElement("div", {}, [
      this.renderInput("Name", this.state.name, Selector.Name, (name) =>
        this.setState({ name }),
      ),
      this.renderInput(
        "Workflow ID",
        this.state.workflowId,
        Selector.Workflow,
        (workflowId) => this.setState({ workflowId }),
      ),
      this.renderCheckbox(
        "Opt in to indexing",
        this.state.indexingEnabled,
        Selector.Indexing,
        (indexingEnabled) => this.setState({ indexingEnabled }),
      ),
      this.renderInput(
        "Retention days",
        this.state.retentionDays,
        Selector.Retention,
        (retentionDays) => this.setState({ retentionDays }),
        "number",
      ),
      this.renderCheckbox(
        "Redact retrieved content in traces",
        this.state.redactionEnabled,
        Selector.Redaction,
        (redactionEnabled) => this.setState({ redactionEnabled }),
      ),
    ]);
  }
  private renderDocuments(): HTMLElement {
    const selected = this.state.url.memoryId
      ? this.state.assets.find((asset) => asset.id === this.state.url.memoryId)
      : undefined;
    return createElement(
      "section",
      { className: "mt-5", "data-testid": Selector.Documents },
      [
        createElement("p", { className: "text-sm text-text-secondary" }, [
          "Indexed documents are listed for inspection. Document ingestion remains server-governed and requires opt-in indexing.",
        ]),
        ...(selected?.documents.length
          ? selected.documents.map((document) =>
              createElement(
                "p",
                {
                  className:
                    "mt-3 border border-border-dark px-3 py-2 text-sm text-white",
                },
                [`${document.name} · ${document.status}`],
              ),
            )
          : [
              createElement(
                "p",
                { className: "mt-4 text-sm text-text-secondary" },
                ["No indexed documents."],
              ),
            ]),
      ],
    );
  }
  private renderInput(
    label: string,
    value: string,
    testid: string,
    onValue: (value: string) => void,
    type = "text",
  ): HTMLElement {
    return createElement(
      "label",
      { className: "mt-4 block text-sm text-text-secondary" },
      [
        label,
        createElement("input", {
          type,
          value,
          className:
            "mt-1 h-10 w-full border border-border-dark bg-[#0f151c] px-3 text-sm text-white outline-none focus:border-primary",
          "data-testid": testid,
          onInput: (event: Event) => {
            if (event.target instanceof HTMLInputElement)
              onValue(event.target.value);
          },
        }),
      ],
    );
  }
  private renderCheckbox(
    label: string,
    value: boolean,
    testid: string,
    onValue: (value: boolean) => void,
  ): HTMLElement {
    return createElement(
      "label",
      { className: "mt-4 flex items-center gap-2 text-sm text-text-secondary" },
      [
        createElement("input", {
          type: "checkbox",
          checked: value,
          "data-testid": testid,
          onChange: (event: Event) => {
            if (event.target instanceof HTMLInputElement)
              onValue(event.target.checked);
          },
        }),
        label,
      ],
    );
  }
  private async loadAssets(): Promise<void> {
    this.setState({ loading: true, errorMessage: null });
    try {
      this.setState({ assets: await this.client.list(), loading: false });
      this.restoreEditorFromUrl();
    } catch (error) {
      this.setState({ loading: false, errorMessage: readErrorMessage(error) });
    }
  }
  private openEditor(url: MemoryAssetsUrlState): void {
    window.history.pushState(
      {},
      "",
      applyMemoryAssetsUrlPatch(window.location.href, url),
    );
    this.setState({ url });
    this.restoreEditorFromUrl();
  }
  private readonly handleBrowserNavigation = (): void => {
    this.setState({ url: readMemoryAssetsUrlState(window.location.href) });
    this.restoreEditorFromUrl();
  };
  private restoreEditorFromUrl(): void {
    const selected = this.state.url.memoryId
      ? this.state.assets.find((asset) => asset.id === this.state.url.memoryId)
      : undefined;
    this.setState({
      name: selected?.name ?? "",
      scope: "workflow",
      workflowId: selected?.workflowId ?? "",
      indexingEnabled: selected?.indexingEnabled ?? false,
      retentionDays: String(selected?.retentionDays ?? 30),
      redactionEnabled: selected?.redactionEnabled ?? true,
    });
  }
  private async saveAsset(): Promise<void> {
    const retentionDays = Number(this.state.retentionDays);
    if (
      !Number.isInteger(retentionDays) ||
      retentionDays < 1 ||
      !this.state.name.trim()
    )
      return;
    try {
      const asset = await this.client.upsert(
        createMemoryAssetRecord({
          id: this.state.url.memoryId ?? crypto.randomUUID(),
          name: this.state.name.trim(),
          scope: this.state.scope,
          workflowId: this.state.workflowId.trim(),
          indexingEnabled: this.state.indexingEnabled,
          retentionDays,
          redactionEnabled: this.state.redactionEnabled,
          now: new Date().toISOString(),
        }),
      );
      this.setState({
        assets: [
          ...this.state.assets.filter((item) => item.id !== asset.id),
          asset,
        ],
      });
      this.openEditor({
        mode: MemoryAssetsUrlMode.Edit,
        memoryId: asset.id,
        panel: "config",
      });
    } catch (error) {
      this.setState({ errorMessage: readErrorMessage(error) });
    }
  }
}
const readErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not load memory sources.";
