import { initKanbanScreen } from "./screens/kanban.js";
import { initConnectionScreen } from "./screens/connection.js";
import { initProjectsScreen } from "./screens/projects.js";
import { initRepoScreen } from "./screens/repo.js";
import { initRunsScreen } from "./screens/runs.js";
import { initSettingsScreen } from "./screens/settings.js";
import { storageKeys } from "./shared/constants.js";
import { registerServiceWorker } from "./shared/service-worker.js";
import { getStoredValue } from "./shared/storage.js";
import { createStore } from "./shared/store.js";

const appRoot = document.querySelector("[data-app]");

if (appRoot instanceof HTMLElement) {
  const baseUrlStore = createStore(getStoredValue(storageKeys.baseUrl, ""));
  const tokenStore = createStore(getStoredValue(storageKeys.token, ""));

  initConnectionScreen({ root: appRoot, baseUrlStore, tokenStore });
  initProjectsScreen(appRoot);
  initRepoScreen(appRoot);
  initRunsScreen({ root: appRoot, baseUrlStore });
  initSettingsScreen(appRoot);
  initKanbanScreen(appRoot);
  registerServiceWorker();
}
