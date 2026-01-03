import { storageKeys } from "../shared/constants.js";
import {
  clearChildren,
  createElement,
  isHTMLButtonElement,
  isHTMLInputElement,
  isHTMLElement,
  isHTMLSelectElement,
  selectElement
} from "../shared/dom.js";
import { normalizePath } from "../shared/format.js";
import { loadJson, removeStoredValue, saveJson } from "../shared/storage.js";

type ProjectStatus = "running" | "success" | "failed" | "paused" | "idle";
type StatusFilter = ProjectStatus | "all";

type ProjectStack = {
  id: string;
  label: string;
};

type ProjectEntry = {
  id: string;
  name: string;
  repo: string;
  stack: ProjectStack[];
  status: ProjectStatus;
  lastUpdate: string;
};

type RecentProject = {
  name: string;
  path: string;
  updated: string;
};

type ProjectsFilter = {
  query: string;
  status: StatusFilter;
};

type ProjectsState = {
  recents: RecentProject[];
  projects: ProjectEntry[];
  filter: ProjectsFilter;
};

type StatTargets = {
  total: HTMLElement | null;
  runners: HTMLElement | null;
  requests: HTMLElement | null;
  cost: HTMLElement | null;
};

const statusRunning: ProjectStatus = "running";
const statusSuccess: ProjectStatus = "success";
const statusFailed: ProjectStatus = "failed";
const statusPaused: ProjectStatus = "paused";
const statusIdle: ProjectStatus = "idle";
const statusAll: StatusFilter = "all";

const defaultStack: ProjectStack = { id: "ts", label: "TS" };
const pythonStack: ProjectStack = { id: "py", label: "PY" };
const dockerStack: ProjectStack = { id: "dk", label: "DK" };
const goStack: ProjectStack = { id: "go", label: "GO" };
const reactStack: ProjectStack = { id: "re", label: "RE" };

const statusOptions: { id: StatusFilter; label: string }[] = [
  { id: statusAll, label: "All statuses" },
  { id: statusRunning, label: "Running" },
  { id: statusSuccess, label: "Success" },
  { id: statusFailed, label: "Failed" },
  { id: statusPaused, label: "Paused" },
  { id: statusIdle, label: "Idle" }
];

const defaultProjects: ProjectEntry[] = [
  {
    id: "backend-microservices",
    name: "Backend-Microservices",
    repo: "github.com/iteronix/backend",
    stack: [pythonStack, dockerStack],
    status: statusRunning,
    lastUpdate: "2 min ago"
  },
  {
    id: "frontend-dashboard",
    name: "Frontend-Dashboard",
    repo: "github.com/iteronix/web-client",
    stack: [reactStack, defaultStack],
    status: statusSuccess,
    lastUpdate: "4 hours ago"
  },
  {
    id: "auth-service",
    name: "Auth-Service",
    repo: "github.com/iteronix/auth",
    stack: [goStack],
    status: statusFailed,
    lastUpdate: "1 day ago"
  },
  {
    id: "data-pipeline",
    name: "Data-Pipeline-V2",
    repo: "github.com/iteronix/data-pipeline",
    stack: [pythonStack, defaultStack],
    status: statusPaused,
    lastUpdate: "3 days ago"
  }
];

const defaultRecents: RecentProject[] = [
  { name: "Iteronix", path: "/workspace/iteronix", updated: "Today" },
  { name: "FlowForge", path: "/workspace/flowforge", updated: "Yesterday" }
];

const maxRecentProjects = 6;
const defaultRecentUpdateLabel = "Just now";
const defaultProjectName = "Project";
const statusFallbackLabel = "All statuses";
const scrollBlockCenter: ScrollLogicalPosition = "center";
const defaultApiRequests = 14203;
const defaultMonthlyCost = 14.5;
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const numberFormatter = new Intl.NumberFormat("en-US");

