// App version and constants
export const APP_VERSION = "0.0.1"; // Will be updated from package.json during build
export const COMPACT_VIEWPORT_MAX_WIDTH = 960;

// Route aliases configuration
export const ROUTES = {
  OVERVIEW: "/overview",
  PROJECTS: "/projects",
  WORKFLOWS: "/workflows",
  EXPLORER: "/explorer",
  KANBAN: "/kanban",
  HISTORY: "/history",
  SETTINGS: "/settings",
} as const;
