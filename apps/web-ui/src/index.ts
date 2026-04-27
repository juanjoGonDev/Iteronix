import { Component, createElement, type ComponentProps } from "./shared/Component.js";
import { MainLayout, Header } from "./components/Layout.js";
import { Sidebar } from "./components/Navigation.js";
import { APP_VERSION, ROUTES } from "./shared/constants.js";
import { router } from "./shared/Router.js";
import { installClientLogForwarder } from "./shared/logger-impl.js";
import {
  ProjectSessionEventName,
  readActiveProjectSessionLabel,
  readProjectSession,
  type ProjectSessionState
} from "./shared/project-session.js";
import { DashboardScreen } from "./screens/Dashboard.js";
import { Explorer } from "./screens/Explorer.js";
import { KanbanBoard } from "./screens/Kanban.js";
import { SettingsScreen } from "./screens/Settings.js";
import { WorkflowsScreen } from "./screens/Workflows.js";
import { HistoryScreen } from "./screens/History.js";
import { ProjectsScreen } from "./screens/Projects.js";

const ScreenId = {
  Overview: "overview",
  Projects: "projects",
  Explorer: "explorer",
  Kanban: "kanban",
  Workflows: "workflows",
  History: "history",
  Settings: "settings"
} as const;

type ScreenId = typeof ScreenId[keyof typeof ScreenId];

const RootRoute = "/";

const ScreenLabel: Record<ScreenId, string> = {
  overview: "Overview",
  projects: "Projects",
  explorer: "Explorer",
  kanban: "Kanban",
  workflows: "Workflows",
  history: "History",
  settings: "Settings"
};

interface AppState {
  currentScreen: ScreenId;
  sidebarCollapsed: boolean;
  projectSession: ProjectSessionState;
}

interface AppProps extends ComponentProps {
  [key: string]: unknown;
}

export class App extends Component<AppProps, AppState> {
  constructor(props: AppProps) {
    super(props, {
      currentScreen: ScreenId.Overview,
      sidebarCollapsed: false,
      projectSession: readProjectSession()
    });

    installClientLogForwarder();
    this.setupRouter();

    console.info("Application started", {
      version: APP_VERSION,
      screen: ScreenId.Overview
    });
  }

  override render(): HTMLElement {
    const projectLabel = readActiveProjectSessionLabel(this.state.projectSession);
    const hasProject = this.state.projectSession.projectRootPath.length > 0;

    return createElement(MainLayout, {
      sidebar: createElement(Sidebar, {
        brand: {
          name: "Iteronix",
          icon: "terminal",
          version: `v${APP_VERSION}`
        },
        project: hasProject
          ? {
              label: projectLabel,
              rootPath: this.state.projectSession.projectRootPath
            }
          : null,
        onProjectClick: () => router.navigate(ROUTES.PROJECTS),
        navigation: this.buildNavigationItems(),
        user: {
          name: "John Doe",
          role: "DevOps Lead",
          avatar: null
        },
        onToggle: () => this.setState({ sidebarCollapsed: !this.state.sidebarCollapsed }),
        collapsed: this.state.sidebarCollapsed
      }),
      header: () => this.renderHeader(),
      className: "transition-all duration-300",
      sidebarCollapsed: this.state.sidebarCollapsed,
      children: this.renderCurrentScreen()
    });
  }

  override onMount(): void {
    window.addEventListener(ProjectSessionEventName.Changed, this.handleProjectSessionChanged);
  }

  override onUnmount(): void {
    window.removeEventListener(ProjectSessionEventName.Changed, this.handleProjectSessionChanged);
  }

