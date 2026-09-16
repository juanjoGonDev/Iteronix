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
import { SettingsTextField } from "../components/SettingsFields.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";
import {
  createMcpAssetRecord,
  createMcpAssetsClient,
  type McpAssetSummary,
} from "../shared/mcp-assets-client.js";
import {
  McpAssetsUrlMode,
  applyMcpAssetsUrlPatch,
  readMcpAssetsUrlState,
  type McpAssetsUrlState,
} from "./mcp-assets-url-state.js";

const Selector = {
  Root: "mcp-assets-root",
  Create: "mcp-assets-create",
  List: "mcp-assets-list",
  Editor: "mcp-assets-editor",
  Name: "mcp-assets-name",
  Endpoint: "mcp-assets-endpoint",
  Tools: "mcp-assets-tools",
  Save: "mcp-assets-save",
  Error: "mcp-assets-error",
  Retry: "mcp-assets-retry",
  DeletePrefix: "mcp-assets-delete-",
  DeleteDialog: "mcp-assets-delete-dialog",
  DeleteConfirm: "mcp-assets-delete-confirm",
  DeleteCancel: "mcp-assets-delete-cancel",
  RowPrefix: "mcp-assets-row-",
} as const;

type McpAssetsState = {
  assets: ReadonlyArray<McpAssetSummary>;
  loading: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  url: McpAssetsUrlState;
  name: string;
  serverId: string;
  toolVersion: string;
  pendingDeleteId: string | null;
  busy: boolean;
};

export class McpAssetsScreen extends Component<ComponentProps, McpAssetsState> {
  private readonly client = createMcpAssetsClient();