export const initProjectsScreen = (root: ParentNode): void => {
  const projectNameInput = selectElement(
    root,
    "[data-project-name]",
    isHTMLInputElement
  );
  const projectPathInput = selectElement(
    root,
    "[data-project-path]",
    isHTMLInputElement
  );
  const openPathInput = selectElement(
    root,
    "[data-open-path]",
    isHTMLInputElement
  );
  const createProjectButton = selectElement(
    root,
    "[data-create-project]",
    isHTMLButtonElement
  );
  const openProjectButton = selectElement(
    root,
    "[data-open-project]",
    isHTMLButtonElement
  );
  const projectSearchInput = selectElement(
    root,
    "[data-project-search]",
    isHTMLInputElement
  );
  const projectStatusSelect = selectElement(
    root,
    "[data-project-status]",
    isHTMLSelectElement
  );
  const projectTable = selectElement(root, "[data-project-table]", isHTMLElement);
  const projectsEmpty = selectElement(root, "[data-projects-empty]", isHTMLElement);
  const projectsFooter = selectElement(root, "[data-projects-footer]", isHTMLElement);
  const projectsStatus = selectElement(root, "[data-projects-status]", isHTMLElement);
  const newProjectButton = selectElement(
    root,
    "[data-project-new]",
    isHTMLButtonElement
  );
  const statTargets: StatTargets = {
    total: selectElement(root, "[data-stat-total]", isHTMLElement),
    runners: selectElement(root, "[data-stat-runners]", isHTMLElement),
    requests: selectElement(root, "[data-stat-requests]", isHTMLElement),
    cost: selectElement(root, "[data-stat-cost]", isHTMLElement)
  };
  const state: ProjectsState = {
    recents: loadRecentProjects(),
    projects: [],
    filter: {
      query: "",
      status: statusAll
    }
  };

  const rebuildCatalog = (): void => {
    state.projects = buildProjectCatalog(defaultProjects, state.recents);
  };

  const render = (): void => {
    rebuildCatalog();
    renderStatusOptions(projectStatusSelect, state.filter.status);
    renderProjects(projectTable, projectsEmpty, projectsFooter, projectsStatus, state);
    renderStats(statTargets, state.projects);
  };

  if (createProjectButton) {
    createProjectButton.addEventListener("click", () => {
      if (!projectNameInput || !projectPathInput) {
        return;
      }
      const name = projectNameInput.value.trim();
      const path = projectPathInput.value.trim();
      if (name === "" || path === "") {
        return;
      }
      updateRecents(state, {
        name,
        path,
        updated: defaultRecentUpdateLabel
      });
      projectNameInput.value = "";
      projectPathInput.value = "";
      render();
    });
  }

  if (openProjectButton) {
    openProjectButton.addEventListener("click", () => {
      if (!openPathInput) {
        return;
      }
      const path = openPathInput.value.trim();
      if (path === "") {
        return;
      }
      updateRecents(state, {
        name: inferProjectName(path),
        path,
        updated: defaultRecentUpdateLabel
      });
      openPathInput.value = "";
      render();
    });
  }

  if (projectSearchInput) {
    projectSearchInput.addEventListener("input", () => {
      state.filter.query = projectSearchInput.value.trim();
      renderProjects(projectTable, projectsEmpty, projectsFooter, projectsStatus, state);
    });
  }

  if (projectStatusSelect) {
    projectStatusSelect.addEventListener("change", () => {
      state.filter.status = resolveStatusFilter(projectStatusSelect.value);
      renderProjects(projectTable, projectsEmpty, projectsFooter, projectsStatus, state);
    });
  }

  if (newProjectButton && projectNameInput) {
    newProjectButton.addEventListener("click", () => {
      projectNameInput.focus();
      projectNameInput.scrollIntoView({ block: scrollBlockCenter });
    });
  }

  render();
};

const buildProjectCatalog = (
  baseProjects: ProjectEntry[],
  recents: RecentProject[]
): ProjectEntry[] => {
  const recentProjects = recents.map((recent) => buildProjectFromRecent(recent));
  const unique = new Map<string, ProjectEntry>();
  [...recentProjects, ...baseProjects].forEach((project) => {
    unique.set(project.id, project);
  });
  return Array.from(unique.values());
};

const renderStatusOptions = (
  select: HTMLSelectElement | null,
  current: StatusFilter
): void => {
  if (!select) {
    return;
  }
  clearChildren(select);
  statusOptions.forEach((option) => {
    const node = createElement("option");
    node.value = option.id;
    node.textContent = option.label;
    select.appendChild(node);
  });
  select.value = current;
};

const renderProjects = (
  table: HTMLElement | null,
  emptyState: HTMLElement | null,
  footer: HTMLElement | null,
  statusLabel: HTMLElement | null,
  state: ProjectsState
): void => {
  if (!table || !emptyState) {
    return;
  }
  const filtered = filterProjects(state.projects, state.filter);
  clearChildren(table);
  if (filtered.length === 0) {
    emptyState.style.display = "block";
  } else {
    emptyState.style.display = "none";
    filtered.forEach((project) => {
      table.appendChild(buildProjectRow(project));
    });
  }
  if (footer) {
    footer.textContent = `Showing ${filtered.length} of ${state.projects.length} projects`;
  }
  if (statusLabel) {
    statusLabel.textContent = resolveStatusLabel(state.filter.status);
  }
};

