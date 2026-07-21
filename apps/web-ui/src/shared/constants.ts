// App version and constants
export const APP_VERSION = "0.0.1"; // Will be updated from package.json during build
export const COMPACT_VIEWPORT_MAX_WIDTH = 960;

// Route aliases configuration
export const ROUTES = {
  WORKFLOWS: "/workflows",
  WORKFLOW_EDITOR: "/workflows/:workflowId",
  PROMPT_ASSETS: "/assets/prompts",
  SKILL_ASSETS: "/assets/skills",
  MEMORY_ASSETS: "/assets/memory",
  SETTINGS: "/settings",
} as const;

export const workflowEditorRoute = (workflowId: string): string =>
  `/workflows/${encodeURIComponent(workflowId)}`;