  private setupRouter(): void {
    router.register(RootRoute, () => this.updateScreen(ScreenId.Overview));
    router.register(ROUTES.OVERVIEW, () => this.updateScreen(ScreenId.Overview));
    router.register(ROUTES.PROJECTS, () => this.updateScreen(ScreenId.Projects));
    router.register(ROUTES.EXPLORER, () => this.updateScreen(ScreenId.Explorer));
    router.register(ROUTES.KANBAN, () => this.updateScreen(ScreenId.Kanban));
    router.register(ROUTES.WORKFLOWS, () => this.updateScreen(ScreenId.Workflows));
    router.register(ROUTES.HISTORY, () => this.updateScreen(ScreenId.History));
    router.register(ROUTES.SETTINGS, () => this.updateScreen(ScreenId.Settings));
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
      this.createNavigationItem(ScreenId.Overview, "dashboard", ScreenLabel.overview, ROUTES.OVERVIEW),
      this.createNavigationItem(ScreenId.Projects, "folder_open", ScreenLabel.projects, ROUTES.PROJECTS),
      this.createNavigationItem(ScreenId.Explorer, "code", ScreenLabel.explorer, ROUTES.EXPLORER),
      this.createNavigationItem(ScreenId.Kanban, "view_kanban", ScreenLabel.kanban, ROUTES.KANBAN),
      this.createNavigationItem(ScreenId.Workflows, "account_tree", ScreenLabel.workflows, ROUTES.WORKFLOWS),
      this.createNavigationItem(ScreenId.History, "history", ScreenLabel.history, ROUTES.HISTORY),
      this.createNavigationItem(ScreenId.Settings, "settings", ScreenLabel.settings, ROUTES.SETTINGS)
    ];
  }

  private createNavigationItem(
    screen: ScreenId,
    icon: string,
    label: string,
    href: string
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
      }
    };
  }

  private renderHeader(): HTMLElement {
    const actions = buildHeaderActions(this.state.currentScreen);

    return createElement(Header, {
      title: this.state.currentScreen === ScreenId.Overview ? null : ScreenLabel[this.state.currentScreen],
      breadcrumbs:
        this.state.currentScreen === ScreenId.Overview
          ? []
          : [
              { label: "Iteronix", href: ROUTES.OVERVIEW },
              { label: ScreenLabel[this.state.currentScreen] }
            ],
      actions
    });
  }

  private renderCurrentScreen(): HTMLElement {
    if (this.state.currentScreen === ScreenId.Overview) {
      return createElement(DashboardScreen, {});
    }

    if (this.state.currentScreen === ScreenId.Explorer) {
      return createElement(Explorer, {});
    }

    if (this.state.currentScreen === ScreenId.Kanban) {
      return createElement(KanbanBoard, {});
    }

    if (this.state.currentScreen === ScreenId.Workflows) {
      return createElement(WorkflowsScreen, {});
    }

    if (this.state.currentScreen === ScreenId.History) {
      return createElement(HistoryScreen, {});
    }

    if (this.state.currentScreen === ScreenId.Settings) {
      return createElement(SettingsScreen, {});
    }

    if (this.state.currentScreen === ScreenId.Projects) {
      return createElement(ProjectsScreen, {});
    }

    return renderPlaceholderScreen({
      title: "Unavailable screen",
      description: `The route for ${this.state.currentScreen} is not wired yet.`
    });
  }

  private updateScreen(screen: ScreenId): void {
    if (this.state.currentScreen !== screen) {
      this.setState({ currentScreen: screen });
    }
  }

  private readonly handleProjectSessionChanged = (): void => {
    const nextSession = readProjectSession();
    if (
      nextSession.projectRootPath === this.state.projectSession.projectRootPath &&
      nextSession.projectName === this.state.projectSession.projectName &&
      JSON.stringify(nextSession.recentProjects) === JSON.stringify(this.state.projectSession.recentProjects)
    ) {
      return;
    }

    this.setState({
      projectSession: nextSession
    });
  };
}

const renderPlaceholderScreen = (input: {
  title: string;
  description: string;
}): HTMLElement =>
  createElement("div", {
    className: "mx-auto flex h-full w-full max-w-[960px] items-center justify-center p-8"
  }, [
    createElement("div", {
      className: "rounded-xl border border-border-dark bg-surface-dark px-8 py-10 text-left"
    }, [
      createElement("h1", { className: "text-2xl font-semibold text-white" }, [input.title]),
      createElement("p", { className: "mt-3 max-w-xl text-sm leading-6 text-text-secondary" }, [input.description])
    ])
  ]);

const buildHeaderActions = (screen: ScreenId): {
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
      onClick: () => router.navigate(ROUTES.HISTORY)
    }
  };

  if (screen === ScreenId.Overview) {
    actions.status = {
      api: "API online",
      runners: "workbench ready"
    };
    actions.primary = {
      icon: "smart_toy",
      label: "Open Workbench",
      onClick: () => router.navigate(ROUTES.WORKFLOWS)
    };
  }

  return actions;
};

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
