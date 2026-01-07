// Simple hash-based router

interface RouteHandler {
  (params: Record<string, string>): void;
}

interface RouteInfo {
  path: string | null;
  params: Record<string, string>;
}

export class Router {
  private routes: Map<string, RouteHandler>;
  private currentRoute: string | null;
  private params: Record<string, string>;

  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.params = {};
    this.init();
  }

  // Initialize router
  private init(): void {
    window.addEventListener('popstate', () => {
      this.handleRouteChange();
    });
    
    // Handle initial route
    this.handleRouteChange();
  }

  // Register a route
  register(path: string, handler: RouteHandler): void {
    this.routes.set(path, handler);
  }

  // Navigate to a route
  navigate(path: string): void {
    // Prevent infinite recursion
    if (window.location.pathname === path) {
      return;
    }
    try {
      window.history.pushState({}, '', path);
      this.handleRouteChange();
    } catch (error) {
      console.warn('Navigation error:', error);
    }
  }

  // Handle route change
  private handleRouteChange(): void {
    const pathname = window.location.pathname || '/';
    const [routePath, ...paramParts] = pathname.split('/');
    
    // Prevent recursion if same route
    if (this.currentRoute === routePath) {
      return;
    }
    
    // Find matching route
    let matchedRoute: string | null = null;
    let params: Record<string, string> = {};

    // Exact match first
    if (routePath && this.routes.has(routePath)) {
      matchedRoute = routePath;
    } else {
      // Pattern matching for dynamic routes
      for (const [route] of Array.from(this.routes.entries())) {
        const routeParts = route.split('/');
        if (routeParts.length === paramParts.length + 1) {
          const routeParams: Record<string, string> = {};
          let isMatch = true;

          for (let i = 0; i < routeParts.length; i++) {
            const routePart = routeParts[i];
            const paramPart = paramParts[i];

            if (!routePart) continue;

            if (routePart.startsWith(':')) {
              // Dynamic parameter
              routeParams[routePart.slice(1)] = paramPart || '';
            } else if (routePart !== paramPart) {
              isMatch = false;
              break;
            }
          }

          if (isMatch) {
            matchedRoute = route;
            params = routeParams;
            break;
          }
        }
      }
    }

    if (matchedRoute) {
      this.currentRoute = matchedRoute;
      this.params = params;
      
      // Execute route handler
      const handler = this.routes.get(matchedRoute);
      if (handler) {
        handler(params);
      }
    } else {
      // 404 - Route not found
      this.handleNotFound();
    }
  }

  // Handle 404
  private handleNotFound(): void {
    console.warn(`Route not found: ${window.location.pathname}`);
    // Navigate to default route or show 404 page
    this.navigate('/');
  }

  // Get current route info
  getCurrentRoute(): RouteInfo {
    return {
      path: this.currentRoute,
      params: this.params
    };
  }
}

// Global router instance
export const router = new Router();