import { describe, expect, it } from "vitest";
import {
  readSidebarNavigationClassName,
  readSidebarRootClassName
} from "./Navigation.js";

describe("Sidebar layout classes", () => {
  it("keeps the sidebar root bounded so the navigation can scroll", () => {
    expect(readSidebarRootClassName("custom-shell")).toBe(
      "flex h-full min-h-0 flex-col overflow-hidden custom-shell"
    );
  });

  it("makes the navigation area scroll independently in expanded and collapsed modes", () => {
    expect(readSidebarNavigationClassName(false)).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(readSidebarNavigationClassName(false)).toContain("py-6 px-3");
    expect(readSidebarNavigationClassName(true)).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(readSidebarNavigationClassName(true)).toContain("py-4 px-1");
  });
});
