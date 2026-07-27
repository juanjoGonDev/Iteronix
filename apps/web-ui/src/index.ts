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
    this.mountActiveScreenInstance();
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
        name: "John Doe",
        email: "john@example.com",
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
      return new SettingsScreen({});
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

    return new SettingsScreen({});
  }

  private readActiveScreenKey(): string {
    return `${this.state.currentScreen}:${this.state.workflowId ?? ""}`;
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
