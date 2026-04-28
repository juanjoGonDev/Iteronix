import { Button } from "../components/Button.js";
import { StatusBadge } from "../components/Card.js";
import { Component, createElement, type ComponentProps } from "../shared/Component.js";
import { ROUTES } from "../shared/constants.js";
import { type ProjectSessionState, readProjectSession } from "../shared/project-session.js";
import {
  DefaultServerConnection,
  readServerConnection,
  writeServerConnection,
  type ServerConnection
} from "../shared/server-config.js";
import {
  DefaultSettingsProfileId,
  createSettingsStorage,
  type NotificationsSettings,
  type SettingsSnapshot,
  type WorkflowLimitsSettings
} from "../shared/settings-storage.js";
import {
  createSettingsClient,
  type RuntimeProviderRecord
} from "../shared/settings-client.js";
import { router } from "../shared/Router.js";
import type { ProjectRecord } from "../shared/workbench-types.js";
import {
  ProviderKind,
  ProviderPromptMode,
  createProviderProfile,
  createProviderSyncRequests,
  updateProviderProfile,
  type ProviderProfileRecord
} from "./settings-state.js";

type SettingsTab = "general" | "provider" | "limits" | "notifications" | "api";

interface SettingsScreenState {
  activeTab: SettingsTab;
  profileId: string;
  providerProfiles: ReadonlyArray<ProviderProfileRecord>;
  selectedProviderId: string | null;
  workflowLimits: WorkflowLimitsSettings;
  notifications: NotificationsSettings;
  serverConnection: ServerConnection;
  currentProject: ProjectRecord | null;
  projectSession: ProjectSessionState;
  runtimeProviders: ReadonlyArray<RuntimeProviderRecord>;
  sessionSecrets: Record<string, string>;
  errorMessage: string | null;
  noticeMessage: string | null;
  isSaving: boolean;
  isTestingConnection: boolean;
  isTestingWebhook: boolean;
}

const TabLabel: Record<SettingsTab, string> = {
  general: "General",
  provider: "Providers",
  limits: "Workflow Limits",
  notifications: "Notifications",
  api: "API Access"
};

const ProviderKindLabel: Record<ProviderKind, string> = {
  [ProviderKind.CodexCli]: "Codex CLI",
  [ProviderKind.OpenAI]: "OpenAI",
  [ProviderKind.Anthropic]: "Anthropic",
  [ProviderKind.Ollama]: "Ollama"
};

const ProviderKindDescription: Record<ProviderKind, string> = {
  [ProviderKind.CodexCli]: "CLI provider registered in the current backend runtime.",
  [ProviderKind.OpenAI]: "API-based profile saved locally for future workflow selection.",
  [ProviderKind.Anthropic]: "API-based profile saved locally for future workflow selection.",
  [ProviderKind.Ollama]: "Local inference profile saved locally for future workflow selection."
};

const TestWebhookPayload = {
  event: "iteronix.settings.test",
  source: "settings-screen"
} as const;

export class SettingsScreen extends Component<ComponentProps, SettingsScreenState> {
  private readonly settingsStorage = createSettingsStorage();
  private readonly settingsClient = createSettingsClient();

  constructor(props: ComponentProps = {}) {
    const snapshot = createSettingsStorage().load();
    const selectedProviderId = snapshot.providerProfiles[0]?.id ?? null;

    super(props, {
      activeTab: "provider",
      profileId: snapshot.profileId,
      providerProfiles: snapshot.providerProfiles,
      selectedProviderId,
      workflowLimits: snapshot.workflowLimits,
      notifications: snapshot.notifications,
      serverConnection: readServerConnection(),
      currentProject: null,
      projectSession: readProjectSession(),
      runtimeProviders: [],
      sessionSecrets: {},
      errorMessage: null,
      noticeMessage: null,
      isSaving: false,
      isTestingConnection: false,
      isTestingWebhook: false
    });
  }

  override onMount(): void {
    void this.hydrateRuntimeContext();
  }

  override render(): HTMLElement {
    return createElement("div", {
      className: "mx-auto flex w-full max-w-[1280px] flex-col gap-6 px-4 py-6 md:px-6 lg:px-8"
    }, [
      this.renderHeader(),
      this.renderMessages(),
      this.renderTabs(),
      this.renderActiveTab(),
      this.renderSaveBar()
    ]);
  }

