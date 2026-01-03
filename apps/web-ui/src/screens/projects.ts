import { storageKeys } from "../shared/constants.js";
import {
  clearChildren,
  createElement,
  isHTMLButtonElement,
  isHTMLInputElement,
  isHTMLElement,
  selectElement
} from "../shared/dom.js";
import { normalizePath } from "../shared/format.js";
import { loadJson, removeStoredValue, saveJson } from "../shared/storage.js";

type RecentProject = {
  name: string;
  path: string;
  updated: string;
};

type ProjectsState = {
  recents: RecentProject[];
};

const maxRecentProjects = 5;

const defaultRecents: RecentProject[] = [
  { name: "Iteronix", path: "/workspace/iteronix", updated: "Today" },
  { name: "FlowForge", path: "/workspace/flowforge", updated: "Yesterday" }
];

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
  const recentList = selectElement(root, "[data-recent-list]", isHTMLElement);
  const recentEmpty = selectElement(root, "[data-recent-empty]", isHTMLElement);
  const state: ProjectsState = {
    recents: loadRecentProjects()
  };

  const render = (): void => {
    if (!recentList || !recentEmpty) {
      return;
    }
    clearChildren(recentList);
    if (state.recents.length === 0) {
      recentEmpty.style.display = "block";
      return;
    }
    recentEmpty.style.display = "none";
    state.recents.forEach((item) => {
      recentList.appendChild(buildRecentItem(item));
    });
  };

  const addRecent = (entry: RecentProject): void => {
    const normalizedPath = normalizePath(entry.path);
    const normalizedName = entry.name.trim() === "" ? normalizedPath : entry.name.trim();
    const normalizedUpdated = entry.updated.trim() === "" ? "Just now" : entry.updated.trim();
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
    render();
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
      addRecent({
        name,
        path,
        updated: "Just now"
      });
      projectNameInput.value = "";
      projectPathInput.value = "";
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
      addRecent({
        name: inferProjectName(path),
        path,
        updated: "Just now"
      });
      openPathInput.value = "";
    });
  }

  render();
};

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
  return "Project";
};

const buildRecentItem = (item: RecentProject): HTMLElement => {
  const wrapper = createElement("div", "recent-item");
  const name = createElement("strong");
  name.textContent = item.name;
  const path = createElement("span");
  path.textContent = item.path;
  const updated = createElement("small");
  updated.textContent = item.updated;
  wrapper.appendChild(name);
  wrapper.appendChild(path);
  wrapper.appendChild(updated);
  return wrapper;
};
