import {
  Component,
  createElement,
  type ComponentProps,
} from "./shared/Component.js";
import { MainLayout, Header } from "./components/Layout.js";
import {
  Sidebar,
  type NavigationGroup,
  type NavigationLink,
} from "./components/Navigation.js";
import {
  APP_VERSION,
  COMPACT_VIEWPORT_MAX_WIDTH,
  ROUTES,
} from "./shared/constants.js";
import { router } from "./shared/Router.js";
import { sanitizeBrowserUrlState } from "./shared/url-state.js";
import { SettingsScreen } from "./screens/Settings.js";
import { WorkflowsScreen } from "./screens/Workflows.js";
import { WorkflowsCatalogScreen } from "./screens/WorkflowsCatalog.js";
import { PromptAssetsScreen } from "./screens/PromptAssets.js";
import { SkillAssetsScreen } from "./screens/SkillAssets.js";
import { MemoryAssetsScreen } from "./screens/MemoryAssets.js";
import { McpAssetsScreen } from "./screens/McpAssets.js";
import { PluginAssetsScreen } from "./screens/PluginAssets.js";
import {
  getIdeSession,
  IdeUserRole,
  loginIdeSession,
  type IdeSessionUser,
} from "./shared/ide-auth-client.js";
import { sanitizeIdeAuthReturnUrl } from "./shared/ide-auth-return-url.js";

const ScreenId = {
  WorkflowCatalog: "workflow-catalog",
  WorkflowEditor: "workflow-editor",
  PromptAssets: "prompt-assets",
  SkillAssets: "skill-assets",
  MemoryAssets: "memory-assets",
  McpAssets: "mcp-assets",
  PluginAssets: "plugin-assets",
  Settings: "settings",
} as const;

type ScreenId = (typeof ScreenId)[keyof typeof ScreenId];

const RootRoute = "/";

const AuthenticationStatus = {
  Resolving: "resolving",
  Required: "required",
  Authenticated: "authenticated",
} as const;

type AuthenticationStatus =
  (typeof AuthenticationStatus)[keyof typeof AuthenticationStatus];

const ScreenLabel: Record<ScreenId, string> = {
  "workflow-catalog": "Workflows",
  "workflow-editor": "Workflow editor",
  "prompt-assets": "Prompt assets",
  "skill-assets": "Skill assets",
  "memory-assets": "Memory & RAG",
  "mcp-assets": "MCP connections",
  "plugin-assets": "Server plugins",
  settings: "Settings",
};

interface AppState {
  currentScreen: ScreenId;
  workflowId: string | null;
  sidebarCollapsed: boolean;
  isCompactViewport: boolean;
  authenticationStatus: AuthenticationStatus;
  authenticatedUser: IdeSessionUser | null;
  authenticationError: string | null;
  returnUrl: string;
}

interface AppProps extends ComponentProps {
  [key: string]: unknown;
}

const ScreenHostTestId = "app-screen-host";

export class App extends Component<AppProps, AppState> {
  private activeScreenInstance: Component<ComponentProps, unknown> | null =
    null;
  private activeScreenKey: string | null = null;

  constructor(props: AppProps) {
    super(props, {
      currentScreen: ScreenId.WorkflowCatalog,
      workflowId: null,
      sidebarCollapsed: readIsCompactViewport(),
      isCompactViewport: readIsCompactViewport(),
      authenticationStatus: AuthenticationStatus.Resolving,
      authenticatedUser: null,
      authenticationError: null,
      returnUrl: readIdeAuthReturnUrl(),
    });

    sanitizeBrowserUrlState();
    this.setupRouter();

    console.info("Application started", {
      version: APP_VERSION,
      screen: ScreenId.WorkflowCatalog,
    });
  }

  override setState(newState: Partial<AppState>): void {
    super.setState(newState);
    requestAnimationFrame(() => {
      this.mountActiveScreenInstance();
    });
  }

  override render(): HTMLElement {
    if (
      this.state.authenticationStatus !== AuthenticationStatus.Authenticated ||
      !this.state.authenticatedUser
    ) {
      return this.renderAuthenticationGate();
    }

    return createElement(MainLayout, {
      sidebar: createElement(Sidebar, {
        brand: {
          name: "Iteronix",
          icon: "terminal",
          version: `v${APP_VERSION}`,
        },
        navigation: this.buildNavigationItems(),
        onToggle: () =>
          this.setState({ sidebarCollapsed: !this.state.sidebarCollapsed }),
        collapsed: this.state.sidebarCollapsed,
      }),
      header: () => this.renderHeader(),
      className: "transition-all duration-300",
      sidebarCollapsed: this.state.sidebarCollapsed,
      children: this.renderCurrentScreen(),
    });
  }