  private renderHeader(): HTMLElement {
    return createElement("div", { className: "flex flex-col gap-2" }, [
      createElement("h1", { className: "text-3xl font-semibold text-white" }, ["Settings"]),
      createElement("p", { className: "max-w-3xl text-sm leading-6 text-text-secondary" }, [
        "Configure provider profiles, workflow guardrails, notifications, and the server connection used by the web workbench."
      ])
    ]);
  }

  private renderMessages(): HTMLElement {
    if (!this.state.errorMessage && !this.state.noticeMessage) {
      return createElement("div", {});
    }

    return createElement("div", { className: "flex flex-col gap-3" }, [
      this.state.errorMessage
        ? createElement("div", {
            className: "rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          }, [this.state.errorMessage])
        : "",
      this.state.noticeMessage
        ? createElement("div", {
            className: "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          }, [this.state.noticeMessage])
        : ""
    ]);
  }

  private renderTabs(): HTMLElement {
    return createElement("div", { className: "border-b border-border-dark" }, [
      createElement("div", { className: "flex gap-6 overflow-x-auto pb-1" }, [
        this.renderTab("general"),
        this.renderTab("provider"),
        this.renderTab("limits"),
        this.renderTab("notifications"),
        this.renderTab("api")
      ])
    ]);
  }

  private renderTab(tab: SettingsTab): HTMLElement {
    const isActive = this.state.activeTab === tab;

    return createElement("button", {
      type: "button",
      className: `border-b-2 pb-3 text-sm font-semibold whitespace-nowrap transition-colors ${
        isActive ? "border-white text-white" : "border-transparent text-text-secondary hover:text-white"
      }`,
      onClick: () => this.setState({ activeTab: tab })
    }, [TabLabel[tab]]);
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
    const currentProject = this.state.currentProject;
    const runtimeProviders = this.state.runtimeProviders;

    return createElement("div", { className: "grid gap-6 lg:grid-cols-2" }, [
      createElement("section", {
        className: "rounded-xl border border-border-dark bg-surface-dark p-5"
      }, [
        createElement("div", { className: "flex items-start justify-between gap-3" }, [
          createElement("div", { className: "flex flex-col gap-1" }, [
            createElement("h2", { className: "text-lg font-semibold text-white" }, ["Workspace context"]),
            createElement("p", { className: "text-sm text-text-secondary" }, [
              "Settings read the active project session so provider profiles can later be reused by workflows without hardcoding a single provider."
            ])
          ]),
          createElement(StatusBadge, { status: currentProject ? "success" : "warning" }, [
            currentProject ? "project ready" : "project missing"
          ])
        ]),
        createElement("dl", { className: "mt-5 grid gap-4 sm:grid-cols-2" }, [
          renderReadOnlyCell("Project", currentProject?.name ?? "No project selected"),
          renderReadOnlyCell(
            "Root path",
            currentProject?.rootPath ?? (this.state.projectSession.projectRootPath || "Not set")
          ),
          renderReadOnlyCell("Recent projects", String(this.state.projectSession.recentProjects.length)),
          renderReadOnlyCell("Runtime providers", String(runtimeProviders.length))
        ]),
        createElement("div", { className: "mt-5 flex flex-wrap gap-3" }, [
          createElement(Button, {
            variant: "secondary",
            size: "sm",
            onClick: () => router.navigate(ROUTES.PROJECTS),
            children: currentProject ? "Change project" : "Open project"
          }),
          createElement(Button, {
            variant: "ghost",
            size: "sm",
            onClick: () => {
              void this.hydrateRuntimeContext();
            },
            children: "Reload runtime"
          })
        ])
      ]),
      createElement("section", {
        className: "rounded-xl border border-border-dark bg-surface-dark p-5"
      }, [
        createElement("div", { className: "flex items-start justify-between gap-3" }, [
          createElement("div", { className: "flex flex-col gap-1" }, [
            createElement("h2", { className: "text-lg font-semibold text-white" }, ["Persistence policy"]),
            createElement("p", { className: "text-sm text-text-secondary" }, [
              "Provider profiles, workflow limits and notifications persist locally. Server URL and auth token reuse the existing app connection contract. Secrets remain session-only in the browser."
            ])
          ]),
          createElement(StatusBadge, { status: "info" }, ["web mode"])
        ]),
        createElement("div", { className: "mt-5 grid gap-4 sm:grid-cols-2" }, [
          renderReadOnlyCell("Provider profiles", String(this.state.providerProfiles.length)),
          renderReadOnlyCell("Current namespace", this.state.profileId || DefaultSettingsProfileId),
          renderReadOnlyCell("Sound notifications", this.state.notifications.soundEnabled ? "Enabled" : "Disabled"),
          renderReadOnlyCell("External calls", this.state.workflowLimits.externalCalls ? "Allowed" : "Blocked")
        ]),
        createElement("div", {
          className: "mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        }, [
          "API keys are intentionally not written to local storage in browser mode. Keep them in the current session only until a secure secret adapter exists for web."
        ])
      ])
    ]);
  }

  private renderProviderTab(): HTMLElement {
    const selectedProfile = this.readSelectedProviderProfile();

    return createElement("div", { className: "grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]" }, [
      createElement("section", {
        className: "flex flex-col gap-4 rounded-xl border border-border-dark bg-surface-dark p-5"
      }, [
        createElement("div", { className: "flex items-start justify-between gap-3" }, [
          createElement("div", { className: "flex flex-col gap-1" }, [
            createElement("h2", { className: "text-lg font-semibold text-white" }, ["Provider profiles"]),
            createElement("p", { className: "text-sm text-text-secondary" }, [
              "Create multiple reusable provider profiles. Workflows will choose among them later instead of activating a single global provider here."
            ])
          ]),
          createElement(StatusBadge, { status: "info" }, [`${this.state.providerProfiles.length} configured`])
        ]),
        this.renderAddProfileButtons(),
        createElement("div", { className: "flex flex-col gap-2" }, [
          this.state.providerProfiles.length > 0
            ? this.state.providerProfiles.map((profile) => this.renderProviderProfileListItem(profile))
            : createElement("div", {
                className: "rounded-lg border border-dashed border-border-dark px-4 py-6 text-sm text-text-secondary"
              }, ["No provider profiles yet. Add one from the buttons above."])
        ])
      ]),
      selectedProfile
        ? this.renderProviderProfileEditor(selectedProfile)
        : createElement("section", {
            className: "rounded-xl border border-border-dark bg-surface-dark p-5"
          }, [
            createElement("h2", { className: "text-lg font-semibold text-white" }, ["Select a profile"]),
            createElement("p", { className: "mt-2 text-sm text-text-secondary" }, [
              "Choose a provider profile from the left column to edit its model, endpoint or CLI parameters."
            ])
          ])
    ]);
  }

  private renderAddProfileButtons(): HTMLElement {
    return createElement("div", { className: "flex flex-wrap gap-2" }, [
      this.renderAddProfileButton(ProviderKind.CodexCli),
      this.renderAddProfileButton(ProviderKind.OpenAI),
      this.renderAddProfileButton(ProviderKind.Anthropic),
      this.renderAddProfileButton(ProviderKind.Ollama)
    ]);
  }

  private renderAddProfileButton(kind: ProviderKind): HTMLElement {
    return createElement(Button, {
      variant: "secondary",
      size: "sm",
      onClick: () => this.handleAddProviderProfile(kind),
      children: `Add ${ProviderKindLabel[kind]}`
    });
  }

  private renderProviderProfileListItem(profile: ProviderProfileRecord): HTMLElement {
    const isSelected = this.state.selectedProviderId === profile.id;

    return createElement("div", {
      className: `rounded-lg border px-3 py-3 transition-colors ${
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border-dark bg-background-dark/40"
      }`
    }, [
      createElement("div", { className: "flex items-start gap-3" }, [
        createElement("button", {
          type: "button",
          className: "flex min-w-0 flex-1 flex-col text-left",
          onClick: () => this.setState({ selectedProviderId: profile.id })
        }, [
          createElement("span", { className: "truncate text-sm font-semibold text-white" }, [profile.name]),
          createElement("span", { className: "mt-1 truncate text-xs text-text-secondary" }, [
            `${ProviderKindLabel[profile.providerKind]}${profile.modelId ? ` · ${profile.modelId}` : ""}`
          ])
        ]),
        createElement(StatusBadge, {
          status: profile.providerKind === ProviderKind.CodexCli ? "success" : "info"
        }, [profile.providerKind === ProviderKind.CodexCli ? "syncable" : "local"]),
        createElement(Button, {
          variant: "ghost",
          size: "sm",
          onClick: () => this.handleRemoveProviderProfile(profile.id),
          children: "Remove"
        })
      ])
    ]);
  }

  private renderProviderProfileEditor(profile: ProviderProfileRecord): HTMLElement {
    const apiKeyValue = this.state.sessionSecrets[profile.id] ?? "";
    const runtimeAvailable = this.state.runtimeProviders.some(
      (provider) => provider.id === profile.providerKind
    );

    return createElement("section", {
      className: "flex flex-col gap-5 rounded-xl border border-border-dark bg-surface-dark p-5"
    }, [
      createElement("div", { className: "flex flex-wrap items-start justify-between gap-3" }, [
        createElement("div", { className: "flex flex-col gap-1" }, [
          createElement("h2", { className: "text-lg font-semibold text-white" }, [profile.name]),
          createElement("p", { className: "text-sm text-text-secondary" }, [
            ProviderKindDescription[profile.providerKind]
          ])
        ]),
        createElement("div", { className: "flex items-center gap-2" }, [
          createElement(StatusBadge, {
            status: runtimeAvailable ? "success" : "warning"
          }, [runtimeAvailable ? "runtime available" : "local only"]),
          profile.providerKind === ProviderKind.CodexCli && this.state.currentProject
            ? createElement(StatusBadge, { status: "info" }, ["sync on save"])
            : ""
        ])
      ]),
      createElement("div", { className: "grid gap-4 lg:grid-cols-2" }, [
        renderTextField({
          label: "Profile name",
          value: profile.name,
          placeholder: "Planner profile",
          testId: "settings-provider-name",
          onChange: (value) => this.handleProviderProfileTextChange(profile.id, "name", value)
        }),
        renderSelectField({
          label: "Provider",
          value: profile.providerKind,
          testId: "settings-provider-kind",
          options: [
            { value: ProviderKind.CodexCli, label: ProviderKindLabel[ProviderKind.CodexCli] },
            { value: ProviderKind.OpenAI, label: ProviderKindLabel[ProviderKind.OpenAI] },
            { value: ProviderKind.Anthropic, label: ProviderKindLabel[ProviderKind.Anthropic] },
            { value: ProviderKind.Ollama, label: ProviderKindLabel[ProviderKind.Ollama] }
          ],
          onChange: (value) => this.handleProviderKindChange(profile.id, value)
        }),
        renderTextField({
          label: "Model",
          value: profile.modelId,
          placeholder: "Enter the model id used by flows",
          testId: "settings-provider-model",
          onChange: (value) => this.handleProviderProfileTextChange(profile.id, "modelId", value)
        }),
        profile.providerKind === ProviderKind.CodexCli
          ? renderTextField({
              label: "Command",
              value: profile.command,
              placeholder: "codex",
              testId: "settings-provider-command",
              onChange: (value) => this.handleProviderProfileTextChange(profile.id, "command", value)
            })
          : renderTextField({
              label: "Endpoint URL",
              value: profile.endpointUrl,
              placeholder: "https://provider.example.com",
              testId: "settings-provider-endpoint",
              onChange: (value) => this.handleProviderProfileTextChange(profile.id, "endpointUrl", value)
            }),
        profile.providerKind === ProviderKind.CodexCli
          ? renderSelectField({
              label: "Prompt mode",
              value: profile.promptMode,
              testId: "settings-provider-prompt-mode",
              options: [
                { value: ProviderPromptMode.Stdin, label: "stdin" },
                { value: ProviderPromptMode.Arg, label: "arg" }
              ],
              onChange: (value) => this.handleProviderPromptModeChange(profile.id, value)
            })
          : renderSessionSecretField({
              label: "API key",
              value: apiKeyValue,
              placeholder: "Session only in web mode",
              testId: "settings-provider-api-key",
              onChange: (value) => this.handleProviderSecretChange(profile.id, value)
            })
      ]),
      createElement("div", {
        className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4 text-sm text-text-secondary"
      }, [
        profile.providerKind === ProviderKind.CodexCli
          ? this.state.currentProject
            ? "This Codex CLI profile will be pushed to the current workspace backend on save so future flow work can resolve it server-side."
            : "This Codex CLI profile is already persisted locally. Open a project if you also want to sync its CLI config to the backend store on save."
          : "This provider profile is persisted locally. It becomes server-backed once a matching runtime adapter is registered in the backend."
      ])
    ]);
  }

  private renderLimitsTab(): HTMLElement {
    return createElement("section", {
      className: "flex flex-col gap-5 rounded-xl border border-border-dark bg-surface-dark p-5"
    }, [
      createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("h2", { className: "text-lg font-semibold text-white" }, ["Workflow limits"]),
        createElement("p", { className: "text-sm text-text-secondary" }, [
          "Guardrails that apply before autonomous runs consume excessive time, loops or external access."
        ])
      ]),
      createElement("div", { className: "grid gap-4 lg:grid-cols-2" }, [
        renderNumberField({
          label: "Maximum loops",
          value: this.state.workflowLimits.maxLoops,
          disabled: this.state.workflowLimits.infiniteLoops,
          testId: "settings-max-loops",
          onChange: (value) => this.handleMaxLoopsChange(value)
        }),
        this.renderToggleField({
          label: "Infinite loops",
          description: "Allow autonomous execution without a hard loop cap.",
          checked: this.state.workflowLimits.infiniteLoops,
          testId: "settings-infinite-loops",
          onChange: (checked) =>
            this.setState({
              workflowLimits: {
                ...this.state.workflowLimits,
                infiniteLoops: checked
              }
            })
        }),
        this.renderToggleField({
          label: "Allow external API calls",
          description: "Permit network access from tool executions and workflow steps.",
          checked: this.state.workflowLimits.externalCalls,
          testId: "settings-external-calls",
          onChange: (checked) =>
            this.setState({
              workflowLimits: {
                ...this.state.workflowLimits,
                externalCalls: checked
              }
            })
        })
      ])
    ]);
  }

  private renderNotificationsTab(): HTMLElement {
    return createElement("section", {
      className: "flex flex-col gap-5 rounded-xl border border-border-dark bg-surface-dark p-5"
    }, [
      createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("h2", { className: "text-lg font-semibold text-white" }, ["Notifications"]),
        createElement("p", { className: "text-sm text-text-secondary" }, [
          "Keep browser-side alert preferences and webhook routing in sync with the current workstation."
        ])
      ]),
      this.renderToggleField({
        label: "Completion sound",
        description: "Play a local confirmation tone when a run finishes.",
        checked: this.state.notifications.soundEnabled,
        testId: "settings-sound-enabled",
        onChange: (checked) =>
          this.setState({
            notifications: {
              ...this.state.notifications,
              soundEnabled: checked
            }
          })
      }),
      createElement("div", { className: "grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end" }, [
        renderTextField({
          label: "Webhook URL",
          value: this.state.notifications.webhookUrl,
          placeholder: "https://hooks.example.com/iteronix",
          testId: "settings-webhook-url",
          onChange: (value) =>
            this.setState({
              notifications: {
                ...this.state.notifications,
                webhookUrl: value
              }
            })
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
          children: this.state.isTestingWebhook ? "Testing" : "Test payload"
        })
      ]),
      createElement("p", { className: "text-xs text-text-secondary" }, [
        "Webhook tests send a JSON POST directly from the browser. If the destination blocks CORS, the test fails locally but the saved URL remains available for future server-side integrations."
      ])
    ]);
  }

