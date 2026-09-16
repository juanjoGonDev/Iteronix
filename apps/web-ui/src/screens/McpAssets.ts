import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/EmptyStatePanel.js";
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
  Editor: "mcp-assets-editor",
  Name: "mcp-assets-name",
  Endpoint: "mcp-assets-endpoint",
  Tools: "mcp-assets-tools",
  Save: "mcp-assets-save",
  RowPrefix: "mcp-assets-row-",
} as const;

type McpAssetsState = {
  assets: ReadonlyArray<McpAssetSummary>;
  loading: boolean;
  errorMessage: string | null;
  url: McpAssetsUrlState;
  name: string;
  serverId: string;
  toolVersion: string;
};

export class McpAssetsScreen extends Component<ComponentProps, McpAssetsState> {
  private readonly client = createMcpAssetsClient();

  constructor(props: ComponentProps = {}) {
    const url = readMcpAssetsUrlState(window.location.href);
    super(props, {
      assets: [],
      loading: true,
      errorMessage: null,
      url,
      name: "",
      serverId: "",
      toolVersion: "",
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
            ["MCP connections"],
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-text-secondary" },
            ["Governed MCP tools with validated untrusted responses."],
          ),
        ]),
        createElement(Button, {
          variant: "primary",
          size: "sm",
          icon: "add",
          children: "Create connection",
          onClick: () =>
            this.openEditor({ mode: McpAssetsUrlMode.Create, mcpId: null }),
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
        ["Loading MCP connections…"],
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
        icon: "extension",
        title: "No MCP connections yet",
        description:
          "Create a connection before binding its tools to an AI agent.",
      });
    return createElement(
      "section",
      { className: "divide-y divide-border-dark border border-border-dark" },
      this.state.assets.map((asset) => this.renderRow(asset)),
    );
  }

  private renderRow(asset: McpAssetSummary): HTMLElement {
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
            { className: "mt-1 break-all text-sm text-text-secondary" },
            [`${asset.serverId} · ${asset.status} · v${asset.toolVersion}`],
          ),
          createElement(
            "p",
            { className: "mt-1 text-xs text-text-secondary" },
            ["Credentials and server configuration remain server-side"],
          ),
        ]),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          icon: "edit",
          children: "Open editor",
          onClick: () =>
            this.openEditor({ mode: McpAssetsUrlMode.Edit, mcpId: asset.id }),
        }),
      ],
    );
  }

  private renderEditor(): HTMLElement | string {
    if (this.state.url.mode === McpAssetsUrlMode.Catalog) return "";
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
              "w-full max-w-2xl border border-border-dark bg-[#151b22] p-5 shadow-2xl",
          },
          [
            createElement(
              "h2",
              { className: "text-base font-semibold text-white" },
              [
                this.state.url.mode === McpAssetsUrlMode.Create
                  ? "Create MCP connection"
                  : "Edit MCP connection",
              ],
            ),
            createElement(
              "p",
              { className: "mt-1 text-sm text-text-secondary" },
              [
                "Connection credentials and untrusted tool payloads are never configured or displayed in the browser.",
              ],
            ),
            this.renderInput("Name", this.state.name, Selector.Name, (name) =>
              this.setState({ name }),
            ),
            this.renderInput(
              "Server ID",
              this.state.serverId,
              Selector.Endpoint,
              (serverId) => this.setState({ serverId }),
            ),
            this.renderInput(
              "Tool version",
              this.state.toolVersion,
              Selector.Tools,
              (toolVersion) => this.setState({ toolVersion }),
            ),
            createElement("div", { className: "mt-5 flex justify-end gap-2" }, [
              createElement(Button, {
                variant: "ghost",
                size: "sm",
                children: "Close",
                onClick: () =>
                  this.openEditor({
                    mode: McpAssetsUrlMode.Catalog,
                    mcpId: null,
                  }),
              }),
              createElement(Button, {
                variant: "primary",
                size: "sm",
                children: "Save connection",
                disabled: !this.canSave(),
                onClick: () => void this.saveAsset(),
                dataset: { testid: Selector.Save },
              }),
            ]),
          ],
        ),
      ],
    );
  }

  private renderInput(
    label: string,
    value: string,
    testid: string,
    onValue: (value: string) => void,
  ): HTMLElement {
    return createElement(
      "label",
      { className: "mt-4 block text-sm text-text-secondary" },
      [
        label,
        createElement("input", {
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

  private canSave(): boolean {
    return (
      this.state.name.trim().length > 0 &&
      this.state.serverId.trim().length > 0 &&
      this.state.toolVersion.trim().length > 0
    );
  }

  private async saveAsset(): Promise<void> {
    if (!this.canSave()) return;
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
      });
      this.openEditor({ mode: McpAssetsUrlMode.Edit, mcpId: asset.id });
    } catch (error) {
      this.setState({ errorMessage: readErrorMessage(error) });
    }
  }
}

const readErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not load MCP connections.";