  override onMount(): void {
    window.addEventListener("resize", this.handleViewportResize);
    void this.resolveIdeSession();
    if (
      this.state.authenticationStatus === AuthenticationStatus.Authenticated
    ) {
      this.mountActiveScreenInstance();
    }
  }

  override onUnmount(): void {
    window.removeEventListener("resize", this.handleViewportResize);
    this.activeScreenInstance?.unmount();
    this.activeScreenInstance = null;
    this.activeScreenKey = null;
  }

  private setupRouter(): void {
    router.register(RootRoute, () =>
      this.updateScreen(ScreenId.WorkflowCatalog),
    );
    router.register(ROUTES.WORKFLOWS, () =>
      this.updateScreen(ScreenId.WorkflowCatalog),
    );
    router.register(ROUTES.WORKFLOW_EDITOR, ({ workflowId }) =>
      this.updateScreen(ScreenId.WorkflowEditor, workflowId ?? null),
    );
    router.register(ROUTES.PROMPT_ASSETS, () =>
      this.updateScreen(ScreenId.PromptAssets),
    );
    router.register(ROUTES.SKILL_ASSETS, () =>
      this.updateScreen(ScreenId.SkillAssets),
    );
    router.register(ROUTES.MEMORY_ASSETS, () =>
      this.updateScreen(ScreenId.MemoryAssets),
    );
    router.register(ROUTES.MCP_ASSETS, () =>
      this.updateScreen(ScreenId.McpAssets),
    );
    router.register(ROUTES.PLUGIN_ASSETS, () =>
      this.updateScreen(ScreenId.PluginAssets),
    );
    router.register(ROUTES.SETTINGS, () =>
      this.updateScreen(ScreenId.Settings),
    );
    router.start();
  }

  private buildNavigationItems(): ReadonlyArray<
    NavigationLink | NavigationGroup
  > {
    return [
      this.createNavigationItem(
        ScreenId.WorkflowCatalog,
        "account_tree",
        ScreenLabel[ScreenId.WorkflowCatalog],
        ROUTES.WORKFLOWS,
      ),
      this.createAssetsNavigationGroup(),
      this.createNavigationItem(
        ScreenId.Settings,
        "settings",
        ScreenLabel.settings,
        ROUTES.SETTINGS,
      ),
    ];
  }

  private createNavigationItem(
    screen: ScreenId,
    icon: string,
    label: string,
    href: string,
  ): NavigationLink {
    return {
      icon,
      label,
      href,
      active:
        this.state.currentScreen === screen ||
        (screen === ScreenId.WorkflowCatalog &&
          this.state.currentScreen === ScreenId.WorkflowEditor),
      onClick: (event: Event) => {
        event.preventDefault();
        router.navigate(href);
      },
    };
  }

  private createAssetsNavigationGroup(): NavigationGroup {
    const assetScreens: ReadonlyArray<readonly [ScreenId, string, string]> = [
      [ScreenId.PromptAssets, "chat", ROUTES.PROMPT_ASSETS],
      [ScreenId.SkillAssets, "extension", ROUTES.SKILL_ASSETS],
      [ScreenId.MemoryAssets, "database", ROUTES.MEMORY_ASSETS],
      [ScreenId.McpAssets, "hub", ROUTES.MCP_ASSETS],
      [ScreenId.PluginAssets, "deployed_code", ROUTES.PLUGIN_ASSETS],
    ];
    const items = assetScreens.map(([screen, icon, href]) =>
      this.createNavigationItem(screen, icon, ScreenLabel[screen], href),
    );

    return {
      icon: "inventory_2",
      label: "Assets",
      active: items.some((item) => item.active === true),
      items,
    };
  }

  private renderHeader(): HTMLElement {
    const actions = buildHeaderActions();

    return createElement(Header, {
      title: this.state.isCompactViewport
        ? null
        : ScreenLabel[this.state.currentScreen],
      breadcrumbs: this.state.isCompactViewport
        ? [{ label: ScreenLabel[this.state.currentScreen] }]
        : [
            { label: "Iteronix", href: ROUTES.WORKFLOWS },
            { label: ScreenLabel[this.state.currentScreen] },
          ],
      actions,
      user: {
        name: this.state.authenticatedUser?.email ?? "",
        ...(this.state.authenticatedUser
          ? { email: this.state.authenticatedUser.email }
          : {}),
        avatar: null,
      },
      className: this.state.isCompactViewport ? "px-3" : "",
    });
  }

  private renderCurrentScreen(): HTMLElement {
    return createElement("div", {
      className: "h-full w-full",
      "data-testid": ScreenHostTestId,
    });
  }

