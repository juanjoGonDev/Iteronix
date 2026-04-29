import { describe, expect, it } from "vitest";
import {
  readPageIntroDescriptionClassName,
  readPageIntroTitleClassName,
  readPageFrameClassName,
  readPageIntroClassName,
  readPageTabButtonClassName,
  readPageTabsContainerClassName,
  readToastClassName
} from "./PageScaffold.js";

describe("PageScaffold", () => {
  it("keeps the canonical screen container classes", () => {
    expect(readPageFrameClassName("max-w-[1600px]")).toBe(
      "mx-auto flex w-full max-w-[1480px] flex-col gap-6 p-6 max-w-[1600px]"
    );
    expect(readPageIntroClassName()).toBe(
      "flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
    );
  });

  it("supports sticky tabs without changing the shared underline pattern", () => {
    expect(readPageTabsContainerClassName(true)).toContain("sticky top-0 z-10");
    expect(readPageTabsContainerClassName(true)).toContain("border-b border-slate-300");
    expect(readPageTabsContainerClassName(true)).not.toContain("backdrop-blur");
    expect(readPageTabButtonClassName(true)).toContain("border-slate-950");
    expect(readPageTabButtonClassName(true)).toContain("text-slate-950");
    expect(readPageTabButtonClassName(false)).toContain("border-transparent");
    expect(readPageTabButtonClassName(false)).toContain("text-slate-600");
  });

  it("keeps page intro contrast readable on the shared light surface", () => {
    expect(readPageIntroTitleClassName()).toContain("text-slate-950");
    expect(readPageIntroDescriptionClassName()).toContain("text-slate-600");
  });

  it("uses solid toast surfaces with close controls instead of inline translucent alerts", () => {
    expect(readToastClassName("success")).toContain("bg-emerald-50");
    expect(readToastClassName("error")).toContain("bg-rose-50");
    expect(readToastClassName("success")).not.toContain("/10");
  });
});
