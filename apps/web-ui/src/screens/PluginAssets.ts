import { Button } from "../components/Button.js";
import { EmptyStatePanel } from "../components/EmptyStatePanel.js";
import {
  AssetConfirmDialog,
  AssetEditorDialog,
  AssetRow,
  AssetRowList,
  readAssetStatusLabel,
} from "../components/AssetWorkbench.js";
import {
  PageFrame,
  PageIntro,
  PageNoticeStack,
} from "../components/PageScaffold.js";
import {
  readJsonContractState,
  readSchemaContractError,
  SettingsCheckboxGroup,
  SettingsJsonField,
  SettingsNumberField,
  SettingsSelectField,
  SettingsTextField,
  SettingsToggleField,
} from "../components/SettingsFields.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";
import {
  buildPluginRecordFromSummary,
  buildPluginRegistrationRecord,
  createPluginAssetsClient,
  selectEnabledPluginAssets,
  type PluginAssetsCatalog,
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
  List: "plugin-assets-list",
  Editor: "plugin-assets-editor",
  TrustedKey: "plugin-assets-trusted-key",
  Name: "plugin-assets-name",
  Enabled: "plugin-assets-enabled",
  Capabilities: "plugin-assets-capabilities",
  Permissions: "plugin-assets-permissions",
  Executions: "plugin-assets-executions",
  Timeout: "plugin-assets-timeout",
  InputSchema: "plugin-assets-input-schema",
  OutputSchema: "plugin-assets-output-schema",
  Save: "plugin-assets-save",
  Close: "plugin-assets-editor-close",
  Error: "plugin-assets-error",
  Retry: "plugin-assets-retry",
  DeletePrefix: "plugin-assets-delete-",
  DeleteDialog: "plugin-assets-delete-dialog",
  DeleteConfirm: "plugin-assets-delete-confirm",
  DeleteCancel: "plugin-assets-delete-cancel",
  RowPrefix: "plugin-assets-row-",
  TogglePrefix: "plugin-assets-toggle-",
} as const;

type FieldOption = {
  value: string;
  label: string;
  description: string;
};

const CapabilityOptions: ReadonlyArray<FieldOption> = [
  {
    value: "tool-calls",
    label: "Tool calls",
    description:
      "The plugin may expose tools that governed workflow nodes invoke.",
  },
  {
    value: "streaming",
    label: "Streaming",
    description: "Results may be streamed while the process runs.",
  },
  {
    value: "structured-output",
    label: "Structured output",
    description: "Output is validated against the JSON contract below.",
  },
];

const PermissionOptions: ReadonlyArray<FieldOption> = [
  {
    value: "tool.invoke",
    label: "tool.invoke",
    description: "Invoke the plugin entrypoint inside the process sandbox.",
  },
  {
    value: "memory.read",
    label: "memory.read",
    description: "Read governed memory for the bound workflow.",
  },
  {
    value: "memory.write",
    label: "memory.write",
    description: "Persist governed memory entries.",
  },
  {
    value: "mcp.invoke",
    label: "mcp.invoke",
    description: "Call allowlisted MCP tools through the governed runtime.",
  },
  {
    value: "rag.query",
    label: "rag.query",
    description: "Query RAG sources bound to the workflow tenant.",
  },
];

type PluginFormDraft = {
  trustedKey: string;
  name: string;
  enabled: boolean;
  capabilities: ReadonlyArray<string>;
  permissions: ReadonlyArray<string>;
  executions: string;
  timeoutMs: string;
  inputSchemaJson: string;
  outputSchemaJson: string;
};

type PluginAssetsState = {
  catalog: PluginAssetsCatalog;
  loading: boolean;
  errorMessage: string | null;
  noticeMessage: string | null;
  url: PluginAssetsUrlState;
  draft: PluginFormDraft;
  pendingDeleteId: string | null;
  busy: boolean;
};

const emptyDraft: PluginFormDraft = {
  trustedKey: "",
  name: "",
  enabled: true,
  capabilities: ["tool-calls"],
  permissions: ["tool.invoke"],
  executions: "1",
  timeoutMs: "30000",
  inputSchemaJson: "",
  outputSchemaJson: "",
};

export class PluginAssetsScreen extends Component<
  ComponentProps,
  PluginAssetsState