  private renderAuthenticationGate(): HTMLElement {
    if (this.state.authenticationStatus === AuthenticationStatus.Resolving) {
      return createElement(
        "main",
        {
          className:
            "min-h-full bg-background-dark px-6 py-10 text-white sm:px-8",
          "aria-busy": "true",
          "data-testid": "auth-session-resolving",
        },
        [
          createElement(
            "div",
            {
              className:
                "mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center",
            },
            [
              createElement("p", { className: "text-sm text-text-secondary" }, [
                "Checking your secure session…",
              ]),
            ],
          ),
        ],
      );
    }

    const form = createElement(
      "form",
      {
        className: "grid gap-5",
        onSubmit: this.handleLoginSubmit,
        "aria-describedby": this.state.authenticationError
          ? "auth-login-error"
          : undefined,
      },
      [
        createElement("div", { className: "grid gap-2" }, [
          createElement(
            "label",
            {
              className: "text-sm font-medium text-white",
              for: "auth-login-email",
            },
            ["Email address"],
          ),
          createElement("input", {
            id: "auth-login-email",
            name: "email",
            type: "email",
            autocomplete: "username",
            required: true,
            className:
              "w-full rounded-lg border border-border-dark bg-surface-dark px-3 py-2.5 text-white outline-none transition-colors placeholder:text-text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30",
            "data-testid": "auth-login-email",
          }),
        ]),
        createElement("div", { className: "grid gap-2" }, [
          createElement(
            "label",
            {
              className: "text-sm font-medium text-white",
              for: "auth-login-password",
            },
            ["Password"],
          ),
          createElement("input", {
            id: "auth-login-password",
            name: "password",
            type: "password",
            autocomplete: "current-password",
            required: true,
            className:
              "w-full rounded-lg border border-border-dark bg-surface-dark px-3 py-2.5 text-white outline-none transition-colors placeholder:text-text-secondary focus:border-primary focus:ring-2 focus:ring-primary/30",
            "data-testid": "auth-login-password",
          }),
        ]),
        this.state.authenticationError
          ? createElement(
              "p",
              {
                id: "auth-login-error",
                className:
                  "rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-sm text-rose-100",
                role: "alert",
                "data-testid": "auth-login-error",
              },
              [this.state.authenticationError],
            )
          : null,
        createElement(
          "button",
          {
            type: "submit",
            className:
              "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-primary/50",
            "data-testid": "auth-login-submit",
          },
          ["Sign in"],
        ),
      ],
    );

    return createElement(
      "main",
      {
        className:
          "min-h-full bg-background-dark px-6 py-10 text-white sm:px-8",
        "data-testid": "auth-login-root",
      },
      [
        createElement(
          "section",
          {
            className:
              "mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center",
            "aria-labelledby": "auth-login-title",
          },
          [
            createElement("div", { className: "w-full" }, [
              createElement(
                "div",
                {
                  className: "mb-6 border-b border-border-dark pb-5 text-left",
                },
                [
                  createElement(
                    "p",
                    { className: "mb-2 text-sm font-medium text-primary" },
                    ["Iteronix"],
                  ),
                  createElement(
                    "h1",
                    {
                      id: "auth-login-title",
                      className:
                        "text-2xl font-semibold tracking-tight text-white",
                    },
                    ["Sign in to continue"],
                  ),
                  createElement(
                    "p",
                    { className: "mt-2 text-sm leading-6 text-text-secondary" },
                    [
                      "Use your administrator or member account to access this workspace.",
                    ],
                  ),
                ],
              ),
              form,
            ]),
          ],
        ),
      ],
    );
  }

  private updateScreen(
    screen: ScreenId,
    workflowId: string | null = null,
  ): void {
    if (
      this.state.currentScreen !== screen ||
      this.state.workflowId !== workflowId
    ) {
      this.setState({ currentScreen: screen, workflowId });
    }
  }

  private readonly handleViewportResize = (): void => {
    const isCompactViewport = readIsCompactViewport();
    if (isCompactViewport === this.state.isCompactViewport) {
      return;
    }

    this.setState({
      isCompactViewport,
      sidebarCollapsed: isCompactViewport ? true : this.state.sidebarCollapsed,
    });
  };

