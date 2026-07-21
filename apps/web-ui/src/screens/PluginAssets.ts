import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/EmptyStatePanel.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";
import {
  createPluginAssetRecord,
  createPluginAssetsClient,
  type PluginAssetSummary,
} from "../shared/plugin-assets-client.js";
import {
  PluginAssetsUrlMode,
  applyPluginAssetsUrlPatch,
  readPluginAssetsUrlState,
  type PluginAssetsUrlState,
} from "./plugin-assets-url-state.js";

const Selector = {
  Root: "plugin-assets-root",
  Create: "plugin-assets-create",
  Editor: "plugin-assets-editor",
  Name: "plugin-assets-name",
  Save: "plugin-assets-save",
  RowPrefix: "plugin-assets-row-",
} as const;

type PluginAssetsState = {
  plugins: ReadonlyArray<PluginAssetSummary>;
  loading: boolean;
  errorMessage: string | null;
  url: PluginAssetsUrlState;
  name: string;
};

export class PluginAssetsScreen extends Component<
  ComponentProps,
  PluginAssetsState
> {
  private readonly client = createPluginAssetsClient();

  constructor(props: ComponentProps = {}) {
    const url = readPluginAssetsUrlState(window.location.href);
    super(props, {
      plugins: [],
      loading: true,
      errorMessage: null,
      url,
      name: "",
    });
  }

  override onMount(): void {
    window.addEventListener("popstate", this.handleBrowserNavigation);
    void this.loadPlugins();
  }

  override onUnmount(): void {
    window.removeEventListener("popstate", this.handleBrowserNavigation);
  }

  override render(): HTMLElement {
    return createElement("main", {
      className: "min-h-full bg-[#11161d] px-4 py-5 text-white sm:px-6 lg:px-8",
      "data-testid": Selector.Root,
      children: [
        createElement(
          "div",
          { className: "mx-auto flex max-w-6xl flex-col gap-5" },
          [this.renderToolbar(), this.renderContent(), this.renderEditor()],
        ),
      ],
    });
  }

  private renderToolbar(): HTMLElement {
    return createElement("section", {
      className:
        "flex flex-col gap-4 border-b border-border-dark pb-5 sm:flex-row sm:items-end sm:justify-between",
      children: [
        createElement("div", {}, [
          createElement(
            "h1",
            { className: "text-xl font-semibold tracking-tight text-white" },
            ["Server plugins"],
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-text-secondary" },
            [
              "Trusted server-only plugins with process isolation and governed audit.",
            ],
          ),
        ]),
        createElement(Button, {
          variant: "primary",
          size: "sm",
          icon: "add",
          children: "Register plugin",
          onClick: () =>
            this.openEditor({
              mode: PluginAssetsUrlMode.Create,
              pluginId: null,
            }),
          dataset: { testid: Selector.Create },
        }),
      ],
    });
  }

  private renderContent(): HTMLElement {
    if (this.state.loading)
      return this.renderMessage("Loading server plugins…");
    if (this.state.errorMessage)
      return this.renderMessage(this.state.errorMessage, true);
    if (this.state.plugins.length === 0)
      return createElement(EmptyStatePanel, {
        icon: "extension",
        title: "No server plugins yet",
        description:
          "Register a trusted plugin manifest before binding it to an AI agent.",
      });
    return createElement("section", {
      className: "divide-y divide-border-dark border border-border-dark",
      children: this.state.plugins.map((plugin) =>
        this.renderPluginRow(plugin),
      ),
    });
  }

  private renderMessage(message: string, error = false): HTMLElement {
    return createElement("p", {
      className: error
        ? "border border-rose-500/40 bg-rose-500/10 px-4 py-4 text-sm text-rose-100"
        : "border border-border-dark bg-[#151b22] px-4 py-8 text-sm text-text-secondary",
      children: [message],
    });
  }

  private renderPluginRow(plugin: PluginAssetSummary): HTMLElement {
    return createElement("article", {
      className:
        "flex flex-col gap-3 bg-[#11161d] px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
      "data-testid": `${Selector.RowPrefix}${plugin.id}`,
      children: [
        createElement("div", { className: "min-w-0" }, [
          createElement(
            "p",
            { className: "truncate text-sm font-semibold text-white" },
            [plugin.name],
          ),
          createElement(
            "p",
            { className: "mt-1 text-sm text-text-secondary" },
            [
              `${plugin.id} · ${plugin.status} · ${plugin.runtime}/${plugin.isolation}`,
            ],
          ),
          createElement(
            "p",
            { className: "mt-1 text-xs text-text-secondary" },
            [
              `Permissions: ${plugin.permissions.join(", ") || "none"} · Audit events: ${plugin.auditEvents.length.toString()}`,
            ],
          ),
        ]),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          icon: "edit",
          children: "Inspect manifest",
          onClick: () =>
            this.openEditor({
              mode: PluginAssetsUrlMode.Edit,
              pluginId: plugin.id,
            }),
        }),
      ],
    });
  }

  private renderEditor(): HTMLElement | string {
    if (this.state.url.mode === PluginAssetsUrlMode.Catalog) return "";
    const selected = this.state.plugins.find(
      (plugin) => plugin.id === this.state.url.pluginId,
    );
    const isCreate = this.state.url.mode === PluginAssetsUrlMode.Create;
    return createElement("section", {
      className:
        "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4",
      role: "dialog",
      "aria-modal": "true",
      "data-testid": Selector.Editor,
      children: [
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
              [isCreate ? "Register trusted plugin" : "Plugin manifest"],
            ),
            createElement(
              "p",
              { className: "mt-1 text-sm text-text-secondary" },
              [
                "The browser can only select trusted manifest metadata. Entrypoints, code and secrets remain server-side.",
              ],
            ),
            isCreate
              ? this.renderNameInput()
              : createElement(
                  "dl",
                  { className: "mt-4 grid gap-2 text-sm text-text-secondary" },
                  [
                    createElement("div", {}, [
                      `Plugin: ${selected?.id ?? "Unavailable"}`,
                    ]),
                    createElement("div", {}, [
                      `Isolation: ${selected?.runtime ?? "server"}/${selected?.isolation ?? "process"}`,
                    ]),
                    createElement("div", {}, [
                      `Permissions: ${selected?.permissions.join(", ") ?? "none"}`,
                    ]),
                    createElement("div", {}, [
                      `Audit: ${selected?.auditEvents.map((event) => `${event.action} @ ${event.at}`).join(" · ") || "No audit events"}`,
                    ]),
                  ],
                ),
            createElement("div", { className: "mt-5 flex justify-end gap-2" }, [
              createElement(Button, {
                variant: "ghost",
                size: "sm",
                children: "Close",
                onClick: () =>
                  this.openEditor({
                    mode: PluginAssetsUrlMode.Catalog,
                    pluginId: null,
                  }),
              }),
              isCreate
                ? createElement(Button, {
                    variant: "primary",
                    size: "sm",
                    children: "Register manifest",
                    disabled: this.state.name.trim().length === 0,
                    onClick: () => void this.savePlugin(),
                    dataset: { testid: Selector.Save },
                  })
                : "",
            ]),
          ],
        ),
      ],
    });
  }

  private renderNameInput(): HTMLElement {
    return createElement(
      "label",
      { className: "mt-4 block text-sm text-text-secondary" },
      [
        "Trusted registry key",
        createElement("input", {
          value: this.state.name,
          className:
            "mt-1 h-10 w-full border border-border-dark bg-[#0f151c] px-3 text-sm text-white outline-none focus:border-primary",
          "data-testid": Selector.Name,
          onInput: (event: Event) => {
            if (event.target instanceof HTMLInputElement)
              this.setState({ name: event.target.value });
          },
        }),
      ],
    );
  }

  private async loadPlugins(): Promise<void> {
    this.setState({ loading: true, errorMessage: null });
    try {
      this.setState({ plugins: await this.client.list(), loading: false });
      this.restoreEditorFromUrl();
    } catch (error) {
      this.setState({ loading: false, errorMessage: readErrorMessage(error) });
    }
  }

  private openEditor(url: PluginAssetsUrlState): void {
    window.history.pushState(
      {},
      "",
      applyPluginAssetsUrlPatch(window.location.href, url),
    );
    this.setState({ url });
    this.restoreEditorFromUrl();
  }

  private readonly handleBrowserNavigation = (): void => {
    this.setState({ url: readPluginAssetsUrlState(window.location.href) });
    this.restoreEditorFromUrl();
  };

  private restoreEditorFromUrl(): void {
    const selected = this.state.url.pluginId
      ? this.state.plugins.find(
          (plugin) => plugin.id === this.state.url.pluginId,
        )
      : undefined;
    this.setState({ name: selected?.id ?? "" });
  }

  private async savePlugin(): Promise<void> {
    const id = this.state.name.trim();
    if (!id) return;
    try {
      const plugin = await this.client.upsert(
        createPluginAssetRecord({
          id,
          name: id,
          now: new Date().toISOString(),
        }),
      );
      this.setState({
        plugins: [
          ...this.state.plugins.filter((item) => item.id !== plugin.id),
          plugin,
        ],
      });
      this.openEditor({ mode: PluginAssetsUrlMode.Edit, pluginId: plugin.id });
    } catch (error) {
      this.setState({ errorMessage: readErrorMessage(error) });
    }
  }
}

const readErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not load server plugins.";