> {
  private readonly client = createPluginAssetsClient();

  constructor(props: ComponentProps = {}) {
    const url = readPluginAssetsUrlState(window.location.href);
    super(props, {
      catalog: { plugins: [], trustedKeys: [] },
      loading: true,
      errorMessage: null,
      noticeMessage: null,
      url,
      draft: emptyDraft,
      pendingDeleteId: null,
      busy: false,
    });
  }

  override onMount(): void {
    window.addEventListener("popstate", this.handleBrowserNavigation);
    void this.refresh();
  }

  override onUnmount(): void {
    window.removeEventListener("popstate", this.handleBrowserNavigation);
  }

  override render(): HTMLElement {
    return createElement(
      "main",
      {
        className: "min-h-full text-white",
        "data-testid": Selector.Root,
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
    const enabled = selectEnabledPluginAssets(
      this.state.catalog.plugins,
    ).length;
    const total = this.state.catalog.plugins.length;
    return createElement(PageIntro, {
      title: "Server plugins",
      description: `Process-isolated, server-owned plugins that governed workflow nodes can invoke. ${total} registered · ${enabled} enabled.`,
      actions: createElement(Button, {
        variant: "primary",
        size: "sm",
        icon: "add",
        children: "Register plugin",
        onClick: () =>
          this.openEditor({ mode: PluginAssetsUrlMode.Create, pluginId: null }),
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
        ["Loading server plugins…"],
      );
    if (this.state.errorMessage) return this.renderErrorBanner();
    if (this.state.catalog.plugins.length === 0)
      return createElement(EmptyStatePanel, {
        icon: "extension",
        title: "No server plugins yet",
        description:
          "Register a trusted plugin manifest before binding it to a governed workflow node. Only keys on the server allowlist can be registered.",
        action: createElement(Button, {
          variant: "primary",
          size: "sm",
          icon: "add",
          children: "Register plugin",
          onClick: () =>
            this.openEditor({
              mode: PluginAssetsUrlMode.Create,
              pluginId: null,
            }),
        }),
      });
    return createElement(AssetRowList, {
      testId: Selector.List,
      rows: this.state.catalog.plugins.map((plugin) =>
        this.renderPluginRow(plugin),
      ),
    });
  }

  private renderErrorBanner(): HTMLElement {
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
            ["Could not load server plugins"],
          ),
          createElement("p", { className: "text-sm text-rose-100/80" }, [
            this.state.errorMessage ?? "",
          ]),
        ]),
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          icon: "refresh",
          children: "Retry",
          onClick: () => void this.refresh(),
          dataset: { testid: Selector.Retry },
        }),
      ],
    );
  }

  private renderPluginRow(plugin: PluginAssetSummary): HTMLElement {
    const lastAudit = plugin.auditEvents.at(-1);
    return createElement(AssetRow, {
      testId: `${Selector.RowPrefix}${plugin.id}`,
      icon: "deployed_code",
      title: plugin.name,
      subtitle: plugin.id,
      status: plugin.status,
      meta: [
        `${plugin.runtime} · ${plugin.isolation}-isolated`,
        `Limits: ${plugin.limits.executions} run · ${plugin.limits.timeoutMs} ms timeout`,
        `Permissions: ${plugin.permissions.join(", ") || "none declared"}`,
      ],
      chips: [
        ...plugin.capabilities.map((capability) => `cap:${capability}`),
        `audit:${plugin.auditEvents.length}`,
      ],
      note: lastAudit
        ? `Last audit: ${lastAudit.action} @ ${lastAudit.at}`
        : "No audit events recorded yet",
      actions: [
        {
          label: "Edit",
          icon: "edit",
          variant: "secondary",
          onClick: () =>
            this.openEditor({
              mode: PluginAssetsUrlMode.Edit,
              pluginId: plugin.id,
            }),
        },
        {
          label: plugin.status === "enabled" ? "Disable" : "Enable",
          icon: plugin.status === "enabled" ? "toggle_on" : "toggle_off",
          testId: `${Selector.TogglePrefix}${plugin.id}`,
          disabled: plugin.status === "error",
          disabledReason: "Assets in error state must be re-registered.",
          onClick: () =>
            void this.toggleStatus(
              plugin,
              plugin.status === "enabled" ? "disabled" : "enabled",
            ),
        },
        {
          label: "Delete",
          icon: "delete",
          variant: "danger",
          testId: `${Selector.DeletePrefix}${plugin.id}`,
          onClick: () => this.setState({ pendingDeleteId: plugin.id }),
        },
      ],
    });
  }

  private renderEditor(): HTMLElement | string {
    if (this.state.url.mode === PluginAssetsUrlMode.Catalog) return "";
    const isCreate = this.state.url.mode === PluginAssetsUrlMode.Create;
    const selected = this.findSelected();
    if (!isCreate && !selected)
      return createElement(
        "section",
        {
          className:
            "rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 py-6 text-sm text-amber-100",
          role: "status",
        },
        [
          `Plugin "${this.state.url.pluginId ?? ""}" is not available in this workspace. Close this view and pick a registered plugin.`,
          createElement(Button, {
            variant: "ghost",
            size: "sm",
            children: "Back to catalog",
            onClick: () =>
              this.openEditor({
                mode: PluginAssetsUrlMode.Catalog,
                pluginId: null,
              }),
          }),
        ],
      );
    const draft = this.state.draft;
    const inputState = readJsonContractState(draft.inputSchemaJson, {
      required: false,
      validate: readSchemaContractError,
    });
    const outputState = readJsonContractState(draft.outputSchemaJson, {
      required: false,
      validate: readSchemaContractError,
    });
    const executions = Number.parseInt(draft.executions, 10);
    const timeoutMs = Number.parseInt(draft.timeoutMs, 10);
    const limitsValid =
      Number.isInteger(executions) &&
      executions >= 1 &&
      Number.isInteger(timeoutMs) &&
      timeoutMs >= 1;
    const noTrustedKeys = this.state.catalog.trustedKeys.length === 0;
    const saveDisabled =
      this.state.busy ||
      noTrustedKeys ||
      !inputState.valid ||
      !outputState.valid ||
      !limitsValid ||
      draft.trustedKey.length === 0;
    const saveDisabledReason = noTrustedKeys
      ? "No trusted plugin keys are available. Operators add them with ITERONIX_TRUSTED_PLUGIN_IDS on the server."
      : this.state.busy
        ? "A previous request is still in flight."
        : !inputState.valid
          ? inputState.message
          : !outputState.valid
            ? outputState.message
            : !limitsValid
              ? "Execution limit and timeout must be positive integers."
              : "";

    return createElement(AssetEditorDialog, {
      testId: Selector.Editor,
      title: isCreate
        ? "Register trusted plugin"
        : `Manifest · ${selected?.id ?? ""}`,
      description:
        "Entrypoints, code, and secrets stay server-side. This form only declares the trusted manifest the governed runtime validates.",
      closeTestId: Selector.Close,
      onClose: () =>
        this.openEditor({ mode: PluginAssetsUrlMode.Catalog, pluginId: null }),
      save: {
        label: isCreate ? "Register plugin" : "Save manifest",
        testId: Selector.Save,
        disabled: saveDisabled,
        disabledReason: saveDisabledReason,
        onClick: () => void this.saveDraft(isCreate),
      },
      children: createElement("div", { className: "grid gap-5" }, [
        createElement(SettingsSelectField, {
          label: "Trusted plugin key",
          value: draft.trustedKey,
          testId: Selector.TrustedKey,
          options: this.state.catalog.trustedKeys.map((key) => ({
            value: key,
            label: key,
          })),
          onChange: (value: string) =>
            this.setState({
              draft: {
                ...this.state.draft,
                trustedKey: value,
                name: this.state.draft.name || value,
              },
            }),
        }),
        createElement(
          "p",
          { className: "-mt-3 text-xs leading-5 text-text-secondary" },
          [
            "The server owns this allowlist. Add more keys with ITERONIX_TRUSTED_PLUGIN_IDS (comma-separated); the reference plugin is always trusted.",
          ],
        ),
        createElement(SettingsTextField, {
          label: "Display name",
          value: draft.name,
          placeholder: "Readable name shown across the workbench",
          testId: Selector.Name,
          onChange: (value: string) =>
            this.setState({ draft: { ...this.state.draft, name: value } }),
        }),
        createElement(SettingsToggleField, {
          label: "Enabled for governed workflows",
          description:
            "Disabled plugins stay registered and auditable but cannot be invoked.",
          checked: draft.enabled,
          testId: Selector.Enabled,
          onChange: (checked: boolean) =>
            this.setState({ draft: { ...this.state.draft, enabled: checked } }),
        }),
        createElement(SettingsCheckboxGroup, {
          label: "Capabilities",
          description:
            "Declared capabilities are validated against every node call.",
          values: draft.capabilities,
          options: CapabilityOptions,
          testId: Selector.Capabilities,
          onChange: (value: string, checked: boolean) =>
            this.setState({
              draft: {
                ...this.state.draft,
                capabilities: checked
                  ? [...new Set([...draft.capabilities, value])]
                  : draft.capabilities.filter((entry) => entry !== value),
              },
            }),
        }),
        createElement(SettingsCheckboxGroup, {
          label: "Permissions",
          description:
            "Least-privilege grants; anything else is rejected at runtime.",
          values: draft.permissions,
          options: PermissionOptions,
          testId: Selector.Permissions,
          onChange: (value: string, checked: boolean) =>
            this.setState({
              draft: {
                ...this.state.draft,
                permissions: checked
                  ? [...new Set([...draft.permissions, value])]
                  : draft.permissions.filter((entry) => entry !== value),
              },
            }),
        }),
        createElement("div", { className: "grid gap-4 sm:grid-cols-2" }, [
          createElement(SettingsNumberField, {
            label: "Execution limit",
            value:
              Number.isInteger(executions) && executions >= 1 ? executions : 1,
            testId: Selector.Executions,
            onChange: (value: string) =>
              this.setState({
                draft: { ...this.state.draft, executions: value },
              }),
          }),
          createElement(SettingsNumberField, {
            label: "Timeout (ms)",
            value:
              Number.isInteger(timeoutMs) && timeoutMs >= 1 ? timeoutMs : 30000,
            testId: Selector.Timeout,
            onChange: (value: string) =>
              this.setState({
                draft: { ...this.state.draft, timeoutMs: value },
              }),
          }),
        ]),
        !isCreate
          ? createElement("p", { className: "text-xs text-text-secondary" }, [
              `Status: ${readAssetStatusLabel(selected?.status ?? "enabled")} · Audit events recorded: ${selected ? selected.auditEvents.length : 0}`,
            ])
          : "",
        createElement("div", { className: "grid gap-4 lg:grid-cols-2" }, [
          createElement(SettingsJsonField, {
            label: "Input JSON contract",
            value: draft.inputSchemaJson,
            placeholder: '{ "type": "object" }',
            testId: Selector.InputSchema,
            hint: "The JSON schema node inputs must satisfy before the plugin runs.",
            contractState: inputState,
            onChange: (value: string) =>
              this.setState({
                draft: { ...this.state.draft, inputSchemaJson: value },
              }),
          }),
          createElement(SettingsJsonField, {
            label: "Output JSON contract",
            value: draft.outputSchemaJson,
            placeholder: '{ "type": "object" }',
            testId: Selector.OutputSchema,
            hint: "The JSON schema results are validated against after every run.",
            contractState: outputState,
            onChange: (value: string) =>
              this.setState({
                draft: { ...this.state.draft, outputSchemaJson: value },
              }),
          }),
        ]),
        selected && selected.auditEvents.length > 0
          ? createElement(
              "details",
              {
                className:
                  "rounded-xl border border-[#202832] bg-[#1a2129] px-4 py-3 text-sm",
              },
              [
                createElement(
                  "summary",
                  { className: "cursor-pointer text-text-secondary" },
                  [`Audit history (${selected.auditEvents.length})`],
                ),
                createElement(
                  "ul",
                  {
                    className:
                      "mt-3 flex flex-col gap-1 font-mono text-xs text-text-secondary",
                  },
                  [...selected.auditEvents]
                    .reverse()
                    .slice(0, 8)
                    .map((event) =>
                      createElement(
                        "li",
                        { key: `${event.at}-${event.action}` },
                        [`${event.action} @ ${event.at}`],
                      ),
                    ),
                ),
              ],
            )
          : "",
      ]),
    });
  }

  private renderDeleteConfirmation(): HTMLElement | string {
    const pendingId = this.state.pendingDeleteId;
    if (!pendingId) return "";
    const plugin = this.state.catalog.plugins.find(
      (candidate) => candidate.id === pendingId,
    );
    return createElement(AssetConfirmDialog, {
      testId: Selector.DeleteDialog,
      title: "Delete plugin manifest",
      message: `This removes the manifest for "${plugin?.name ?? pendingId}" from the workspace. Governed workflows that still bind it will fail fast until a replacement is registered. This cannot be undone.`,
      confirmLabel: this.state.busy ? "Deleting…" : "Delete manifest",
      confirmTestId: Selector.DeleteConfirm,
      confirmDisabled: this.state.busy,
      onConfirm: () => void this.deletePlugin(pendingId),
      cancelLabel: "Cancel",
      cancelTestId: Selector.DeleteCancel,
      onCancel: () => this.setState({ pendingDeleteId: null }),
    });
  }

  private findSelected(): PluginAssetSummary | undefined {
    return this.state.catalog.plugins.find(
      (plugin) => plugin.id === this.state.url.pluginId,
    );
  }

  private async refresh(): Promise<void> {
    this.setState({ loading: true, errorMessage: null });
    try {
      const catalog = await this.client.listCatalog();
      this.setState({ catalog, loading: false });
      this.restoreDraftFromSelection();
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
    this.restoreDraftFromSelection();
  }

  private readonly handleBrowserNavigation = (): void => {
    this.setState({ url: readPluginAssetsUrlState(window.location.href) });
    this.restoreDraftFromSelection();
  };

  private restoreDraftFromSelection(): void {
    const selected = this.findSelected();
    if (!selected) {
      if (this.state.url.mode === PluginAssetsUrlMode.Create)
        this.setState({
          draft: {
            ...emptyDraft,
            trustedKey: this.state.catalog.trustedKeys[0] ?? "",
          },
        });
      return;
    }
    this.setState({
      draft: {
        trustedKey: selected.id,
        name: selected.name,
        enabled: selected.status === "enabled",
        capabilities: [...selected.capabilities],
        permissions: [...selected.permissions],
        executions: String(selected.limits.executions),
        timeoutMs: String(selected.limits.timeoutMs),
        inputSchemaJson: JSON.stringify(selected.inputSchema.schema, null, 2),
        outputSchemaJson: JSON.stringify(selected.outputSchema.schema, null, 2),
      },
    });
  }

  private async saveDraft(isCreate: boolean): Promise<void> {
    this.setState({ busy: true });
    try {
      const existing = this.findSelected();
      const record = buildPluginRegistrationRecord(
        {
          trustedKey: this.state.draft.trustedKey,
          name: this.state.draft.name,
          enabled: this.state.draft.enabled,
          capabilities: this.state.draft.capabilities,
          permissions: this.state.draft.permissions,
          executions: Number.parseInt(this.state.draft.executions, 10),
          timeoutMs: Number.parseInt(this.state.draft.timeoutMs, 10),
          inputSchemaJson: this.state.draft.inputSchemaJson,
          outputSchemaJson: this.state.draft.outputSchemaJson,
        },
        {
          now: new Date().toISOString(),
          ...(existing
            ? { existing: { provenance: existing.provenance } }
            : {}),
        },
      );
      const saved = await this.client.upsert(record);
      this.setState({
        catalog: {
          plugins: [
            ...this.state.catalog.plugins.filter(
              (plugin) => plugin.id !== saved.id,
            ),
            saved,
          ],
          trustedKeys: this.state.catalog.trustedKeys,
        },
        noticeMessage: isCreate
          ? `Plugin "${saved.name}" registered and audited.`
          : `Manifest for "${saved.name}" updated.`,
        busy: false,
      });
      this.openEditor({ mode: PluginAssetsUrlMode.Edit, pluginId: saved.id });
    } catch (error) {
      this.setState({ busy: false, errorMessage: readErrorMessage(error) });
    }
  }

  private async toggleStatus(
    plugin: PluginAssetSummary,
    status: PluginAssetSummary["status"],
  ): Promise<void> {
    this.setState({ busy: true, errorMessage: null });
    try {
      const saved = await this.client.upsert(
        buildPluginRecordFromSummary(plugin, { status }),
      );
      this.setState({
        catalog: {
          plugins: this.state.catalog.plugins.map((candidate) =>
            candidate.id === saved.id ? saved : candidate,
          ),
          trustedKeys: this.state.catalog.trustedKeys,
        },
        noticeMessage: `Plugin "${saved.name}" is now ${status}.`,
        busy: false,
      });
    } catch (error) {
      this.setState({ busy: false, errorMessage: readErrorMessage(error) });
    }
  }

  private async deletePlugin(pluginId: string): Promise<void> {
    this.setState({ busy: true, errorMessage: null });
    try {
      await this.client.delete(pluginId);
      this.setState({
        catalog: {
          plugins: this.state.catalog.plugins.filter(
            (plugin) => plugin.id !== pluginId,
          ),
          trustedKeys: this.state.catalog.trustedKeys,
        },
        pendingDeleteId: null,
        busy: false,
        noticeMessage: `Plugin "${pluginId}" deleted.`,
      });
      if (this.state.url.pluginId === pluginId) {
        this.openEditor({ mode: PluginAssetsUrlMode.Catalog, pluginId: null });
      }
    } catch (error) {
      this.setState({ busy: false, errorMessage: readErrorMessage(error) });
    }
  }
}

const readErrorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not load server plugins.";