  private readonly handleLoginSubmit = (event: Event): void => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    const email = form.elements.namedItem("email");
    const password = form.elements.namedItem("password");
    if (
      !(email instanceof HTMLInputElement) ||
      !(password instanceof HTMLInputElement)
    ) {
      return;
    }
    void this.login({ email: email.value, password: password.value });
  };

  private async resolveIdeSession(): Promise<void> {
    try {
      const user = await getIdeSession();
      this.setState({
        authenticationStatus: user
          ? AuthenticationStatus.Authenticated
          : AuthenticationStatus.Required,
        authenticatedUser: user,
        authenticationError: null,
      });
    } catch {
      this.setState({
        authenticationStatus: AuthenticationStatus.Required,
        authenticatedUser: null,
        authenticationError:
          "We could not verify your session. Check the server connection and try again.",
      });
    }
  }

  private async login(input: {
    email: string;
    password: string;
  }): Promise<void> {
    try {
      const user = await loginIdeSession(input);
      this.setState({
        authenticationStatus: AuthenticationStatus.Authenticated,
        authenticatedUser: user,
        authenticationError: null,
      });
      requestAnimationFrame(() => this.restoreReturnUrl());
    } catch (error) {
      this.setState({
        authenticationError:
          error instanceof Error ? error.message : "We could not sign you in.",
      });
    }
  }

  private restoreReturnUrl(): void {
    const returnUrl = this.state.returnUrl;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl === returnUrl) {
      this.mountActiveScreenInstance();
      return;
    }
    window.history.replaceState({}, "", returnUrl);
    router.navigate(window.location.pathname);
  }

  private mountActiveScreenInstance(): void {
    const screenHost = this.element?.querySelector(
      `[data-testid="${ScreenHostTestId}"]`,
    );
    if (!(screenHost instanceof HTMLElement)) {
      return;
    }

    const activeScreenKey = this.readActiveScreenKey();
    if (this.activeScreenKey !== activeScreenKey) {
      this.activeScreenInstance?.unmount();
      this.activeScreenInstance = this.createScreenInstance(
        this.state.currentScreen,
      );
      this.activeScreenKey = activeScreenKey;
      screenHost.replaceChildren();
      this.activeScreenInstance.mount(screenHost);
      return;
    }

    if (this.activeScreenInstance?.element instanceof HTMLElement) {
      if (this.activeScreenInstance.element.parentElement !== screenHost) {
        screenHost.replaceChildren(this.activeScreenInstance.element);
      }
      return;
    }

    if (this.activeScreenInstance) {
      screenHost.replaceChildren();
      this.activeScreenInstance.mount(screenHost);
    }
  }

  private createScreenInstance(
    screen: ScreenId,
  ): Component<ComponentProps, unknown> {
    if (screen === ScreenId.WorkflowCatalog) {
      return new WorkflowsCatalogScreen({});
    }

    if (screen === ScreenId.WorkflowEditor && this.state.workflowId) {
      return new WorkflowsScreen({ workflowId: this.state.workflowId });
    }

    if (screen === ScreenId.Settings) {
      return new SettingsScreen({
        authenticatedUserRole:
          this.state.authenticatedUser?.role ?? IdeUserRole.Member,
      });
    }

    if (screen === ScreenId.PromptAssets) {
      return new PromptAssetsScreen({});
    }

    if (screen === ScreenId.SkillAssets) {
      return new SkillAssetsScreen({});
    }

    if (screen === ScreenId.MemoryAssets) {
      return new MemoryAssetsScreen({});
    }

    if (screen === ScreenId.McpAssets) {
      return new McpAssetsScreen({});
    }

    if (screen === ScreenId.PluginAssets) {
      return new PluginAssetsScreen({});
    }

    return new SettingsScreen({
      authenticatedUserRole:
        this.state.authenticatedUser?.role ?? IdeUserRole.Member,
    });
  }

  private readActiveScreenKey(): string {
    return `${this.state.currentScreen}:${this.state.workflowId ?? ""}:${this.state.authenticatedUser?.role ?? ""}`;
  }
}

const buildHeaderActions = (): {
  notifications: {
    unread: number;
    onClick: () => void;
  };
  status?: {
    api: string;
    runners: string;
  };
  primary?: {
    icon: string;
    label: string;
    onClick: () => void;
  };
} => {
  const actions: {
    notifications: {
      unread: number;
      onClick: () => void;
    };
    status?: {
      api: string;
      runners: string;
    };
    primary?: {
      icon: string;
      label: string;
      onClick: () => void;
    };
  } = {
    notifications: {
      unread: 0,
      onClick: () => router.navigate(ROUTES.WORKFLOWS),
    },
  };

  return actions;
};

const readIsCompactViewport = (): boolean =>
  typeof window !== "undefined" &&
  window.innerWidth <= COMPACT_VIEWPORT_MAX_WIDTH;

const readIdeAuthReturnUrl = (): string =>
  typeof window === "undefined"
    ? ROUTES.WORKFLOWS
    : sanitizeIdeAuthReturnUrl(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
        window.location.origin,
      );

document.addEventListener("DOMContentLoaded", () => {
  const loadingScreen = document.getElementById("loading-screen");
  if (loadingScreen instanceof HTMLElement) {
    loadingScreen.style.display = "none";
  }

  const appRoot = document.getElementById("app-root");
  if (appRoot instanceof HTMLElement) {
    appRoot.classList.remove("hidden");
    const appInstance = new App({});
    appInstance.mount(appRoot);
  }
});