  constructor(props: ComponentProps = {}) {
    const url = readMcpAssetsUrlState(window.location.href);
    super(props, {
      assets: [],
      loading: true,
      errorMessage: null,
      noticeMessage: null,
      url,
      name: "",
      serverId: "",
      toolVersion: "",
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
    return createElement(PageIntro, {
      title: "MCP connections",
      description: `Connection records for allowlisted MCP tool servers. ${this.state.assets.length} configured. Tokens and endpoints live only on the server.`,
      actions: createElement(Button, {
        variant: "primary",
        size: "sm",
        icon: "add",
        children: "Create connection",
        onClick: () =>
          this.openEditor({ mode: McpAssetsUrlMode.Create, mcpId: null }),
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
        ["Loading MCP connections…"],
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
              ["Could not load MCP connections"],
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
        icon: "hub",
        title: "No MCP connections yet",
        description:
          "Create a connection before binding its tools to an AI agent. The server must also list the endpoint in MCP_SERVERS.",
        action: createElement(Button, {
          variant: "primary",
          size: "sm",
          icon: "add",
          children: "Create connection",
          onClick: () =>
            this.openEditor({ mode: McpAssetsUrlMode.Create, mcpId: null }),
        }),
      });
    return createElement(AssetRowList, {
      testId: Selector.List,
      rows: this.state.assets.map((asset) => this.renderRow(asset)),
    });
  }

  private renderRow(asset: McpAssetSummary): HTMLElement {
    return createElement(AssetRow, {
      testId: `${Selector.RowPrefix}${asset.id}`,
      icon: "hub",
      title: asset.name,
      subtitle: asset.id,
      status: asset.status,
      meta: [
        `server ${asset.serverId} · tool contract v${asset.toolVersion}`,
        "Credentials and untrusted tool payloads never reach the browser",
      ],
      chips:
        asset.permissions.length > 0
          ? asset.permissions.map((permission) => `perm:${permission}`)
          : ["no permissions declared"],
      actions: [
        {
          label: "Open editor",
          icon: "edit",
          variant: "secondary",
          onClick: () =>
            this.openEditor({ mode: McpAssetsUrlMode.Edit, mcpId: asset.id }),
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
    if (this.state.url.mode === McpAssetsUrlMode.Catalog) return "";
    const isCreate = this.state.url.mode === McpAssetsUrlMode.Create;
    const saveDisabled =
      this.state.busy ||
      this.state.name.trim().length === 0 ||
      this.state.serverId.trim().length === 0 ||
      this.state.toolVersion.trim().length === 0;
    return createElement(AssetEditorDialog, {
      testId: Selector.Editor,
      title: isCreate ? "Create MCP connection" : "Edit MCP connection",
      description:
        "Connection credentials and untrusted tool payloads are never configured or displayed in the browser.",
      onClose: () =>
        this.openEditor({ mode: McpAssetsUrlMode.Catalog, mcpId: null }),
      save: {
        label: isCreate ? "Save connection" : "Save changes",
        testId: Selector.Save,
        disabled: saveDisabled,
        disabledReason: "Name, server ID, and tool version are all required.",
        onClick: () => void this.saveAsset(),
      },
      children: createElement("div", { className: "grid gap-4" }, [
        createElement(SettingsTextField, {
          label: "Name",
          value: this.state.name,
          placeholder: "Knowledge server",
          testId: Selector.Name,
          onChange: (name: string) => this.setState({ name }),
        }),
        createElement(SettingsTextField, {
          label: "Server ID",
          value: this.state.serverId,
          placeholder: "reference-knowledge",
          testId: Selector.Endpoint,
          hint: "Must match a serverId the operator configured in MCP_SERVERS; the endpoint and token stay server-side.",
          onChange: (serverId: string) => this.setState({ serverId }),
        }),
        createElement(SettingsTextField, {
          label: "Tool version",
          value: this.state.toolVersion,
          placeholder: "1",
          testId: Selector.Tools,
          hint: "Connections pin this version; runtime calls with a different pin are rejected.",
          onChange: (toolVersion: string) => this.setState({ toolVersion }),
        }),
      ]),
    });
  }

  private renderDeleteConfirmation(): HTMLElement | string {
    const pendingId = this.state.pendingDeleteId;
    if (!pendingId) return "";
    const asset = this.state.assets.find(
      (candidate) => candidate.id === pendingId,
    );
    return createElement(AssetConfirmDialog, {
      testId: Selector.DeleteDialog,
      title: "Delete MCP connection",
      message: `This removes "${asset?.name ?? pendingId}" from the workspace. Agents binding its tools will fail fast until the connection is recreated.`,
      confirmLabel: this.state.busy ? "Deleting…" : "Delete connection",
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

  private openEditor(url: McpAssetsUrlState): void {
    window.history.pushState(
      {},
      "",
      applyMcpAssetsUrlPatch(window.location.href, url),
    );
    this.setState({ url });
    this.restoreEditorFromUrl();
  }

  private readonly handleBrowserNavigation = (): void => {
    this.setState({ url: readMcpAssetsUrlState(window.location.href) });
    this.restoreEditorFromUrl();
  };

  private restoreEditorFromUrl(): void {
    const selected = this.state.url.mcpId
      ? this.state.assets.find((asset) => asset.id === this.state.url.mcpId)
      : undefined;
    this.setState({
      name: selected?.name ?? "",
      serverId: selected?.serverId ?? "",
      toolVersion: selected?.toolVersion ?? "",
    });
  }

  private async saveAsset(): Promise<void> {
    if (
      this.state.name.trim().length === 0 ||
      this.state.serverId.trim().length === 0 ||
      this.state.toolVersion.trim().length === 0
    )
      return;
    this.setState({ busy: true });
    try {
      const asset = await this.client.upsert(
        createMcpAssetRecord({
          id: this.state.url.mcpId ?? crypto.randomUUID(),
          name: this.state.name.trim(),
          serverId: this.state.serverId.trim(),
          toolVersion: this.state.toolVersion.trim(),
          now: new Date().toISOString(),
        }),
      );
      this.setState({
        assets: [
          ...this.state.assets.filter((item) => item.id !== asset.id),
          asset,
        ],
        busy: false,
        noticeMessage: `MCP connection "${asset.name}" saved.`,
      });
      this.openEditor({ mode: McpAssetsUrlMode.Edit, mcpId: asset.id });
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
        noticeMessage: `MCP connection "${assetId}" deleted.`,
      });
      if (this.state.url.mcpId === assetId) {
        this.openEditor({ mode: McpAssetsUrlMode.Catalog, mcpId: null });
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
    : "Could not load MCP connections.";
