interface RouteHandler {
  (params: Record<string, string>): void;
}

export interface RouteInfo {
  path: string | null;
  params: Record<string, string>;
}

export interface RouteMatch {
  route: string;
  params: Record<string, string>;
}

const Separator = {
  Slash: "/"
} as const;

export const normalizeRoutePath = (path: string): string => {
  const trimmed = path.trim();
  if (trimmed.length === 0 || trimmed === Separator.Slash) {
    return Separator.Slash;
  }

  const withLeadingSlash = trimmed.startsWith(Separator.Slash)
    ? trimmed
    : `${Separator.Slash}${trimmed}`;

  return withLeadingSlash.endsWith(Separator.Slash)
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
};

export const matchRoutePath = (
  pathname: string,
  routes: ReadonlyArray<string>
): RouteMatch | undefined => {
  const normalizedPath = normalizeRoutePath(pathname);
  const pathSegments = splitRoute(normalizedPath);

  for (const route of routes) {
    const normalizedRoute = normalizeRoutePath(route);
    const routeSegments = splitRoute(normalizedRoute);
    if (routeSegments.length !== pathSegments.length) {
      continue;
    }

    const params: Record<string, string> = {};
    let matches = true;

    for (let index = 0; index < routeSegments.length; index += 1) {
      const routeSegment = routeSegments[index];
      const pathSegment = pathSegments[index];

      if (routeSegment === undefined || pathSegment === undefined) {
        matches = false;
        break;
      }

      if (routeSegment.startsWith(":")) {
        params[routeSegment.slice(1)] = pathSegment;
        continue;
      }

      if (routeSegment !== pathSegment) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return {
        route: normalizedRoute,
        params
      };
    }
  }

  return undefined;
};

export class Router {
  private routes: Map<string, RouteHandler>;
  private currentRoute: string | null;
  private params: Record<string, string>;
  private initialized: boolean;

  constructor(input?: { autoInit?: boolean }) {
    this.routes = new Map();
    this.currentRoute = null;
    this.params = {};
    this.initialized = false;
    if (input?.autoInit !== false && canUseBrowserRouter()) {
      this.start();
    }
  }

  start(): void {
    if (this.initialized || !canUseBrowserRouter()) {
      return;
    }

    this.initialized = true;
    window.addEventListener("popstate", () => {
      this.handleRouteChange();
    });

    this.handleRouteChange();
  }

  register(path: string, handler: RouteHandler): void {
    this.routes.set(normalizeRoutePath(path), handler);
  }

  navigate(path: string): void {
    if (!canUseBrowserRouter()) {
      return;
    }

    const normalizedPath = normalizeRoutePath(path);
    if (window.location.pathname === normalizedPath) {
      return;
    }

    try {
      window.history.pushState({}, "", normalizedPath);
      this.handleRouteChange();
    } catch (error) {
      console.warn("Navigation error:", error);
    }
  }

  private handleRouteChange(): void {
    const pathname = canUseBrowserRouter()
      ? normalizeRoutePath(window.location.pathname)
      : Separator.Slash;
    const match = matchRoutePath(pathname, [...this.routes.keys()]);

    if (!match) {
      this.handleNotFound();
      return;
    }

    if (this.currentRoute === match.route) {
      return;
    }

    this.currentRoute = match.route;
    this.params = match.params;

    const handler = this.routes.get(match.route);
    if (handler) {
      handler(match.params);
    }
  }

  private handleNotFound(): void {
    if (!canUseBrowserRouter()) {
      return;
    }

    console.warn(`Route not found: ${window.location.pathname}`);
    this.navigate("/");
  }

  getCurrentRoute(): RouteInfo {
    return {
      path: this.currentRoute,
      params: this.params
    };
  }
}

const splitRoute = (path: string): ReadonlyArray<string> => {
  if (path === Separator.Slash) {
    return [];
  }

  return path.slice(1).split(Separator.Slash);
};

function canUseBrowserRouter(): boolean {
  return typeof window !== "undefined" && typeof window.location !== "undefined";
}

export const router = new Router({ autoInit: false });