  private renderApiTab(): HTMLElement {
    return createElement("section", {
      className: "flex flex-col gap-5 rounded-xl border border-border-dark bg-surface-dark p-5"
    }, [
      createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("h2", { className: "text-lg font-semibold text-white" }, ["API access"]),
        createElement("p", { className: "text-sm text-text-secondary" }, [
          "These values back the existing web UI connection contract and are reused by every server-first screen."
        ])
      ]),
      createElement("div", { className: "grid gap-4 lg:grid-cols-2" }, [
        renderTextField({
          label: "Server URL",
          value: this.state.serverConnection.serverUrl,
          placeholder: DefaultServerConnection.serverUrl,
          testId: "settings-server-url",
          onChange: (value) => this.handleServerConnectionChange("serverUrl", value)
        }),
        renderTextField({
          label: "Auth token",
          value: this.state.serverConnection.authToken,
          placeholder: DefaultServerConnection.authToken,
          testId: "settings-auth-token",
          onChange: (value) => this.handleServerConnectionChange("authToken", value)
        })
      ]),
      createElement("div", { className: "flex flex-wrap items-center gap-3" }, [
        createElement(Button, {
          variant: "secondary",
          size: "sm",
          disabled: this.state.isTestingConnection,
          onClick: () => {
            void this.handleTestConnection();
          },
          children: this.state.isTestingConnection ? "Testing" : "Check connection"
        }),
        createElement(StatusBadge, {
          status: this.state.runtimeProviders.length > 0 ? "success" : "warning"
        }, [
          this.state.runtimeProviders.length > 0
            ? `${this.state.runtimeProviders.length} runtime provider${this.state.runtimeProviders.length === 1 ? "" : "s"}`
            : "No runtime providers loaded"
        ])
      ]),
      this.state.runtimeProviders.length > 0
        ? createElement("div", { className: "grid gap-3 sm:grid-cols-2" }, [
            this.state.runtimeProviders.map((provider) =>
              createElement("div", {
                key: provider.id,
                className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-3"
              }, [
                createElement("p", { className: "text-sm font-semibold text-white" }, [provider.displayName]),
                createElement("p", { className: "mt-1 text-xs text-text-secondary" }, [
                  `${provider.id} · ${provider.type} · auth ${provider.authType}`
                ])
              ])
            )
          ])
        : createElement("div", {
            className: "rounded-lg border border-dashed border-border-dark px-4 py-4 text-sm text-text-secondary"
          }, ["Use Check connection to validate the current server URL and auth token."])
    ]);
  }

  private renderSaveBar(): HTMLElement {
    return createElement("div", {
      className: "sticky bottom-0 z-20 flex flex-wrap justify-end gap-3 border-t border-border-dark bg-background-dark/95 px-0 py-4 backdrop-blur"
    }, [
      createElement(Button, {
        variant: "secondary",
        onClick: () => this.handleResetDefaults(),
        children: "Reset defaults"
      }),
      createElement(Button, {
        variant: "primary",
        icon: "save",
        disabled: this.state.isSaving,
        onClick: () => {
          void this.handleSave();
        },
        children: this.state.isSaving ? "Saving" : "Save changes"
      })
    ]);
  }

  private renderToggleField(input: {
    label: string;
    description: string;
    checked: boolean;
    testId: string;
    onChange: (checked: boolean) => void;
  }): HTMLElement {
    return createElement("label", {
      className: "flex items-center justify-between gap-4 rounded-lg border border-border-dark bg-background-dark/40 px-4 py-4"
    }, [
      createElement("div", { className: "flex min-w-0 flex-col gap-1" }, [
        createElement("span", { className: "text-sm font-medium text-white" }, [input.label]),
        createElement("span", { className: "text-xs text-text-secondary" }, [input.description])
      ]),
      createElement("input", {
        type: "checkbox",
        checked: input.checked,
        "data-testid": input.testId,
        className: "h-4 w-4 accent-primary",
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            input.onChange(target.checked);
          }
        }
      })
    ]);
  }

  private async hydrateRuntimeContext(): Promise<void> {
    const projectSession = readProjectSession();
    let currentProject: ProjectRecord | null = null;
    let runtimeProviders: ReadonlyArray<RuntimeProviderRecord> = this.state.runtimeProviders;
    let message: string | null = null;

    try {
      const providerResponse = await this.settingsClient.listProviders();
      runtimeProviders = providerResponse.providers;
    } catch (error) {
      message = toErrorMessage(error, "Could not load runtime providers.");
    }

    if (projectSession.projectRootPath.length > 0) {
      try {
        currentProject = await this.settingsClient.openProject({
          rootPath: projectSession.projectRootPath,
          ...(projectSession.projectName ? { name: projectSession.projectName } : {})
        });
      } catch (error) {
        message = toErrorMessage(error, "Could not resolve the active project for settings.");
      }
    }

    this.setState({
      projectSession,
      currentProject,
      runtimeProviders,
      ...(message ? { noticeMessage: message } : {})
    });
  }

  private handleAddProviderProfile(kind: ProviderKind): void {
    const profile = createProviderProfile(kind);
    this.setState({
      activeTab: "provider",
      providerProfiles: [...this.state.providerProfiles, profile],
      selectedProviderId: profile.id,
      noticeMessage: null,
      errorMessage: null
    });
  }

  private handleRemoveProviderProfile(profileId: string): void {
    const nextProfiles = this.state.providerProfiles.filter((profile) => profile.id !== profileId);
    const selectedProviderId =
      this.state.selectedProviderId === profileId
        ? nextProfiles[0]?.id ?? null
        : this.state.selectedProviderId;

    const nextSecrets = { ...this.state.sessionSecrets };
    delete nextSecrets[profileId];

    this.setState({
      providerProfiles: nextProfiles,
      selectedProviderId,
      sessionSecrets: nextSecrets
    });
  }

  private handleProviderProfileTextChange(
    profileId: string,
    key: "name" | "modelId" | "endpointUrl" | "command",
    value: string
  ): void {
    const nextProfiles = this.state.providerProfiles.map((profile) =>
      profile.id === profileId ? updateProviderProfile(profile, { [key]: value }) : profile
    );

    this.setState({
      providerProfiles: nextProfiles
    });
  }

  private handleProviderKindChange(profileId: string, value: string): void {
    const kind = readProviderKind(value);
    if (!kind) {
      return;
    }

    const nextProfiles = this.state.providerProfiles.map((profile) =>
      profile.id === profileId ? updateProviderProfile(profile, { providerKind: kind, modelId: "" }) : profile
    );

    this.setState({ providerProfiles: nextProfiles });
  }

  private handleProviderPromptModeChange(profileId: string, value: string): void {
    const promptMode = readPromptMode(value);
    if (!promptMode) {
      return;
    }

    const nextProfiles = this.state.providerProfiles.map((profile) =>
      profile.id === profileId ? updateProviderProfile(profile, { promptMode }) : profile
    );

    this.setState({ providerProfiles: nextProfiles });
  }

  private handleProviderSecretChange(profileId: string, value: string): void {
    this.setState({
      sessionSecrets: {
        ...this.state.sessionSecrets,
        [profileId]: value
      }
    });
  }

  private handleMaxLoopsChange(value: string): void {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.setState({
      workflowLimits: {
        ...this.state.workflowLimits,
        maxLoops: parsed
      }
    });
  }

  private handleServerConnectionChange(
    key: keyof ServerConnection,
    value: string
  ): void {
    this.setState({
      serverConnection: {
        ...this.state.serverConnection,
        [key]: value
      }
    });
  }

  private async handleTestConnection(): Promise<void> {
    this.setState({
      isTestingConnection: true,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      writeServerConnection(this.state.serverConnection);
      const response = await this.settingsClient.listProviders();
      this.setState({
        runtimeProviders: response.providers,
        noticeMessage: `Connection OK. Runtime exposes ${response.providers.length} provider${response.providers.length === 1 ? "" : "s"}.`
      });
    } catch (error) {
      this.setState({
        errorMessage: toErrorMessage(error, "Connection test failed.")
      });
    } finally {
      this.setState({
        isTestingConnection: false
      });
    }
  }

  private async handleTestWebhook(): Promise<void> {
    this.setState({
      isTestingWebhook: true,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const response = await fetch(this.state.notifications.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...TestWebhookPayload,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook returned status ${response.status}`);
      }

      this.setState({
        noticeMessage: "Webhook test payload delivered successfully."
      });
    } catch (error) {
      this.setState({
        errorMessage: toErrorMessage(error, "Webhook test failed.")
      });
    } finally {
      this.setState({
        isTestingWebhook: false
      });
    }
  }

  private async handleSave(): Promise<void> {
    if (this.state.isSaving) {
      return;
    }

    this.setState({
      isSaving: true,
      errorMessage: null,
      noticeMessage: null
    });

    try {
      const snapshot: SettingsSnapshot = {
        profileId: this.state.profileId || DefaultSettingsProfileId,
        providerProfiles: this.state.providerProfiles,
        workflowLimits: this.state.workflowLimits,
        notifications: this.state.notifications
      };

      this.settingsStorage.save(snapshot);
      writeServerConnection(this.state.serverConnection);

      let syncedCount = 0;
      if (this.state.currentProject) {
        const syncRequests = createProviderSyncRequests(
          this.state.providerProfiles,
          this.state.currentProject.id
        );

        for (const request of syncRequests) {
          await this.settingsClient.updateProviderSettings({
            projectId: request.projectId,
            profileId: request.profileId,
            providerId: request.providerId,
            config: request.config
          });
          syncedCount += 1;
        }
      }

      const localOnlyCount = this.state.providerProfiles.length - syncedCount;
      this.setState({
        noticeMessage: `Settings saved. ${syncedCount} profile${syncedCount === 1 ? "" : "s"} synced to the backend and ${localOnlyCount} kept as local-only configuration.`
      });
    } catch (error) {
      this.setState({
        errorMessage: toErrorMessage(error, "Could not save settings.")
      });
    } finally {
      this.setState({
        isSaving: false
      });
    }
  }

  private handleResetDefaults(): void {
    const confirmed = window.confirm("Reset provider profiles, workflow limits, notifications and API access to their defaults?");
    if (!confirmed) {
      return;
    }

    const snapshot = this.settingsStorage.reset();
    const serverConnection = writeServerConnection(DefaultServerConnection);

    this.setState({
      activeTab: "provider",
      profileId: snapshot.profileId,
      providerProfiles: snapshot.providerProfiles,
      selectedProviderId: snapshot.providerProfiles[0]?.id ?? null,
      workflowLimits: snapshot.workflowLimits,
      notifications: snapshot.notifications,
      serverConnection,
      sessionSecrets: {},
      errorMessage: null,
      noticeMessage: "Settings restored to defaults."
    });
  }

  private readSelectedProviderProfile(): ProviderProfileRecord | null {
    const selectedProviderId = this.state.selectedProviderId;
    if (!selectedProviderId) {
      return null;
    }

    return this.state.providerProfiles.find((profile) => profile.id === selectedProviderId) ?? null;
  }
}

const renderReadOnlyCell = (label: string, value: string): HTMLElement =>
  createElement("div", {
    className: "rounded-lg border border-border-dark bg-background-dark/40 px-4 py-3"
  }, [
    createElement("dt", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [label]),
    createElement("dd", { className: "mt-2 text-sm font-medium text-white break-all" }, [value])
  ]);

const renderTextField = (input: {
  label: string;
  value: string;
  placeholder: string;
  testId: string;
  onChange: (value: string) => void;
}): HTMLElement =>
  createElement("label", { className: "flex flex-col gap-2" }, [
    createElement("span", { className: "text-sm font-medium text-white" }, [input.label]),
    createElement("input", {
      type: "text",
      value: input.value,
      placeholder: input.placeholder,
      "data-testid": input.testId,
      className: "w-full rounded-lg border border-border-dark bg-background-dark/40 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
      onChange: (event: Event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
          input.onChange(target.value);
        }
      }
    })
  ]);

const renderSessionSecretField = (input: {
  label: string;
  value: string;
  placeholder: string;
  testId: string;
  onChange: (value: string) => void;
}): HTMLElement =>
  createElement("label", { className: "flex flex-col gap-2" }, [
    createElement("div", { className: "flex items-center justify-between gap-3" }, [
      createElement("span", { className: "text-sm font-medium text-white" }, [input.label]),
      createElement(StatusBadge, { status: "warning" }, ["session only"])
    ]),
    createElement("input", {
      type: "password",
      value: input.value,
      placeholder: input.placeholder,
      "data-testid": input.testId,
      className: "w-full rounded-lg border border-border-dark bg-background-dark/40 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
      onChange: (event: Event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
          input.onChange(target.value);
        }
      }
    }),
    createElement("span", { className: "text-xs text-text-secondary" }, [
      "The browser keeps this key only in memory for the current session."
    ])
  ]);

const renderNumberField = (input: {
  label: string;
  value: number;
  disabled?: boolean;
  testId: string;
  onChange: (value: string) => void;
}): HTMLElement =>
  createElement("label", { className: "flex flex-col gap-2" }, [
    createElement("span", { className: "text-sm font-medium text-white" }, [input.label]),
    createElement("input", {
      type: "number",
      value: input.value.toString(),
      disabled: input.disabled,
      "data-testid": input.testId,
      className: "w-full rounded-lg border border-border-dark bg-background-dark/40 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50",
      onChange: (event: Event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
          input.onChange(target.value);
        }
      }
    })
  ]);

const renderSelectField = (input: {
  label: string;
  value: string;
  testId: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): HTMLElement =>
  createElement("label", { className: "flex flex-col gap-2" }, [
    createElement("span", { className: "text-sm font-medium text-white" }, [input.label]),
    createElement("select", {
      value: input.value,
      "data-testid": input.testId,
      className: "w-full rounded-lg border border-border-dark bg-background-dark/40 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
      onChange: (event: Event) => {
        const target = event.target;
        if (target instanceof HTMLSelectElement) {
          input.onChange(target.value);
        }
      }
    }, input.options.map((option) =>
      createElement("option", { value: option.value }, [option.label])
    ))
  ]);

const toErrorMessage = (value: unknown, fallback: string): string => {
  if (value instanceof Error && value.message.trim().length > 0) {
    return value.message;
  }

  return fallback;
};

const readProviderKind = (value: string): ProviderKind | null => {
  if (
    value === ProviderKind.CodexCli ||
    value === ProviderKind.OpenAI ||
    value === ProviderKind.Anthropic ||
    value === ProviderKind.Ollama
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