const renderStats = (targets: StatTargets, projects: ProjectEntry[]): void => {
  const total = projects.length;
  const runners = projects.filter((project) => project.status === statusRunning).length;
  if (targets.total) {
    targets.total.textContent = String(total);
  }
  if (targets.runners) {
    targets.runners.textContent = String(runners);
  }
  if (targets.requests) {
    targets.requests.textContent = numberFormatter.format(defaultApiRequests);
  }
  if (targets.cost) {
    targets.cost.textContent = currencyFormatter.format(defaultMonthlyCost);
  }
};

const filterProjects = (
  projects: ProjectEntry[],
  filter: ProjectsFilter
): ProjectEntry[] => {
  const query = filter.query.toLowerCase();
  return projects.filter((project) => {
    const matchesStatus = filter.status === statusAll || project.status === filter.status;
    if (!matchesStatus) {
      return false;
    }
    if (query === "") {
      return true;
    }
    return [
      project.name,
      project.repo,
      ...project.stack.map((item) => item.label)
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
};

const updateRecents = (state: ProjectsState, entry: RecentProject): void => {
  const normalizedPath = normalizePath(entry.path);
  const normalizedName = entry.name.trim() === "" ? normalizedPath : entry.name.trim();
  const normalizedUpdated =
    entry.updated.trim() === "" ? defaultRecentUpdateLabel : entry.updated.trim();
  const filtered = state.recents.filter((item) => item.path !== normalizedPath);
  state.recents = [
    {
      name: normalizedName,
      path: normalizedPath,
      updated: normalizedUpdated
    },
    ...filtered
  ].slice(0, maxRecentProjects);
  saveRecentProjects(state.recents);
};

const resolveStatusFilter = (value: string): StatusFilter => {
  if (statusOptions.some((option) => option.id === value)) {
    return value as StatusFilter;
  }
  return statusAll;
};

const resolveStatusLabel = (value: StatusFilter): string =>
  statusOptions.find((option) => option.id === value)?.label ?? statusFallbackLabel;

const buildProjectFromRecent = (recent: RecentProject): ProjectEntry => ({
  id: buildProjectId(recent.name, recent.path),
  name: recent.name,
  repo: recent.path,
  stack: [defaultStack],
  status: statusIdle,
  lastUpdate: recent.updated
});

const buildProjectRow = (project: ProjectEntry): HTMLElement => {
  const row = createElement("div", "project-row");
  const main = createElement("div", "project-main");
  const title = createElement("strong");
  title.textContent = project.name;
  const repo = createElement("span", "project-repo");
  repo.textContent = project.repo;
  main.appendChild(title);
  main.appendChild(repo);

  const stack = createElement("div", "stack-list");
  project.stack.forEach((item) => {
    const chip = createElement("span", "stack-chip");
    chip.textContent = item.label;
    stack.appendChild(chip);
  });

  const status = createElement("span", "status-chip");
  status.dataset["status"] = project.status;
  status.textContent = resolveStatusLabel(project.status);

  const updated = createElement("span");
  updated.textContent = project.lastUpdate;

  row.appendChild(main);
  row.appendChild(stack);
  row.appendChild(status);
  row.appendChild(updated);
  return row;
};

const buildProjectId = (name: string, path: string): string =>
  normalizePath(`${name}-${path}`).toLowerCase().replace(/[^a-z0-9]+/g, "-");

const loadRecentProjects = (): RecentProject[] =>
  loadJson(storageKeys.recents, parseRecentProjects, defaultRecents.slice());

const saveRecentProjects = (recents: RecentProject[]): void => {
  if (recents.length === 0) {
    removeStoredValue(storageKeys.recents);
    return;
  }
  saveJson(storageKeys.recents, recents);
};

const parseRecentProjects = (value: unknown): RecentProject[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecentProject).slice(0, maxRecentProjects);
};

const isRecentProject = (value: unknown): value is RecentProject => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value["name"]) &&
    isNonEmptyString(value["path"]) &&
    isNonEmptyString(value["updated"])
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const inferProjectName = (path: string): string => {
  const trimmed = normalizePath(path);
  const parts = trimmed.split(/[/\\]/);
  const last = parts[parts.length - 1];
  if (last) {
    return last;
  }
  return defaultProjectName;
};
