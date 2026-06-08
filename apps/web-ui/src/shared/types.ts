

export interface NavigationItem {
  icon: string;
  label: string;
  href: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string | null;
  className?: string;
}

export interface Brand {
  name: string;
  icon: string;
  version: string | null;
}

export interface User {
  name: string;
  role?: string;
  avatar: string | null;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

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