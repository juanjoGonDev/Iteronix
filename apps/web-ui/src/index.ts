import {
  Component,
  createElement,
  type ComponentProps,
} from "./shared/Component.js";
import { MainLayout, Header } from "./components/Layout.js";
import { Sidebar } from "./components/Navigation.js";
import {
  APP_VERSION,
  COMPACT_VIEWPORT_MAX_WIDTH,
  ROUTES,
} from "./shared/constants.js";
import { router } from "./shared/Router.js";
import { sanitizeBrowserUrlState } from "./shared/url-state.js";
import { SettingsScreen } from "./screens/Settings.js";
import { WorkflowsScreen } from "./screens/Workflows.js";

const ScreenId = {
  Workflows: "workflows",
  Settings: "settings",
} as const;

type ScreenId = (typeof ScreenId)[keyof typeof ScreenId];

const RootRoute = "/";

const ScreenLabel: Record<ScreenId, string> = {
  workflows: "Workflows",
  settings: "Settings",
};

interface AppState {
  currentScreen: ScreenId;
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
  private activeScreenId: ScreenId | null = null;

  constructor(props: AppProps) {
    super(props, {
      currentScreen: ScreenId.Workflows,
      sidebarCollapsed: readIsCompactViewport(),
      isCompactViewport: readIsCompactViewport(),
    });

    sanitizeBrowserUrlState();
    this.setupRouter();

    console.info("Application started", {
      version: APP_VERSION,
      screen: ScreenId.Workflows,
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
    this.activeScreenId = null;
  }

  private setupRouter(): void {
    router.register(RootRoute, () => this.updateScreen(ScreenId.Workflows));
    router.register(ROUTES.WORKFLOWS, () =>
      this.updateScreen(ScreenId.Workflows),
    );
    router.register(ROUTES.SETTINGS, () =>
      this.updateScreen(ScreenId.Settings),
    );
    router.start();
  }

  private buildNavigationItems(): Array<{
    icon: string;
    label: string;
    href: string;
    active: boolean;
    onClick: (event: Event) => void;
  }> {
    return [
      this.createNavigationItem(
        ScreenId.Workflows,
        "account_tree",
        ScreenLabel.workflows,
        ROUTES.WORKFLOWS,
      ),
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
  ): {
    icon: string;
    label: string;
    href: string;
    active: boolean;
    onClick: (event: Event) => void;
  } {
    return {
      icon,
      label,
      href,
      active: this.state.currentScreen === screen,
      onClick: (event: Event) => {
        event.preventDefault();
        router.navigate(href);
      },
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

  private updateScreen(screen: ScreenId): void {
    if (this.state.currentScreen !== screen) {
      this.setState({ currentScreen: screen });
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

    if (this.activeScreenId !== this.state.currentScreen) {
      this.activeScreenInstance?.unmount();
      this.activeScreenInstance = this.createScreenInstance(
        this.state.currentScreen,
      );
      this.activeScreenId = this.state.currentScreen;
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
    if (screen === ScreenId.Workflows) {
      return new WorkflowsScreen({});
    }

    if (screen === ScreenId.Settings) {
      return new SettingsScreen({});
    }

    return new SettingsScreen({});
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
