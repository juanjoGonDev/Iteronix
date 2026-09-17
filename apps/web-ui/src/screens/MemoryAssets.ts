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
  SettingsNumberField,
  SettingsTextField,
  SettingsToggleField,
} from "../components/SettingsFields.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";
import {
  createMemoryAssetRecord,
  createMemoryAssetsClient,
  selectEnabledMemoryAssets,
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
  List: "memory-assets-list",
  Editor: "memory-assets-editor",
  Name: "memory-assets-name",
  Workflow: "memory-assets-workflow",
  Indexing: "memory-assets-indexing",
  Retention: "memory-assets-retention",
  Redaction: "memory-assets-redaction",
  Documents: "memory-assets-documents",
  Save: "memory-assets-save",
  Error: "memory-assets-error",
  Retry: "memory-assets-retry",
  DeletePrefix: "memory-assets-delete-",
  DeleteDialog: "memory-assets-delete-dialog",
  DeleteConfirm: "memory-assets-delete-confirm",
  DeleteCancel: "memory-assets-delete-cancel",
  RowPrefix: "memory-assets-row-",
} as const;

type MemoryAssetsState = {
  assets: ReadonlyArray<MemoryAssetSummary>;
  loading: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  url: MemoryAssetsUrlState;
  name: string;
  scope: MemoryAssetScope;
  workflowId: string;
  indexingEnabled: boolean;
  retentionDays: string;
  redactionEnabled: boolean;
  pendingDeleteId: string | null;
  busy: boolean;
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
      noticeMessage: null,
      url,
      name: "",
      scope: "workflow",
      workflowId: "",
      indexingEnabled: false,
      retentionDays: "30",
      redactionEnabled: true,
      pendingDeleteId: null,
      busy: false,
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
      { className: "min-h-full text-white", "data-testid": Selector.Root },
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
    const enabled = selectEnabledMemoryAssets(this.state.assets).length;
    return createElement(PageIntro, {
      title: "Memory & RAG sources",
      description: `Bounded retrieval sources with opt-in indexing and retained provenance. ${this.state.assets.length} configured · ${enabled} enabled.`,
      actions: createElement(Button, {
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
    });
  }

  private renderContent(): HTMLElement {
    if (this.state.loading)
      return createElement(
        "section",
        {
          className:
            "rounded-2xl border border-[#202832] bg-[#171c22] px-6 py-10 text-sm text-text-secondary",
          "aria-busy": "true",
        },
        ["Loading memory sources…"],
      );
    if (this.state.errorMessage)
      return createElement(
        "section",
        {
          className:
            "flex flex-col items-start gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-6 py-6 sm:flex-row sm:items-center sm:justify-between",
          role: "alert",
          "data-testid": Selector.Error,
        },
        [
          createElement("div", { className: "flex min-w-0 flex-col gap-1" }, [
            createElement(
              "p",
              { className: "text-sm font-semibold text-rose-100" },
              ["Could not load memory sources"],
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
            onClick: () => void this.loadAssets(),
            dataset: { testid: Selector.Retry },
          }),
        ],
      );
    if (this.state.assets.length === 0)
      return createElement(EmptyStatePanel, {
        icon: "database",
        title: "No memory sources yet",
        description:
          "Create an opt-in source before enabling retrieval. Ingestion and indexing stay server-governed.",
        action: createElement(Button, {
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
        }),
      });
    return createElement(AssetRowList, {
      testId: Selector.List,
      rows: this.state.assets.map((asset) => this.renderRow(asset)),
    });
  }

  private renderRow(asset: MemoryAssetSummary): HTMLElement {
    return createElement(AssetRow, {
      testId: `${Selector.RowPrefix}${asset.id}`,
      icon: "database",
      title: asset.name,
      subtitle: asset.id,
      status: asset.status,
      meta: [
        `scope ${asset.scope} · workflow ${asset.workflowId || "unbound"}`,
        `${asset.documents.length} indexed document${asset.documents.length === 1 ? "" : "s"} · ${asset.retentionDays} day retention`,
      ],
      chips: [
        asset.indexingEnabled ? "indexing:on" : "indexing:off",
        asset.redactionEnabled ? "redaction:on" : "redaction:off",
      ],
      actions: [
        {
          label: "Open editor",
          icon: "edit",
          variant: "secondary",
          onClick: () =>
            this.openEditor({
              mode: MemoryAssetsUrlMode.Edit,
              memoryId: asset.id,
              panel: "config",
            }),
        },
        {
          label: "Documents",
          icon: "folder_managed",
          onClick: () =>
            this.openEditor({
              mode: MemoryAssetsUrlMode.Edit,
              memoryId: asset.id,
              panel: "documents",
            }),
        },
        {
          label: "Delete",
          icon: "delete",
          variant: "danger",
          testId: `${Selector.DeletePrefix}${asset.id}`,
          onClick: () => this.setState({ pendingDeleteId: asset.id }),
        },
      ],
    });
  }

  private renderEditor(): HTMLElement | string {
    if (this.state.url.mode === MemoryAssetsUrlMode.Catalog) return "";
    const isCreate = this.state.url.mode === MemoryAssetsUrlMode.Create;
    const retention = Number.parseInt(this.state.retentionDays, 10);
    const retentionValid = Number.isInteger(retention) && retention >= 1;
    const saveDisabled =
      this.state.busy ||
      this.state.name.trim().length === 0 ||
      this.state.workflowId.trim().length === 0 ||
      !retentionValid;
    return createElement(AssetEditorDialog, {
      testId: Selector.Editor,
      title: isCreate ? "Create memory source" : "Edit memory source",
      description:
        "Sources are scoped to one workflow tenant. Retrieval provenance is retained and traces are redacted according to these settings.",
      onClose: () =>
        this.openEditor({
          mode: MemoryAssetsUrlMode.Catalog,
          memoryId: null,
          panel: "config",
        }),
      save: {
        label: isCreate ? "Save source" : "Save changes",
        testId: Selector.Save,
        disabled: saveDisabled,
        disabledReason:
          "Name, workflow ID, and a retention of at least 1 day are required.",
        onClick: () => void this.saveAsset(),
      },
      children: createElement("div", { className: "grid gap-5" }, [
        createElement("div", { className: "flex gap-2" }, [
          this.renderPanelButton("Configuration", "config"),
          this.renderPanelButton("Documents", "documents"),
        ]),
        this.state.url.panel === "documents"
          ? this.renderDocuments()
          : this.renderConfiguration(),
      ]),
    });
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
    const retention = Number.parseInt(this.state.retentionDays, 10);
    return createElement("div", { className: "grid gap-4" }, [
      createElement(SettingsTextField, {
        label: "Name",
        value: this.state.name,
        placeholder: "Product knowledge base",
        testId: Selector.Name,
        onChange: (name: string) => this.setState({ name }),
      }),
      createElement(SettingsTextField, {
        label: "Workflow ID",
        value: this.state.workflowId,
        placeholder: "workflow-support-triage",
        testId: Selector.Workflow,
        hint: "Retrieval is bounded to this workflow and tenant; other flows cannot read this source.",
        onChange: (workflowId: string) => this.setState({ workflowId }),
      }),
      createElement(SettingsNumberField, {
        label: "Retention days",
        value: Number.isInteger(retention) && retention >= 1 ? retention : 30,
        testId: Selector.Retention,
        onChange: (retentionDays: string) => this.setState({ retentionDays }),
      }),
      createElement(SettingsToggleField, {
        label: "Opt in to indexing",
        description:
          "Without indexing, documents remain available but retrieval queries will not match them.",
        checked: this.state.indexingEnabled,
        testId: Selector.Indexing,
        onChange: (indexingEnabled: boolean) =>
          this.setState({ indexingEnabled }),
      }),
      createElement(SettingsToggleField, {
        label: "Redact retrieved content in traces",
        description:
          "Keeps retrieved passages out of run traces and provenance payloads.",
        checked: this.state.redactionEnabled,
        testId: Selector.Redaction,
        onChange: (redactionEnabled: boolean) =>
          this.setState({ redactionEnabled }),
      }),
    ]);
  }

  private renderDocuments(): HTMLElement {
    const selected = this.state.url.memoryId
      ? this.state.assets.find((asset) => asset.id === this.state.url.memoryId)
      : undefined;
    return createElement(
      "section",
      { className: "grid gap-2", "data-testid": Selector.Documents },
      [
        createElement("p", { className: "text-sm text-text-secondary" }, [
          "Indexed documents are listed for inspection. Ingestion remains server-governed and requires opt-in indexing.",
        ]),
        ...(selected?.documents.length
          ? selected.documents.map((document) =>
              createElement(
                "div",
                {
                  key: document.id,
                  className:
                    "flex items-center justify-between gap-3 rounded-xl border border-[#202832] bg-[#1a2129] px-4 py-3",
                },
                [
                  createElement(
                    "p",
                    { className: "min-w-0 truncate text-sm text-white" },
                    [document.name],
                  ),
                  createElement(
                    "p",
                    {
                      className:
                        "shrink-0 font-mono text-xs text-text-secondary",
                    },
                    [document.status],
                  ),
                ],
              ),
            )
          : [
              createElement(
                "p",
                { className: "mt-2 text-sm text-text-secondary" },
                ["No indexed documents."],
              ),
            ]),
      ],
    );
  }

  private renderDeleteConfirmation(): HTMLElement | string {
    const pendingId = this.state.pendingDeleteId;
    if (!pendingId) return "";
    const asset = this.state.assets.find(
      (candidate) => candidate.id === pendingId,
    );
    return createElement(AssetConfirmDialog, {
      testId: Selector.DeleteDialog,
      title: "Delete memory source",
      message: `This removes "${asset?.name ?? pendingId}" and unbinds its indexed documents. Retrieval nodes pointing at it will fail fast until a replacement source exists.`,
      confirmLabel: this.state.busy ? "Deleting…" : "Delete source",
      confirmTestId: Selector.DeleteConfirm,
      confirmDisabled: this.state.busy,
      onConfirm: () => void this.deleteAsset(pendingId),
      cancelLabel: "Cancel",
      cancelTestId: Selector.DeleteCancel,
      onCancel: () => this.setState({ pendingDeleteId: null }),
    });
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
    this.setState({ busy: true });
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
        busy: false,
        noticeMessage: `Memory source "${asset.name}" saved.`,
      });
      this.openEditor({
        mode: MemoryAssetsUrlMode.Edit,
        memoryId: asset.id,
        panel: "config",
      });
    } catch (error) {
      this.setState({ busy: false, errorMessage: readErrorMessage(error) });
    }
  }

  private async deleteAsset(assetId: string): Promise<void> {
    this.setState({ busy: true });
    try {
      await this.client.delete(assetId);
      this.setState({
        assets: this.state.assets.filter((asset) => asset.id !== assetId),
        pendingDeleteId: null,
        busy: false,
        noticeMessage: `Memory source "${assetId}" deleted.`,
      });
      if (this.state.url.memoryId === assetId) {
        this.openEditor({
          mode: MemoryAssetsUrlMode.Catalog,
          memoryId: null,
          panel: "config",
        });
      }
    } catch (error) {
      this.setState({
        busy: false,
        pendingDeleteId: null,
        errorMessage: readErrorMessage(error),
      });
    }
  }
}

const readErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not load memory sources.";
