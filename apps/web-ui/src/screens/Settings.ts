import { Button } from "../components/Button.js";
import { StatusBadge } from "../components/Card.js";
import {
  PageFrame,
  PageIntro,
  PageTabs,
  showGlobalToast,
  type ToastKind,
  type PageTabItem,
} from "../components/PageScaffold.js";
import {
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
  DefaultSettingsProfileId,
  createDefaultSettingsSnapshot,
  hydrateSettingsSnapshot,
  type NotificationsSettings,
  type SettingsSnapshot,
  type WorkflowLimitsSettings,
} from "../shared/settings-storage.js";
import {
  createSettingsClient,
  type ExternalApiKeyRecord,
  type RuntimeProviderRecord,
} from "../shared/settings-client.js";
import { createWorkflowClient } from "../shared/workflow-client.js";
import { writeBrowserUrlState } from "../shared/url-state.js";
import {
  ProviderKind,
  ProviderPromptMode,
  createProviderProfile,
  createProviderSyncRequests,
  updateProviderProfile,
  type ProviderProfileRecord,
} from "./settings-state.js";
import {
  applySettingsUrlPatch,
  readSettingsUrlStateFromLocation,
  type SettingsUrlTab,
} from "./settings-url-state.js";
import {
  ExternalApiKeyScopeSelection,
  readExternalApiKeyScope,
  type ExternalApiKeyScopeSelection as ExternalApiKeyScopeSelectionValue,
} from "./settings-api-access-state.js";

type SettingsTab = SettingsUrlTab;

interface SettingsScreenState {
  activeTab: SettingsTab;
  profileId: string;
  providerProfiles: ReadonlyArray<ProviderProfileRecord>;
  selectedProviderId: string | null;
  workflowLimits: WorkflowLimitsSettings;
  notifications: NotificationsSettings;
  runtimeProviders: ReadonlyArray<RuntimeProviderRecord>;
  isSaving: boolean;
  isTestingConnection: boolean;
  isTestingWebhook: boolean;
  externalApiKeys: ReadonlyArray<ExternalApiKeyRecord>;
  apiKeyName: string;
  apiKeyScope: ExternalApiKeyScopeSelectionValue;
  apiKeyWorkflowIds: ReadonlyArray<string>;
  availableWorkflows: ReadonlyArray<{ id: string; name: string }>;
  editingExternalApiKeyId: string | null;
  newExternalApiKey: string | null;
  isManagingExternalApiKeys: boolean;
}

const TabLabel: Record<SettingsTab, string> = {
  general: "General",
  provider: "Providers",
  limits: "Workflow Limits",
  notifications: "Notifications",
  api: "API Access",
};

const ProviderKindLabel: Record<ProviderKind, string> = {
  [ProviderKind.CodexCli]: "Codex CLI",
  [ProviderKind.OpenAI]: "OpenAI",
  [ProviderKind.Anthropic]: "Anthropic",
  [ProviderKind.Ollama]: "Ollama",
  [ProviderKind.Custom]: "Custom",
};

const ProviderKindDescription: Record<ProviderKind, string> = {
  [ProviderKind.CodexCli]:
    "CLI provider registered in the current backend runtime.",
  [ProviderKind.OpenAI]:
    "API-based profile persisted in PostgreSQL for future workflow selection.",
  [ProviderKind.Anthropic]:
    "API-based profile persisted in PostgreSQL for future workflow selection.",
  [ProviderKind.Ollama]:
    "Local inference profile persisted in PostgreSQL for future workflow selection.",
  [ProviderKind.Custom]:
    "Custom OpenAI-compatible API profile persisted in PostgreSQL for future workflow selection.",
};

const TestWebhookPayload = {
  event: "iteronix.settings.test",
  source: "settings-screen",
} as const;

export class SettingsScreen extends Component<
  ComponentProps,
  SettingsScreenState
