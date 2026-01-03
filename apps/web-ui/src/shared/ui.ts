export type NavigationItem = {
  id: string;
  label: string;
  target: string;
  chip: string;
};

export const headerActionIds = {
  connect: "connect",
  newRun: "new-run"
} as const;

export type HeaderActionId = typeof headerActionIds[keyof typeof headerActionIds];

export type HeaderAction = {
  id: HeaderActionId;
  label: string;
  variant: "primary" | "secondary";
  target: string;
};

export const navigationItems: NavigationItem[] = [
  { id: "overview", label: "Overview", target: "#overview", chip: "Shell" },
  { id: "projects", label: "Projects", target: "#projects", chip: "3" },
  { id: "repo", label: "Repository", target: "#repo", chip: "Tree" },
  { id: "runs", label: "Runs", target: "#runs", chip: "Live" },
  { id: "settings", label: "Settings", target: "#settings", chip: "Profiles" },
  { id: "kanban", label: "Kanban", target: "#kanban", chip: "Flow" }
];

export const headerActions: HeaderAction[] = [
  {
    id: headerActionIds.connect,
    label: "Connect",
    variant: "secondary",
    target: "#overview"
  },
  { id: headerActionIds.newRun, label: "New Run", variant: "primary", target: "#runs" }
];
