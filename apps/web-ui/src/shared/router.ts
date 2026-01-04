import { clearChildren } from "./dom.js";
import { type Route } from "./navigation.js";

export type RouteDefinition = {
  route: Route;
  render: () => HTMLElement;
};

type RouterOptions = {
  outlet: HTMLElement;
  navLinks: HTMLAnchorElement[];
  routes: RouteDefinition[];
  fallback: Route;
};

export const initRouter = (options: RouterOptions): void => {
  const onRouteChange = (): void => {
    const currentRoute = resolveRoute(window.location.hash, options.routes, options.fallback);
    renderRoute(options.outlet, options.routes, currentRoute);
    updateNavState(options.navLinks, currentRoute);
  };

  window.addEventListener("hashchange", onRouteChange);
  if (!window.location.hash) {
    window.location.hash = options.fallback;
  }
  onRouteChange();
};

const resolveRoute = (
  hash: string,
  definitions: RouteDefinition[],
  fallback: Route
): Route => {
  const match = definitions.find((definition) => definition.route === hash);
  return match ? match.route : fallback;
};

const renderRoute = (
  outlet: HTMLElement,
  definitions: RouteDefinition[],
  currentRoute: Route
): void => {
  const definition = definitions.find((item) => item.route === currentRoute);
  if (!definition) {
    return;
  }
  clearChildren(outlet);
  outlet.appendChild(definition.render());
};

const updateNavState = (links: HTMLAnchorElement[], currentRoute: Route): void => {
  links.forEach((link) => {
    const isActive = link.getAttribute("href") === currentRoute;
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
};
