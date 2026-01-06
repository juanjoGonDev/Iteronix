// App version and constants
export const APP_VERSION = '0.0.1'; // Will be updated from package.json during build

// Route aliases configuration
export const ROUTES = {
  OVERVIEW: '#overview',
  PROJECTS: '#projects', 
  WORKFLOWS: '#workflows',
  HISTORY: '#history',
  SETTINGS: '#settings'
} as const;

export type RouteKey = keyof typeof ROUTES;

// Route screen mapping
export const SCREENS = {
  [ROUTES.OVERVIEW]: 'Overview',
  [ROUTES.PROJECTS]: 'Projects',
  [ROUTES.WORKFLOWS]: 'Workflows', 
  [ROUTES.HISTORY]: 'History',
  [ROUTES.SETTINGS]: 'Settings'
} as const;