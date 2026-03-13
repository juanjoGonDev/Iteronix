import { afterEach, describe, expect, it } from "vitest";
import { Router, matchRoutePath, normalizeRoutePath } from "./Router.js";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
    return;
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow
  });
});

describe("router path helpers", () => {
  it("normalizes root and named paths consistently", () => {
    expect(normalizeRoutePath("")).toBe("/");
    expect(normalizeRoutePath("/")).toBe("/");
    expect(normalizeRoutePath("workflows")).toBe("/workflows");
    expect(normalizeRoutePath("/history/")).toBe("/history");
  });

  it("matches static and dynamic routes", () => {
    const staticMatch = matchRoutePath("/workflows", ["/overview", "/workflows"]);
    expect(staticMatch).toEqual({
      route: "/workflows",
      params: {}
    });

    const dynamicMatch = matchRoutePath("/history/run-42", ["/history/:entryId"]);
    expect(dynamicMatch).toEqual({
      route: "/history/:entryId",
      params: {
        entryId: "run-42"
      }
    });
  });

  it("resolves the initial browser location after routes are registered", () => {
    let currentPath = "/workflows";
    let activeRoute = "";
    let popstateHandler: (() => void) | undefined;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          pathname: currentPath
        },
        history: {
          pushState: (_state: object, _title: string, path: string) => {
            currentPath = path;
          }
        },
        addEventListener: (eventName: string, listener: () => void) => {
          if (eventName === "popstate") {
            popstateHandler = listener;
          }
        }
      }
    });

    const router = new Router({ autoInit: false });
    router.register("/overview", () => {
      activeRoute = "overview";
    });
    router.register("/workflows", () => {
      activeRoute = "workflows";
    });

    router.start();
    popstateHandler?.();

    expect(activeRoute).toBe("workflows");
    expect(router.getCurrentRoute()).toEqual({
      path: "/workflows",
      params: {}
    });
  });
});
