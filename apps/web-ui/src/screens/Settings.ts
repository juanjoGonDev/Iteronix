import { Button } from "../components/Button.js";
import { StatusBadge } from "../components/Card.js";
import {
  PageFrame,
  PageIntro,
  PageTabs,
  showGlobalToast,
  type ToastKind,
  type PageTabItem
} from "../components/PageScaffold.js";
import {
  SettingsNumberField,
  SettingsSecretField,
  SettingsSelectField,
  SettingsTextField,
  SettingsToggleField
} from "../components/SettingsFields.js";
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
  hydrateSettingsSnapshot,
  type NotificationsSettings,
  type SettingsSnapshot,
  type WorkflowLimitsSettings
} from "../shared/settings-storage.js";
import {
  createSettingsClient,
  type RuntimeProviderRecord
} from "../shared/settings-client.js";
import {
  createWorkspaceStateClient,
  hydrateWorkspaceStateClients
} from "../shared/workspace-state-client.js";
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
  private readonly workspaceStateClient = createWorkspaceStateClient();

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
      isSaving: false,
      isTestingConnection: false,
      isTestingWebhook: false
    });
  }

  override onMount(): void {
    void this.hydrateRuntimeContext();
  }

  override render(): HTMLElement {
    return createElement(PageFrame, {
      className: "max-w-[1380px] gap-7 pb-28 md:pb-10"
    }, [
      createElement(PageIntro, {
        title: "Settings",
        description: "Configure provider profiles, workflow guardrails, notifications, and the server connection used by the web workbench."
      }),
      createElement(PageTabs, {
        sticky: true,
        items: this.createTabItems()
      }),
        this.renderActiveTab(),
        this.renderSaveBar()
    ]);
  }

  private createTabItems(): ReadonlyArray<PageTabItem> {
    return [
      this.createTabItem("general"),
      this.createTabItem("provider"),
      this.createTabItem("limits"),
      this.createTabItem("notifications"),
      this.createTabItem("api")
    ];
  }

  private createTabItem(tab: SettingsTab): PageTabItem {
    return {
      id: tab,
      label: TabLabel[tab],
      active: this.state.activeTab === tab,
      onClick: () => this.setState({ activeTab: tab })
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
    const currentProject = this.state.currentProject;
    const runtimeProviders = this.state.runtimeProviders;

    return createElement("div", { className: "grid gap-6 lg:grid-cols-2" }, [
      createElement("section", {
        className: "rounded-2xl border border-[#202832] bg-[#171c22] p-6 md:p-7"
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
            currentProject?.rootPath ?? this.state.projectSession.projectRootPath ?? "Workflow-only project"
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
        className: "rounded-2xl border border-[#202832] bg-[#171c22] p-6 md:p-7"
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

    return createElement("div", { className: "grid min-w-0 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]" }, [
      createElement("section", {
        className: "min-w-0 flex flex-col gap-5 rounded-2xl border border-[#202832] bg-[#171c22] p-5 md:p-7"
      }, [
        createElement("div", { className: "flex items-start justify-between gap-3" }, [
          createElement("div", { className: "flex flex-col gap-1" }, [
            createElement("h2", { className: "text-lg font-semibold text-white" }, ["Provider profiles"]),
            createElement("p", { className: "text-sm text-text-secondary" }, [
              "Create multiple reusable provider profiles. Workflows will choose among them later instead of activating a single global provider here."
            ])
          ]),
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
            className: "min-w-0 rounded-2xl border border-[#202832] bg-[#171c22] p-5 md:p-7"
          }, [
            createElement("h2", { className: "text-lg font-semibold text-white" }, ["Select a profile"]),
            createElement("p", { className: "mt-2 text-sm text-text-secondary" }, [
              "Choose a provider profile from the left column to edit its model, endpoint or CLI parameters."
            ])
          ])
    ]);
  }

  private renderAddProfileButtons(): HTMLElement {
    return createElement("div", { className: "grid gap-2 sm:grid-cols-2" }, [
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
      className: "justify-center",
      onClick: () => this.handleAddProviderProfile(kind),
      children: `Add ${ProviderKindLabel[kind]}`
    });
  }

  private renderProviderProfileListItem(profile: ProviderProfileRecord): HTMLElement {
    const isSelected = this.state.selectedProviderId === profile.id;

    return createElement("div", {
      className: `rounded-xl border px-3 py-3 transition-colors ${
        isSelected
          ? "border-primary bg-[#0f243b] shadow-[inset_0_0_0_1px_rgba(19,127,236,0.18)]"
          : "border-[#2b3644] bg-[#1a2129]"
      }`
    }, [
      createElement("div", { className: "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start" }, [
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
        createElement(Button, {
          variant: "danger",
          size: "sm",
          className: "w-full justify-center sm:w-auto sm:self-start",
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
      className: "min-w-0 flex flex-col gap-5 rounded-2xl border border-[#202832] bg-[#171c22] p-5 md:p-7"
    }, [
      createElement("div", { className: "flex flex-wrap items-start justify-between gap-3" }, [
        createElement("div", { className: "flex flex-col gap-1" }, [
          createElement("h2", { className: "text-lg font-semibold text-white" }, [profile.name]),
          createElement("p", { className: "text-sm text-text-secondary" }, [
            ProviderKindDescription[profile.providerKind]
          ])
        ]),
        createElement("div", { className: "text-xs font-medium uppercase tracking-[0.16em] text-slate-500" }, [
          runtimeAvailable ? "Runtime available" : "Local profile"
        ])
      ]),
      createElement("div", { className: "grid gap-4 lg:grid-cols-2" }, [
        createElement(SettingsTextField, {
          label: "Profile name",
          value: profile.name,
          placeholder: "Planner profile",
          testId: "settings-provider-name",
          onChange: (value: string) => this.handleProviderProfileTextChange(profile.id, "name", value)
        }),
        createElement(SettingsSelectField, {
          label: "Provider",
          value: profile.providerKind,
          testId: "settings-provider-kind",
          options: [
            { value: ProviderKind.CodexCli, label: ProviderKindLabel[ProviderKind.CodexCli] },
            { value: ProviderKind.OpenAI, label: ProviderKindLabel[ProviderKind.OpenAI] },
            { value: ProviderKind.Anthropic, label: ProviderKindLabel[ProviderKind.Anthropic] },
            { value: ProviderKind.Ollama, label: ProviderKindLabel[ProviderKind.Ollama] }
          ],
          onChange: (value: string) => this.handleProviderKindChange(profile.id, value)
        }),
        createElement(SettingsTextField, {
          label: "Model",
          value: profile.modelId,
          placeholder: "Enter the model id used by flows",
          testId: "settings-provider-model",
          onChange: (value: string) => this.handleProviderProfileTextChange(profile.id, "modelId", value)
        }),
        profile.providerKind === ProviderKind.CodexCli
          ? createElement(SettingsTextField, {
              label: "Command",
              value: profile.command,
              placeholder: "codex",
              testId: "settings-provider-command",
              onChange: (value: string) => this.handleProviderProfileTextChange(profile.id, "command", value)
            })
          : createElement(SettingsTextField, {
              label: "Endpoint URL",
              value: profile.endpointUrl,
              placeholder: "https://provider.example.com",
              testId: "settings-provider-endpoint",
              onChange: (value: string) => this.handleProviderProfileTextChange(profile.id, "endpointUrl", value)
            }),
        profile.providerKind === ProviderKind.CodexCli
          ? createElement(SettingsSelectField, {
              label: "Prompt mode",
              value: profile.promptMode,
              testId: "settings-provider-prompt-mode",
              options: [
                { value: ProviderPromptMode.Stdin, label: "stdin" },
                { value: ProviderPromptMode.Arg, label: "arg" }
              ],
              onChange: (value: string) => this.handleProviderPromptModeChange(profile.id, value)
            })
          : createElement(SettingsSecretField, {
              label: "API key",
              value: apiKeyValue,
              placeholder: "Session only in web mode",
              testId: "settings-provider-api-key",
              onChange: (value: string) => this.handleProviderSecretChange(profile.id, value)
            })
      ]),
      createElement("div", {
        className: "rounded-xl border border-[#2b3644] bg-[#1a2129] px-4 py-4 text-sm leading-6 text-text-secondary"
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
      className: "flex flex-col gap-5 rounded-2xl border border-[#202832] bg-[#171c22] p-6 md:p-7"
    }, [
      createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("h2", { className: "text-lg font-semibold text-white" }, ["Workflow limits"]),
        createElement("p", { className: "text-sm text-text-secondary" }, [
          "Guardrails that apply before autonomous runs consume excessive time, loops or external access."
        ])
      ]),
      createElement("div", { className: "grid gap-4 lg:grid-cols-2" }, [
        createElement(SettingsNumberField, {
          label: "Maximum loops",
          value: this.state.workflowLimits.maxLoops,
          disabled: this.state.workflowLimits.infiniteLoops,
          testId: "settings-max-loops",
          onChange: (value: string) => this.handleMaxLoopsChange(value)
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
                infiniteLoops: checked
              }
            })
        }),
        createElement(SettingsToggleField, {
          label: "Allow external API calls",
          description: "Permit network access from tool executions and workflow steps.",
          checked: this.state.workflowLimits.externalCalls,
          testId: "settings-external-calls",
          onChange: (checked: boolean) =>
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
      className: "flex flex-col gap-5 rounded-2xl border border-[#202832] bg-[#171c22] p-6 md:p-7"
    }, [
      createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("h2", { className: "text-lg font-semibold text-white" }, ["Notifications"]),
        createElement("p", { className: "text-sm text-text-secondary" }, [
          "Keep browser-side alert preferences and webhook routing in sync with the current workstation."
        ])
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
              soundEnabled: checked
            }
          })
      }),
      createElement("div", { className: "grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end" }, [
        createElement(SettingsTextField, {
          label: "Webhook URL",
          value: this.state.notifications.webhookUrl,
          placeholder: "https://hooks.example.com/iteronix",
          testId: "settings-webhook-url",
          onChange: (value: string) =>
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
      className: "flex flex-col gap-5 rounded-2xl border border-[#202832] bg-[#171c22] p-6 md:p-7"
    }, [
      createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("h2", { className: "text-lg font-semibold text-white" }, ["API access"]),
        createElement("p", { className: "text-sm text-text-secondary" }, [
          "These values back the existing web UI connection contract and are reused by every server-first screen."
        ])
      ]),
      createElement("div", { className: "grid gap-4 lg:grid-cols-2" }, [
        createElement(SettingsTextField, {
          label: "Server URL",
          value: this.state.serverConnection.serverUrl,
          placeholder: DefaultServerConnection.serverUrl,
          testId: "settings-server-url",
          onChange: (value: string) => this.handleServerConnectionChange("serverUrl", value)
        }),
        createElement(SettingsTextField, {
          label: "Auth token",
          value: this.state.serverConnection.authToken,
          placeholder: DefaultServerConnection.authToken,
          testId: "settings-auth-token",
          onChange: (value: string) => this.handleServerConnectionChange("authToken", value)
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
      className: "sticky bottom-4 z-20 mt-1 flex w-full flex-col gap-3 rounded-xl border border-[#202832] bg-[#171c22] px-4 py-4 shadow-[0_8px_18px_rgba(15,23,32,0.12)] md:w-auto md:flex-row md:items-center md:justify-end md:px-6"
        + " self-stretch md:self-end md:min-w-[420px]"
    }, [
      createElement(Button, {
        variant: "danger",
        className: "w-full justify-center md:w-auto",
        onClick: () => this.handleResetDefaults(),
        children: "Reset defaults"
      }),
      createElement(Button, {
        variant: "primary",
        icon: "save",
        disabled: this.state.isSaving,
        className: "w-full justify-center md:w-auto",
        onClick: () => {
          void this.handleSave();
        },
        children: this.state.isSaving ? "Saving" : "Save changes"
      })
    ]);
  }

  private async hydrateRuntimeContext(): Promise<void> {
    let projectSession = readProjectSession();
    let currentProject: ProjectRecord | null = null;
    let runtimeProviders: ReadonlyArray<RuntimeProviderRecord> = this.state.runtimeProviders;
    let message: string | null = null;

    try {
      const workspaceState = await this.workspaceStateClient.load();
      hydrateWorkspaceStateClients(workspaceState);
      projectSession = readProjectSession();
      hydrateSettingsSnapshot(workspaceState.settings);
      const snapshot = workspaceState.settings;
      this.setState({
        profileId: snapshot.profileId,
        providerProfiles: snapshot.providerProfiles,
        selectedProviderId: snapshot.providerProfiles[0]?.id ?? null,
        workflowLimits: snapshot.workflowLimits,
        notifications: snapshot.notifications
      });
      const providerResponse = await this.settingsClient.listProviders();
      runtimeProviders = providerResponse.providers;
    } catch (error) {
      message = toErrorMessage(error, "Could not load runtime providers.");
    }

    if (projectSession.projectRootPath !== null || projectSession.projectName.length > 0) {
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
    });

    if (message) {
      this.pushToast("error", message);
    }
  }

  private handleAddProviderProfile(kind: ProviderKind): void {
    const profile = createProviderProfile(kind);
    this.setState({
      activeTab: "provider",
      providerProfiles: [...this.state.providerProfiles, profile],
      selectedProviderId: profile.id
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
      isTestingConnection: true
    });

    try {
      writeServerConnection(this.state.serverConnection);
      const response = await this.settingsClient.listProviders();
      this.setState({
        runtimeProviders: response.providers
      });
      this.pushToast(
        "success",
        `Connection OK. Runtime exposes ${response.providers.length} provider${response.providers.length === 1 ? "" : "s"}.`
      );
    } catch (error) {
      this.pushToast("error", toErrorMessage(error, "Connection test failed."));
    } finally {
      this.setState({
        isTestingConnection: false
      });
    }
  }

  private async handleTestWebhook(): Promise<void> {
    this.setState({
      isTestingWebhook: true
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

      this.pushToast("success", "Webhook test payload delivered successfully.");
    } catch (error) {
      this.pushToast("error", toErrorMessage(error, "Webhook test failed."));
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
      isSaving: true
    });

    try {
      const snapshot: SettingsSnapshot = {
        profileId: this.state.profileId || DefaultSettingsProfileId,
        providerProfiles: this.state.providerProfiles,
        workflowLimits: this.state.workflowLimits,
        notifications: this.state.notifications
      };

      this.settingsStorage.save(snapshot);
      await this.workspaceStateClient.update({
        settings: snapshot
      });
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
      this.pushToast(
        "success",
        `Settings saved. ${syncedCount} profile${syncedCount === 1 ? "" : "s"} synced to the backend and ${localOnlyCount} kept as local-only configuration.`
      );
    } catch (error) {
      this.pushToast("error", toErrorMessage(error, "Could not save settings."));
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
    void this.workspaceStateClient.update({
      settings: snapshot
    });
    const serverConnection = writeServerConnection(DefaultServerConnection);

    this.setState({
      activeTab: "provider",
      profileId: snapshot.profileId,
      providerProfiles: snapshot.providerProfiles,
      selectedProviderId: snapshot.providerProfiles[0]?.id ?? null,
      workflowLimits: snapshot.workflowLimits,
      notifications: snapshot.notifications,
      serverConnection,
      sessionSecrets: {}
    });
    this.pushToast("success", "Settings restored to defaults.");
  }

  private pushToast(kind: ToastKind, message: string): void {
    showGlobalToast(kind, message);
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
    className: "rounded-xl border border-[#2b3644] bg-[#1a2129] px-4 py-3.5"
  }, [
    createElement("dt", { className: "text-xs uppercase tracking-wide text-text-secondary" }, [label]),
    createElement("dd", { className: "mt-2 text-sm font-medium text-white break-all" }, [value])
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
