import { renderKanbanScreen } from "./screens/kanban.js";
import { renderOverviewScreen } from "./screens/overview.js";
import { renderProjectsScreen } from "./screens/projects.js";
import { renderRepositoryScreen } from "./screens/repository.js";
import { renderRunsScreen } from "./screens/runs.js";
import { renderSettingsScreen } from "./screens/settings.js";
import { routes } from "./shared/navigation.js";
import { initRouter } from "./shared/router.js";
import { renderShell } from "./shared/shell.js";

const appRoot = document.querySelector("#app");

if (appRoot instanceof HTMLElement) {
  const shell = renderShell();
  appRoot.appendChild(shell.app);

  initRouter({
    outlet: shell.outlet,
    navLinks: shell.navLinks,
    routes: [
      { route: routes.overview, render: renderOverviewScreen },
      { route: routes.projects, render: renderProjectsScreen },
      { route: routes.repository, render: renderRepositoryScreen },
      { route: routes.runs, render: renderRunsScreen },
      { route: routes.settings, render: renderSettingsScreen },
      { route: routes.kanban, render: renderKanbanScreen }
    ],
    fallback: routes.overview
  });
}
