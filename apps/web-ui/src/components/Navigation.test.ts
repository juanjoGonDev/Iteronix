import { describe, expect, it } from "vitest";
import {
  readNavigationEntryClassName,
  readNavigationGroupItemsClassName,
  readNavigationGroupToggleClassName,
  readSidebarNavigationClassName,
  readSidebarRootClassName,
} from "./Navigation.js";

describe("Sidebar layout classes", () => {
  it("keeps the sidebar root bounded so the navigation can scroll", () => {
    expect(readSidebarRootClassName("custom-shell")).toBe(
      "flex h-full min-h-0 flex-col overflow-hidden custom-shell",
    );
  });

  it("makes the navigation area scroll independently in expanded and collapsed modes", () => {
    for (const collapsed of [false, true]) {
      const value = readSidebarNavigationClassName(collapsed);
      expect(value).toContain("min-h-0");
      expect(value).toContain("flex-1");
      expect(value).toContain("overflow-y-auto");
      expect(value).toContain("overscroll-contain");
    }
    expect(readSidebarNavigationClassName(false)).toContain("px-3 py-4");
    expect(readSidebarNavigationClassName(true)).toContain("px-2 py-3");
  });

  it("keeps expandable navigation groups accessible and visually nested", () => {
    expect(readNavigationGroupToggleClassName(false, false)).toContain(
      "text-text-secondary",
    );
    expect(readNavigationGroupToggleClassName(true, false)).toContain(
      "text-white",
    );
    expect(readNavigationGroupItemsClassName(false)).toContain("pl-4");
    expect(readNavigationGroupItemsClassName(true)).toContain("items-center");
  });

  it("collapses the rail into a uniform stack of centered tiles", () => {
    const collapsed = readNavigationEntryClassName({
      active: false,
      collapsed: true,
    });
    // One fixed square per entry, centered — no full-width rows that clip or
    // drift apart in the narrow rail.
    expect(collapsed).toContain("h-10 w-10");
    expect(collapsed).toContain("items-center justify-center");
    expect(collapsed).toContain("mx-auto");
  });

  it("highlights active entries with a ring instead of a layout-shifting border", () => {
    const active = readNavigationEntryClassName({
      active: true,
      collapsed: false,
    });
    expect(active).toContain("ring-1 ring-inset");
    expect(active).not.toContain("border-primary");
  });
});