> {
  private readonly settingsClient = createSettingsClient();
  private readonly workflowClient = createWorkflowClient();

  constructor(props: ComponentProps = {}) {
    const snapshot = createDefaultSettingsSnapshot();
    const urlState =
      typeof window === "undefined"
        ? null
        : readSettingsUrlStateFromLocation(window.location);
    const urlSelectedProviderId =
      urlState?.selectedProviderId &&
      snapshot.providerProfiles.some(
        (profile) => profile.id === urlState.selectedProviderId,
      )
        ? urlState.selectedProviderId
        : null;
    const selectedProviderId =
      urlSelectedProviderId ?? snapshot.providerProfiles[0]?.id ?? null;

    super(props, {
      activeTab: urlState?.activeTab ?? "provider",
      profileId: snapshot.profileId,
      providerProfiles: snapshot.providerProfiles,
      selectedProviderId,
      workflowLimits: snapshot.workflowLimits,
      notifications: snapshot.notifications,
      runtimeProviders: [],
      isSaving: false,
      isTestingConnection: false,
      isTestingWebhook: false,
      externalApiKeys: [],
      apiKeyName: "",
      apiKeyScope: ExternalApiKeyScopeSelection.AllWorkflows,
      apiKeyWorkflowIds: [],
      availableWorkflows: [],
      editingExternalApiKeyId: null,
      newExternalApiKey: null,
      isManagingExternalApiKeys: false,
    });
  }

  override onMount(): void {
    window.addEventListener("popstate", this.handleSettingsUrlStateChange);
    window.addEventListener(
      "iteronix:workflows-changed",
      this.handleWorkflowCatalogChanged,
    );
    void this.hydrateRuntimeContext();
  }

  override onUnmount(): void {
    window.removeEventListener("popstate", this.handleSettingsUrlStateChange);
    window.removeEventListener(
      "iteronix:workflows-changed",
      this.handleWorkflowCatalogChanged,
    );
  }

  override render(): HTMLElement {
    return createElement(
      PageFrame,
      {
        className: "max-w-[1380px] gap-7 pb-28 md:pb-10",
      },
      [
        createElement(PageIntro, {
          title: "Settings",
          description:
            "Configure provider profiles, workflow guardrails, and notifications for every workflow.",
        }),
        createElement(PageTabs, {
          sticky: true,
          items: this.createTabItems(),
        }),
        this.renderActiveTab(),
        this.renderSaveBar(),
      ],
    );
  }

  private createTabItems(): ReadonlyArray<PageTabItem> {
    return [
      this.createTabItem("general"),
      this.createTabItem("provider"),
      this.createTabItem("limits"),
      this.createTabItem("notifications"),
      this.createTabItem("api"),
    ];
  }

  private createTabItem(tab: SettingsTab): PageTabItem {
    return {
      id: tab,
      label: TabLabel[tab],
      active: this.state.activeTab === tab,
      onClick: () => {
        this.writeSettingsUrlState({ activeTab: tab }, "replace");
        this.setState({ activeTab: tab });
        if (tab === "api") {
          void this.refreshExternalApiKeyContext();
        }
      },
    };
  }

  private renderActiveTab(): HTMLElement {
    if (this.state.activeTab === "general") {
      return this.renderGeneralTab();
    }

    if (this.state.activeTab === "provider") {
      return this.renderProviderTab();
    }

    if (this.state.activeTab === "limits") {
      return this.renderLimitsTab();
    }

    if (this.state.activeTab === "notifications") {
      return this.renderNotificationsTab();
    }

    return this.renderApiTab();
  }

  private renderGeneralTab(): HTMLElement {
    const runtimeProviders = this.state.runtimeProviders;

    return createElement("div", { className: "grid gap-6 lg:grid-cols-2" }, [
      createElement(
        "section",
        {
          className:
            "rounded-2xl border border-[#202832] bg-[#171c22] p-6 md:p-7",
        },
        [
          createElement(
            "div",
            { className: "flex items-start justify-between gap-3" },
            [
              createElement("div", { className: "flex flex-col gap-1" }, [
                createElement(
                  "h2",
                  { className: "text-lg font-semibold text-white" },
                  ["Workflow application"],
                ),
                createElement(
                  "p",
                  { className: "text-sm text-text-secondary" },
                  [
                    "Settings persist provider profiles in PostgreSQL so workflow execution can resolve them without additional setup.",
                  ],
                ),
              ]),
              createElement(StatusBadge, { status: "success" }, [
                "workflow scope ready",
              ]),
            ],
          ),
          createElement("dl", { className: "mt-5 grid gap-4 sm:grid-cols-2" }, [
            renderReadOnlyCell("Scope", "Workflow application"),
            renderReadOnlyCell("Storage", "PostgreSQL application state"),
            renderReadOnlyCell("Runtime mode", "Workflow only"),
            renderReadOnlyCell(
              "Runtime providers",
              String(runtimeProviders.length),
            ),
          ]),
          createElement("div", { className: "mt-5 flex flex-wrap gap-3" }, [
            createElement(Button, {
              variant: "ghost",
              size: "sm",
              onClick: () => {
                void this.hydrateRuntimeContext();
              },
              children: "Reload runtime",
            }),
          ]),
        ],
      ),
      createElement(
        "section",
        {
          className:
            "rounded-2xl border border-[#202832] bg-[#171c22] p-6 md:p-7",
        },
        [
          createElement(
            "div",
            { className: "flex items-start justify-between gap-3" },
            [
              createElement("div", { className: "flex flex-col gap-1" }, [
                createElement(
                  "h2",
                  { className: "text-lg font-semibold text-white" },
                  ["Persistence policy"],
                ),
                createElement(
                  "p",
                  { className: "text-sm text-text-secondary" },
                  [
                    "Provider profiles, workflow limits, and notifications persist in PostgreSQL. This browser automatically uses the colocated workflow service.",
                  ],
                ),
              ]),
              createElement(StatusBadge, { status: "info" }, ["web mode"]),
            ],
          ),
          createElement(
            "div",
            { className: "mt-5 grid gap-4 sm:grid-cols-2" },
            [
              renderReadOnlyCell(
                "Provider profiles",
                String(this.state.providerProfiles.length),
              ),
              renderReadOnlyCell(
                "Current namespace",
                this.state.profileId || DefaultSettingsProfileId,
              ),
              renderReadOnlyCell(
                "Sound notifications",
                this.state.notifications.soundEnabled ? "Enabled" : "Disabled",
              ),
              renderReadOnlyCell(
                "External calls",
                this.state.workflowLimits.externalCalls ? "Allowed" : "Blocked",
              ),
            ],
          ),
        ],
      ),
    ]);
  }

  private renderProviderTab(): HTMLElement {
    const selectedProfile = this.readSelectedProviderProfile();

    return createElement(
      "div",
      { className: "grid min-w-0 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]" },
      [
        createElement(
          "section",
          {
            className:
              "min-w-0 flex flex-col gap-5 rounded-2xl border border-[#202832] bg-[#171c22] p-5 md:p-7",
          },
          [
            createElement(
              "div",
              { className: "flex items-start justify-between gap-3" },
              [
                createElement("div", { className: "flex flex-col gap-1" }, [
                  createElement(
                    "h2",
                    { className: "text-lg font-semibold text-white" },
                    ["Provider profiles"],
                  ),
                  createElement(
                    "p",
                    { className: "text-sm text-text-secondary" },
                    [
                      "Create multiple reusable provider profiles. Workflows will choose among them later instead of activating a single global provider here.",
                    ],
                  ),
                ]),
              ],
            ),
            this.renderAddProfileButtons(),
            createElement("div", { className: "flex flex-col gap-2" }, [
              this.state.providerProfiles.length > 0
                ? this.state.providerProfiles.map((profile) =>
                    this.renderProviderProfileListItem(profile),
                  )
                : createElement(
                    "div",
                    {
                      className:
                        "rounded-lg border border-dashed border-border-dark px-4 py-6 text-sm text-text-secondary",
                    },
                    [
                      "No provider profiles yet. Add one from the buttons above.",
                    ],
                  ),
            ]),
          ],
        ),
        selectedProfile
          ? this.renderProviderProfileEditor(selectedProfile)
          : createElement(
              "section",
              {
                className:
                  "min-w-0 rounded-2xl border border-[#202832] bg-[#171c22] p-5 md:p-7",
              },
              [
                createElement(
                  "h2",
                  { className: "text-lg font-semibold text-white" },
                  ["Select a profile"],
                ),
                createElement(
                  "p",
                  { className: "mt-2 text-sm text-text-secondary" },
                  [
                    "Choose a provider profile from the left column to edit its model, endpoint or CLI parameters.",
                  ],
                ),
              ],
            ),
      ],
    );
  }

  private renderAddProfileButtons(): HTMLElement {
    return createElement("div", { className: "grid gap-2 sm:grid-cols-2" }, [
      this.renderAddProfileButton(ProviderKind.CodexCli),
      this.renderAddProfileButton(ProviderKind.OpenAI),
      this.renderAddProfileButton(ProviderKind.Anthropic),
      this.renderAddProfileButton(ProviderKind.Ollama),
      this.renderAddProfileButton(ProviderKind.Custom),
    ]);
  }

  private renderAddProfileButton(kind: ProviderKind): HTMLElement {
    return createElement(Button, {
      variant: "secondary",
      size: "sm",
      className: "justify-center",
      onClick: () => this.handleAddProviderProfile(kind),
      children: `Add ${ProviderKindLabel[kind]}`,
    });
  }

  private renderProviderProfileListItem(
    profile: ProviderProfileRecord,
  ): HTMLElement {
    const isSelected = this.state.selectedProviderId === profile.id;

    return createElement(
      "div",
      {
        className: `rounded-xl border px-3 py-3 transition-colors ${
          isSelected
            ? "border-primary bg-[#0f243b] shadow-[inset_0_0_0_1px_rgba(19,127,236,0.18)]"
            : "border-[#2b3644] bg-[#1a2129]"
        }`,
      },
      [
        createElement(
          "div",
          {
            className: "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start",
          },
          [
            createElement(
              "button",
              {
                type: "button",
                className: "flex min-w-0 flex-1 flex-col text-left",
                onClick: () => {
                  this.writeSettingsUrlState(
                    { selectedProviderId: profile.id },
                    "replace",
                  );
                  this.setState({ selectedProviderId: profile.id });
                },
              },
              [
                createElement(
                  "span",
                  { className: "truncate text-sm font-semibold text-white" },
                  [profile.name],
                ),
                createElement(
                  "span",
                  { className: "mt-1 truncate text-xs text-text-secondary" },
                  [
                    `${ProviderKindLabel[profile.providerKind]}${profile.modelId ? ` · ${profile.modelId}` : ""}`,
                  ],
                ),
              ],
            ),
            createElement(Button, {
              variant: "danger",
              size: "sm",
              className: "w-full justify-center sm:w-auto sm:self-start",
              onClick: () => this.handleRemoveProviderProfile(profile.id),
              children: "Remove",
            }),
          ],
        ),
      ],
    );
  }

  private renderProviderProfileEditor(
    profile: ProviderProfileRecord,
  ): HTMLElement {
    const runtimeAvailable = this.state.runtimeProviders.some(
      (provider) => provider.id === profile.providerKind,
    );

    return createElement(
      "section",
      {
        className:
          "min-w-0 flex flex-col gap-5 rounded-2xl border border-[#202832] bg-[#171c22] p-5 md:p-7",
      },
      [
        createElement(
          "div",
          { className: "flex flex-wrap items-start justify-between gap-3" },
          [
            createElement("div", { className: "flex flex-col gap-1" }, [
              createElement(
                "h2",
                { className: "text-lg font-semibold text-white" },
                [profile.name],
              ),
              createElement("p", { className: "text-sm text-text-secondary" }, [
                ProviderKindDescription[profile.providerKind],
              ]),
            ]),
            createElement(
              "div",
              {
                className:
                  "text-xs font-medium uppercase tracking-[0.16em] text-slate-500",
              },
              [runtimeAvailable ? "Runtime available" : "Server-backed"],
            ),
          ],
        ),
        createElement("div", { className: "grid gap-4 lg:grid-cols-2" }, [
          createElement(SettingsTextField, {
            label: "Profile name",
            value: profile.name,
            placeholder: "Planner profile",
            testId: "settings-provider-name",
            onChange: (value: string) =>
              this.handleProviderProfileTextChange(profile.id, "name", value),
          }),
          createElement(SettingsSelectField, {
            label: "Provider",
            value: profile.providerKind,
            testId: "settings-provider-kind",
            options: [
              {
                value: ProviderKind.CodexCli,
                label: ProviderKindLabel[ProviderKind.CodexCli],
              },
              {
                value: ProviderKind.OpenAI,
                label: ProviderKindLabel[ProviderKind.OpenAI],
              },
              {
                value: ProviderKind.Anthropic,
                label: ProviderKindLabel[ProviderKind.Anthropic],
              },
              {
                value: ProviderKind.Ollama,
                label: ProviderKindLabel[ProviderKind.Ollama],
              },
              {
                value: ProviderKind.Custom,
                label: ProviderKindLabel[ProviderKind.Custom],
              },
            ],
            onChange: (value: string) =>
              this.handleProviderKindChange(profile.id, value),
          }),
          createElement(SettingsTextField, {
            label: "Model",
            value: profile.modelId,
            placeholder: "Enter the model id used by flows",
            testId: "settings-provider-model",
            onChange: (value: string) =>
              this.handleProviderProfileTextChange(
                profile.id,
                "modelId",
                value,
              ),
          }),
          profile.providerKind === ProviderKind.CodexCli
            ? createElement(SettingsTextField, {
                label: "Command",
                value: profile.command,
                placeholder: "codex",
                testId: "settings-provider-command",
                onChange: (value: string) =>
                  this.handleProviderProfileTextChange(
                    profile.id,
                    "command",
                    value,
                  ),
              })
            : createElement(SettingsTextField, {
                label: "Endpoint URL",
                value: profile.endpointUrl,
                placeholder: "https://provider.example.com",
                testId: "settings-provider-endpoint",
                onChange: (value: string) =>
                  this.handleProviderProfileTextChange(
                    profile.id,
                    "endpointUrl",
                    value,
                  ),
              }),
          profile.providerKind === ProviderKind.CodexCli
            ? ""
            : createElement(SettingsTextField, {
                label: "API key env var",
                value: profile.apiKeyEnvVar,
                placeholder: "OPENAI_API_KEY",
                testId: "settings-provider-api-key-env-var",
                onChange: (value: string) =>
                  this.handleProviderProfileTextChange(
                    profile.id,
                    "apiKeyEnvVar",
                    value,
                  ),
              }),
          profile.providerKind === ProviderKind.CodexCli
            ? createElement(SettingsSelectField, {
                label: "Prompt mode",
                value: profile.promptMode,
                testId: "settings-provider-prompt-mode",
                options: [
                  { value: ProviderPromptMode.Stdin, label: "stdin" },
                  { value: ProviderPromptMode.Arg, label: "arg" },
                ],
                onChange: (value: string) =>
                  this.handleProviderPromptModeChange(profile.id, value),
              })
            : "",
        ]),
        createElement(
          "div",
          {
            className:
              "rounded-xl border border-[#2b3644] bg-[#1a2129] px-4 py-4 text-sm leading-6 text-text-secondary",
          },
          [
            profile.providerKind === ProviderKind.CodexCli
              ? "This Codex CLI profile will be pushed to the workflow backend on save so future workflow execution can resolve it server-side."
              : runtimeAvailable
                ? "This API profile persists through the server snapshot and syncs to the backend runtime store on save."
                : "This provider profile persists through the server snapshot. Add a matching backend runtime adapter if you want workflow execution support.",
          ],
        ),
      ],
    );
  }

  private renderLimitsTab(): HTMLElement {
    return createElement(
      "section",
      {
        className:
          "flex flex-col gap-5 rounded-2xl border border-[#202832] bg-[#171c22] p-6 md:p-7",
      },
      [
        createElement("div", { className: "flex flex-col gap-1" }, [
          createElement(
            "h2",
            { className: "text-lg font-semibold text-white" },
            ["Workflow limits"],
          ),
          createElement("p", { className: "text-sm text-text-secondary" }, [
            "Guardrails that apply before autonomous runs consume excessive time, loops or external access.",
          ]),
        ]),
        createElement("div", { className: "grid gap-4 lg:grid-cols-2" }, [
          createElement(SettingsNumberField, {
            label: "Maximum loops",
            value: this.state.workflowLimits.maxLoops,
            disabled: this.state.workflowLimits.infiniteLoops,
            testId: "settings-max-loops",
            onChange: (value: string) => this.handleMaxLoopsChange(value),
          }),
          createElement(SettingsToggleField, {
            label: "Infinite loops",
            description: "Allow autonomous execution without a hard loop cap.",
            checked: this.state.workflowLimits.infiniteLoops,
            testId: "settings-infinite-loops",
            onChange: (checked: boolean) =>
              this.setState({
                workflowLimits: {
                  ...this.state.workflowLimits,
                  infiniteLoops: checked,
                },
              }),
          }),
          createElement(SettingsToggleField, {
            label: "Allow external API calls",
            description:
              "Permit network access from tool executions and workflow steps.",
            checked: this.state.workflowLimits.externalCalls,
            testId: "settings-external-calls",
            onChange: (checked: boolean) =>
              this.setState({
                workflowLimits: {
                  ...this.state.workflowLimits,
                  externalCalls: checked,
                },
              }),
          }),
        ]),
      ],
    );
  }

  private renderNotificationsTab(): HTMLElement {
    return createElement(
      "section",
      {
        className:
          "flex flex-col gap-5 rounded-2xl border border-[#202832] bg-[#171c22] p-6 md:p-7",
      },
      [
        createElement("div", { className: "flex flex-col gap-1" }, [
          createElement(
            "h2",
            { className: "text-lg font-semibold text-white" },
            ["Notifications"],
          ),
          createElement("p", { className: "text-sm text-text-secondary" }, [
            "Keep browser-side alert preferences and webhook routing in sync with the current workstation.",
          ]),
        ]),
        createElement(SettingsToggleField, {
          label: "Completion sound",
          description: "Play a local confirmation tone when a run finishes.",
          checked: this.state.notifications.soundEnabled,
          testId: "settings-sound-enabled",
          onChange: (checked: boolean) =>
            this.setState({
              notifications: {
                ...this.state.notifications,
                soundEnabled: checked,
              },
            }),
        }),
        createElement(
          "div",
          {
            className:
              "grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end",
          },
          [
            createElement(SettingsTextField, {
              label: "Webhook URL",
              value: this.state.notifications.webhookUrl,
              placeholder: "https://hooks.example.com/iteronix",
              testId: "settings-webhook-url",
              onChange: (value: string) =>
                this.setState({
                  notifications: {
                    ...this.state.notifications,
                    webhookUrl: value,
                  },
                }),
            }),
            createElement(Button, {
              variant: "secondary",
              size: "sm",
              disabled:
                this.state.isTestingWebhook ||
                this.state.notifications.webhookUrl.trim().length === 0,
              onClick: () => {
                void this.handleTestWebhook();
              },
              children: this.state.isTestingWebhook
                ? "Testing"
                : "Test payload",
            }),
          ],
        ),
        createElement("p", { className: "text-xs text-text-secondary" }, [
          "Webhook tests send a JSON POST directly from the browser. If the destination blocks CORS, the test fails locally but the saved URL remains available for future server-side integrations.",
        ]),
      ],
    );
  }

  private renderApiTab(): HTMLElement {
    return createElement(
      "section",
      {
        className:
          "flex flex-col gap-5 rounded-2xl border border-[#202832] bg-[#171c22] p-6 md:p-7",
      },
      [
        createElement("div", { className: "flex flex-col gap-1" }, [
          createElement(
            "h2",
            { className: "text-lg font-semibold text-white" },
            ["External API access"],
          ),
          createElement("p", { className: "text-sm text-text-secondary" }, [
            "Create or update workflow-only API keys for external automation. Each secret is shown once and is never persisted in plaintext.",
          ]),
        ]),
        createElement("div", { className: "grid gap-4 lg:grid-cols-2" }, [
          createElement(SettingsTextField, {
            label: "Key name",
            value: this.state.apiKeyName,
            placeholder: "Deployment automation",
            testId: "settings-external-api-key-name",
            onChange: (apiKeyName: string) => this.setState({ apiKeyName }),
          }),
          createElement(SettingsSelectField, {
            label: "Workflow access",
            value: this.state.apiKeyScope,
            testId: "settings-external-api-key-scope",
            options: [
              {
                value: ExternalApiKeyScopeSelection.AllWorkflows,
                label: "All workflows",
              },
              {
                value: ExternalApiKeyScopeSelection.SelectedWorkflows,
                label: "Selected workflows",
              },
            ],
            onChange: (value: string) => {
              const apiKeyScope =
                value === ExternalApiKeyScopeSelection.SelectedWorkflows
                  ? ExternalApiKeyScopeSelection.SelectedWorkflows
                  : ExternalApiKeyScopeSelection.AllWorkflows;
              this.setState({
                apiKeyScope,
                apiKeyWorkflowIds:
                  apiKeyScope === ExternalApiKeyScopeSelection.AllWorkflows
                    ? []
                    : this.state.apiKeyWorkflowIds,
              });
            },
          }),
        ]),
        this.state.apiKeyScope ===
        ExternalApiKeyScopeSelection.SelectedWorkflows
          ? this.renderWorkflowScopeSelector()
          : "",
        createElement(Button, {
          variant: "primary",
          size: "sm",
          disabled:
            this.state.isManagingExternalApiKeys ||
            this.state.apiKeyName.trim().length === 0 ||
            (this.state.apiKeyScope ===
              ExternalApiKeyScopeSelection.SelectedWorkflows &&
              this.state.apiKeyWorkflowIds.length === 0),
          onClick: () => void this.handleSubmitExternalApiKey(),
          children: this.state.isManagingExternalApiKeys
            ? this.state.editingExternalApiKeyId
              ? "Saving"
              : "Creating"
            : this.state.editingExternalApiKeyId
              ? "Save changes"
              : "Create API key",
        }),
        this.state.editingExternalApiKeyId
          ? createElement(Button, {
              variant: "ghost",
              size: "sm",
              disabled: this.state.isManagingExternalApiKeys,
              onClick: () => this.handleCancelExternalApiKeyEdit(),
              children: "Cancel edit",
            })
          : "",
        this.state.newExternalApiKey
          ? createElement(
              "div",
              {
                className:
                  "rounded-lg border border-amber-500/50 bg-amber-500/10 p-4",
              },
              [
                createElement(
                  "p",
                  { className: "text-sm font-semibold text-white" },
                  ["Copy this key now. It cannot be shown again."],
                ),
                createElement(
                  "code",
                  {
                    className: "mt-2 block break-all text-xs text-amber-100",
                    "data-testid": "settings-new-external-api-key",
                  },
                  [this.state.newExternalApiKey],
                ),
                createElement(Button, {
                  variant: "secondary",
                  size: "sm",
                  onClick: () =>
                    void navigator.clipboard.writeText(
                      this.state.newExternalApiKey ?? "",
                    ),
                  children: "Copy key",
                }),
              ],
            )
          : "",
        createElement(
          "div",
          { className: "flex flex-col gap-2" },
          this.state.externalApiKeys.map((key) =>
            createElement(
              "div",
              {
                key: key.id,
                className:
                  "flex items-center justify-between gap-4 rounded-lg border border-border-dark px-4 py-3",
              },
              [
                createElement("div", {}, [
                  createElement(
                    "p",
                    { className: "text-sm font-semibold text-white" },
                    [key.name],
                  ),
                  createElement(
                    "p",
                    { className: "text-xs text-text-secondary" },
                    [
                      `${key.scope.kind === "all_workflows" ? "All workflows" : `${key.scope.workflowIds.length.toString()} selected workflow(s)`} · last used ${key.lastUsedAt ?? "never"}${key.revokedAt ? " · revoked" : ""}`,
                    ],
                  ),
                ]),
                createElement("div", { className: "flex shrink-0 gap-2" }, [
                  createElement(Button, {
                    variant: "secondary",
                    size: "sm",
                    disabled:
                      Boolean(key.revokedAt) ||
                      this.state.isManagingExternalApiKeys,
                    onClick: () => this.handleEditExternalApiKey(key),
                    children: "Edit",
                  }),
                  createElement(Button, {
                    variant: "danger",
                    size: "sm",
                    disabled:
                      Boolean(key.revokedAt) ||
                      this.state.isManagingExternalApiKeys,
                    onClick: () => void this.handleRevokeExternalApiKey(key.id),
                    children: key.revokedAt ? "Revoked" : "Revoke",
                  }),
                ]),
              ],
            ),
          ),
        ),
      ],
    );
  }

  private renderWorkflowScopeSelector(): HTMLElement {
    const selectedWorkflowIds = new Set(this.state.apiKeyWorkflowIds);
    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement(
        "span",
        { className: "text-[13px] font-medium text-slate-100" },
        ["Allowed workflows"],
      ),
      this.state.availableWorkflows.length === 0
        ? createElement("p", { className: "text-sm text-text-secondary" }, [
            "No workflows are available. Create one before making a limited key.",
          ])
        : createElement(
            "select",
            {
              multiple: true,
              size: Math.min(
                Math.max(this.state.availableWorkflows.length, 3),
                6,
              ),
              "data-testid": "settings-external-api-key-workflows",
              className:
                "min-h-28 w-full rounded-xl border border-[#2b3644] bg-[#1a2129] px-3.5 py-2.5 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              onChange: (event: Event) => {
                const target = event.target;
                if (target instanceof HTMLSelectElement) {
                  this.setState({
                    apiKeyWorkflowIds: Array.from(
                      target.selectedOptions,
                      (option) => option.value,
                    ),
                  });
                }
              },
            },
            this.state.availableWorkflows.map((workflow) =>
              createElement(
                "option",
                {
                  value: workflow.id,
                  selected: selectedWorkflowIds.has(workflow.id),
                },
                [workflow.name],
              ),
            ),
          ),
      createElement("span", { className: "text-xs text-text-secondary" }, [
        "Choose one or more workflows. This list refreshes when the workflow catalog changes.",
      ]),
    ]);
  }

  private async handleSubmitExternalApiKey(): Promise<void> {
    if (this.state.editingExternalApiKeyId) {
      await this.handleUpdateExternalApiKey(this.state.editingExternalApiKeyId);
      return;
    }

    await this.handleCreateExternalApiKey();
  }

  private async handleCreateExternalApiKey(): Promise<void> {
    this.setState({ isManagingExternalApiKeys: true });
    try {
      const created = await this.settingsClient.createExternalApiKey({
        name: this.state.apiKeyName,
        scope: readExternalApiKeyScope(
          this.state.apiKeyScope,
          this.state.apiKeyWorkflowIds,
        ),
      });
      this.setState({
        externalApiKeys: [...this.state.externalApiKeys, created.key],
        apiKeyName: "",
        apiKeyScope: ExternalApiKeyScopeSelection.AllWorkflows,
        apiKeyWorkflowIds: [],
        newExternalApiKey: created.plaintextKey,
        isManagingExternalApiKeys: false,
      });
    } catch (error) {
      this.setState({
        isManagingExternalApiKeys: false,
      });
      this.pushToast(
        "error",
        toErrorMessage(error, "Could not create external API key."),
      );
    }
  }

  private async handleUpdateExternalApiKey(keyId: string): Promise<void> {
    this.setState({ isManagingExternalApiKeys: true });
    try {
      const updated = await this.settingsClient.updateExternalApiKey({
        keyId,
        name: this.state.apiKeyName,
        scope: readExternalApiKeyScope(
          this.state.apiKeyScope,
          this.state.apiKeyWorkflowIds,
        ),
      });
      this.setState({
        externalApiKeys: this.state.externalApiKeys.map((key) =>
          key.id === updated.id ? updated : key,
        ),
        apiKeyName: "",
        apiKeyScope: ExternalApiKeyScopeSelection.AllWorkflows,
        apiKeyWorkflowIds: [],
        editingExternalApiKeyId: null,
        isManagingExternalApiKeys: false,
      });
    } catch (error) {
      this.setState({ isManagingExternalApiKeys: false });
      this.pushToast(
        "error",
        toErrorMessage(error, "Could not update external API key."),
      );
    }
  }

  private handleEditExternalApiKey(key: ExternalApiKeyRecord): void {
    this.setState({
      apiKeyName: key.name,
      apiKeyScope:
        key.scope.kind === "selected_workflows"
          ? ExternalApiKeyScopeSelection.SelectedWorkflows
          : ExternalApiKeyScopeSelection.AllWorkflows,
      apiKeyWorkflowIds:
        key.scope.kind === "selected_workflows" ? key.scope.workflowIds : [],
      editingExternalApiKeyId: key.id,
      newExternalApiKey: null,
    });
  }

  private handleCancelExternalApiKeyEdit(): void {
    this.setState({
      apiKeyName: "",
      apiKeyScope: ExternalApiKeyScopeSelection.AllWorkflows,
      apiKeyWorkflowIds: [],
      editingExternalApiKeyId: null,
    });
  }

  private async handleRevokeExternalApiKey(keyId: string): Promise<void> {
    this.setState({ isManagingExternalApiKeys: true });
    try {
      const revoked = await this.settingsClient.revokeExternalApiKey({ keyId });
      this.setState({
        externalApiKeys: this.state.externalApiKeys.map((key) =>
          key.id === keyId ? revoked : key,
        ),
        isManagingExternalApiKeys: false,
      });
    } catch (error) {
      this.setState({
        isManagingExternalApiKeys: false,
      });
      this.pushToast(
        "error",
        toErrorMessage(error, "Could not revoke external API key."),
      );
    }
  }

  private renderSaveBar(): HTMLElement {
    return createElement(
      "div",
      {
        className:
          "sticky bottom-4 z-20 mt-1 flex w-full flex-col gap-3 rounded-xl border border-[#202832] bg-[#171c22] px-4 py-4 shadow-[0_8px_18px_rgba(15,23,32,0.12)] md:w-auto md:flex-row md:items-center md:justify-end md:px-6" +
          " self-stretch md:self-end md:min-w-[420px]",
      },
      [
        createElement(Button, {
          variant: "danger",
          className: "w-full justify-center md:w-auto",
          onClick: () => {
            void this.handleResetDefaults();
          },
          children: "Reset defaults",
        }),
        createElement(Button, {
          variant: "primary",
          icon: "save",
          disabled: this.state.isSaving,
          className: "w-full justify-center md:w-auto",
          onClick: () => {
            void this.handleSave();
          },
          children: this.state.isSaving ? "Saving" : "Save changes",
        }),
      ],
    );
  }

  private async hydrateRuntimeContext(): Promise<void> {
    let runtimeProviders: ReadonlyArray<RuntimeProviderRecord> =
      this.state.runtimeProviders;
    let message: string | null = null;

    try {
      const snapshot = await this.settingsClient.load();
      hydrateSettingsSnapshot(snapshot);
      const urlState =
        typeof window === "undefined"
          ? null
          : readSettingsUrlStateFromLocation(window.location);
      const selectedProviderId = resolveSettingsProviderSelection(
        urlState?.selectedProviderId ?? this.state.selectedProviderId,
        snapshot.providerProfiles,
      );
      this.setState({
        profileId: snapshot.profileId,
        providerProfiles: snapshot.providerProfiles,
        selectedProviderId,
        workflowLimits: snapshot.workflowLimits,
        notifications: snapshot.notifications,
      });
      const providerResponse = await this.settingsClient.listProviders();
      runtimeProviders = providerResponse.providers;
      await this.refreshExternalApiKeyContext();
    } catch (error) {
      message = toErrorMessage(error, "Could not load runtime providers.");
    }

    this.setState({
      runtimeProviders,
    });

    if (message) {
      this.pushToast("error", message);
    }
  }

  private async refreshExternalApiKeyContext(): Promise<void> {
    try {
      const [externalApiKeys, availableWorkflows] = await Promise.all([
        this.settingsClient.listExternalApiKeys(),
        this.workflowClient.listDefinitions(),
      ]);
      const availableWorkflowIds = new Set(
        availableWorkflows.map((workflow) => workflow.id),
      );
      this.setState({
        externalApiKeys,
        availableWorkflows: availableWorkflows.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
        })),
        apiKeyWorkflowIds: this.state.apiKeyWorkflowIds.filter((workflowId) =>
          availableWorkflowIds.has(workflowId),
        ),
      });
    } catch (error) {
      this.pushToast(
        "error",
        toErrorMessage(
          error,
          "Could not refresh workflows for API key access.",
        ),
      );
    }
  }

  private handleAddProviderProfile(kind: ProviderKind): void {
    const profile = createProviderProfile(kind);
    this.writeSettingsUrlState(
      { activeTab: "provider", selectedProviderId: profile.id },
      "replace",
    );
    this.setState({
      activeTab: "provider",
      providerProfiles: [...this.state.providerProfiles, profile],
      selectedProviderId: profile.id,
    });
  }

  private handleRemoveProviderProfile(profileId: string): void {
    const nextProfiles = this.state.providerProfiles.filter(
      (profile) => profile.id !== profileId,
    );
    const selectedProviderId =
      this.state.selectedProviderId === profileId
        ? (nextProfiles[0]?.id ?? null)
        : this.state.selectedProviderId;

    this.writeSettingsUrlState({ selectedProviderId }, "replace");
    this.setState({
      providerProfiles: nextProfiles,
      selectedProviderId,
    });
  }

  private handleProviderProfileTextChange(
    profileId: string,
    key: "name" | "modelId" | "endpointUrl" | "apiKeyEnvVar" | "command",
    value: string,
  ): void {
    const nextProfiles = this.state.providerProfiles.map((profile) =>
      profile.id === profileId
        ? updateProviderProfile(profile, { [key]: value })
        : profile,
    );

    this.setState({
      providerProfiles: nextProfiles,
    });
  }

  private handleProviderKindChange(profileId: string, value: string): void {
    const kind = readProviderKind(value);
    if (!kind) {
      return;
    }

    const nextProfiles = this.state.providerProfiles.map((profile) =>
      profile.id === profileId
        ? updateProviderProfile(profile, { providerKind: kind, modelId: "" })
        : profile,
    );

    this.setState({ providerProfiles: nextProfiles });
  }

  private handleProviderPromptModeChange(
    profileId: string,
    value: string,
  ): void {
    const promptMode = readPromptMode(value);
    if (!promptMode) {
      return;
    }

    const nextProfiles = this.state.providerProfiles.map((profile) =>
      profile.id === profileId
        ? updateProviderProfile(profile, { promptMode })
        : profile,
    );

    this.setState({ providerProfiles: nextProfiles });
  }

  private handleMaxLoopsChange(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.setState({
      workflowLimits: {
        ...this.state.workflowLimits,
        maxLoops: parsed,
      },
    });
  }

  private async handleTestWebhook(): Promise<void> {
    this.setState({
      isTestingWebhook: true,
    });

    try {
      const response = await fetch(this.state.notifications.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...TestWebhookPayload,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned status ${response.status}`);
      }

      this.pushToast("success", "Webhook test payload delivered successfully.");
    } catch (error) {
      this.pushToast("error", toErrorMessage(error, "Webhook test failed."));
    } finally {
      this.setState({
        isTestingWebhook: false,
      });
    }
  }

  private async handleSave(): Promise<void> {
    if (this.state.isSaving) {
      return;
    }

    this.setState({
      isSaving: true,
    });

    try {
      const snapshot: SettingsSnapshot = {
        profileId: this.state.profileId || DefaultSettingsProfileId,
        providerProfiles: this.state.providerProfiles,
        workflowLimits: this.state.workflowLimits,
        notifications: this.state.notifications,
      };

      const persistedSettings = await this.settingsClient.update(snapshot);
      hydrateSettingsSnapshot(persistedSettings);
      const selectedProviderId = persistedSettings.providerProfiles.some(
        (profile) => profile.id === this.state.selectedProviderId,
      )
        ? this.state.selectedProviderId
        : (persistedSettings.providerProfiles[0]?.id ?? null);
      this.setState({
        profileId: persistedSettings.profileId,
        providerProfiles: persistedSettings.providerProfiles,
        selectedProviderId,
        workflowLimits: persistedSettings.workflowLimits,
        notifications: persistedSettings.notifications,
      });

      let syncedCount = 0;
      const syncRequests = createProviderSyncRequests(
        this.state.providerProfiles,
      );

      for (const request of syncRequests) {
        await this.settingsClient.updateProviderSettings({
          profileId: request.profileId,
          providerId: request.providerId,
          config: request.config,
        });
        syncedCount += 1;
      }

      const localOnlyCount = this.state.providerProfiles.length - syncedCount;
      this.pushToast(
        "success",
        `Settings saved. ${this.state.providerProfiles.length} profile${this.state.providerProfiles.length === 1 ? "" : "s"} persisted in PostgreSQL, with ${syncedCount} runtime sync${syncedCount === 1 ? "" : "s"} and ${localOnlyCount} snapshot-only profile${localOnlyCount === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      this.pushToast(
        "error",
        toErrorMessage(error, "Could not save settings."),
      );
    } finally {
      this.setState({
        isSaving: false,
      });
    }
  }

  private async handleResetDefaults(): Promise<void> {
    const confirmed = window.confirm(
      "Reset provider profiles, workflow limits, notifications and API access to their defaults?",
    );
    if (!confirmed) {
      return;
    }

    const snapshot = createDefaultSettingsSnapshot();

    try {
      const persistedSettings = await this.settingsClient.update(snapshot);
      hydrateSettingsSnapshot(persistedSettings);
      this.setState({
        activeTab: "provider",
        profileId: persistedSettings.profileId,
        providerProfiles: persistedSettings.providerProfiles,
        selectedProviderId: persistedSettings.providerProfiles[0]?.id ?? null,
        workflowLimits: persistedSettings.workflowLimits,
        notifications: persistedSettings.notifications,
      });
      this.writeSettingsUrlState(
        {
          activeTab: "provider",
          selectedProviderId: persistedSettings.providerProfiles[0]?.id ?? null,
        },
        "replace",
      );
      this.pushToast("success", "Settings restored to defaults.");
    } catch (error) {
      this.pushToast(
        "error",
        toErrorMessage(error, "Could not reset settings."),
      );
    }
  }

  private pushToast(kind: ToastKind, message: string): void {
    showGlobalToast(kind, message);
  }

  private readonly handleSettingsUrlStateChange = (): void => {
    const urlState = readSettingsUrlStateFromLocation(window.location);
    const selectedProviderId = resolveSettingsProviderSelection(
      urlState.selectedProviderId,
      this.state.providerProfiles,
    );

    this.setState({
      activeTab: urlState.activeTab ?? this.state.activeTab,
      selectedProviderId,
    });
  };

  private readonly handleWorkflowCatalogChanged = (): void => {
    void this.refreshExternalApiKeyContext();
  };

  private writeSettingsUrlState(
    patch: Parameters<typeof applySettingsUrlPatch>[1],
    mode: "push" | "replace",
  ): void {
    if (typeof window === "undefined") {
      return;
    }

    writeBrowserUrlState(
      applySettingsUrlPatch(
        `${window.location.pathname}${window.location.search}`,
        patch,
      ),
      mode,
    );
  }

  private readSelectedProviderProfile(): ProviderProfileRecord | null {
    const selectedProviderId = this.state.selectedProviderId;
    if (!selectedProviderId) {
      return null;
    }

    return (
      this.state.providerProfiles.find(
        (profile) => profile.id === selectedProviderId,
      ) ?? null
    );
  }
}

const renderReadOnlyCell = (label: string, value: string): HTMLElement =>
  createElement(
    "div",
    {
      className: "rounded-xl border border-[#2b3644] bg-[#1a2129] px-4 py-3.5",
    },
    [
      createElement(
        "dt",
        { className: "text-xs uppercase tracking-wide text-text-secondary" },
        [label],
      ),
      createElement(
        "dd",
        { className: "mt-2 text-sm font-medium text-white break-all" },
        [value],
      ),
    ],
  );

const toErrorMessage = (value: unknown, fallback: string): string => {
  if (value instanceof Error && value.message.trim().length > 0) {
    return value.message;
  }

  return fallback;
};

const resolveSettingsProviderSelection = (
  selectedProviderId: string | null | undefined,
  profiles: ReadonlyArray<ProviderProfileRecord>,
): string | null => {
  if (
    selectedProviderId &&
    profiles.some((profile) => profile.id === selectedProviderId)
  ) {
    return selectedProviderId;
  }

  return profiles[0]?.id ?? null;
};

const readProviderKind = (value: string): ProviderKind | null => {
  if (
    value === ProviderKind.CodexCli ||
    value === ProviderKind.OpenAI ||
    value === ProviderKind.Anthropic ||
    value === ProviderKind.Ollama ||
    value === ProviderKind.Custom
  ) {
    return value;
  }

  return null;
};

const readPromptMode = (value: string): ProviderPromptMode | null => {
  if (value === ProviderPromptMode.Arg || value === ProviderPromptMode.Stdin) {
    return value;
  }

  return null;
};
