import { iconNames, type IconName } from "./icons.js";

export const routes = {
  overview: "#/overview",
  projects: "#/projects",
  repository: "#/repository",
  runs: "#/runs",
  settings: "#/settings",
  kanban: "#/kanban"
} as const;

export type Route = typeof routes[keyof typeof routes];

export type NavigationItem = {
  id: string;
  label: string;
  route: Route;
  icon: IconName;
};

export const navigationItems: NavigationItem[] = [
  { id: "overview", label: "Overview", route: routes.overview, icon: iconNames.overview },
  { id: "projects", label: "Projects", route: routes.projects, icon: iconNames.projects },
  { id: "repository", label: "Repository", route: routes.repository, icon: iconNames.repository },
  { id: "runs", label: "Runs", route: routes.runs, icon: iconNames.runs },
  { id: "settings", label: "Settings", route: routes.settings, icon: iconNames.settings },
  { id: "kanban", label: "Kanban", route: routes.kanban, icon: iconNames.kanban }
];

export const headerActions = {
  connect: "connect",
  newRun: "newRun"
} as const;

export type HeaderAction = {
  id: typeof headerActions[keyof typeof headerActions];
  label: string;
};

export const headerActionItems: HeaderAction[] = [
  { id: headerActions.connect, label: "Connect" },
  { id: headerActions.newRun, label: "New Run" }
];
