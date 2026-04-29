import { describe, expect, it } from "vitest";
import {
  PageNoticeStack,
  readPageIntroDescriptionClassName,
  readPageIntroTitleClassName,
  readPageFrameClassName,
  readPageIntroClassName,
  readPageTabButtonClassName,
  readPageTabsContainerClassName,
  readToastViewportClassName,
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
    expect(readToastViewportClassName()).toContain("fixed");
    expect(readToastViewportClassName()).toContain("z-50");
    expect(readToastClassName("success")).toContain("bg-emerald-50");
    expect(readToastClassName("error")).toContain("bg-rose-50");
    expect(readToastClassName("success")).not.toContain("/10");
  });

  it("keeps page notices out of the page layout because notifications are global toasts", () => {
    const recorded = renderWithFakeDocument(() => {
      new PageNoticeStack({
        errorMessage: "A project root path is required.",
        noticeMessage: null
      }).render();
    });

    expect(recorded).toContain("attr:data-notice-stack=global-toast-adapter");
    expect(recorded).not.toContain("text:A project root path is required.");
  });
});

const renderWithFakeDocument = (callback: () => void): string[] => {
  const recorded: string[] = [];
  const originalDocument = globalThis.document;
  const originalHtmlElement = globalThis.HTMLElement;
  class FakeHtmlElement {
    className = "";
    dataset: Record<string, string> = {};

    appendChild(child: unknown): void {
      const textContent = readNodeTextContent(child);
      if (textContent !== null) {
        recorded.push(`text:${textContent}`);
      }
    }

    addEventListener(eventName: string, _listener: EventListener): void {
      recorded.push(`listener:${eventName}`);
    }

    setAttribute(key: string, value: string): void {
      recorded.push(`attr:${key}=${value}`);
    }
  }

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: new FakeHtmlElement(),
      getElementById: () => null,
      createElement: () => new FakeHtmlElement(),
      createTextNode: (value: string) => ({
        nodeType: 3,
        textContent: value
      })
    }
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeHtmlElement
  });

  try {
    callback();
  } finally {
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument
      });
    }

    if (originalHtmlElement === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    } else {
      Object.defineProperty(globalThis, "HTMLElement", {
        configurable: true,
        value: originalHtmlElement
      });
    }
  }

  return recorded;
};

const readNodeTextContent = (value: unknown): string | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const node = value as { textContent?: unknown };
  return typeof node.textContent === "string" ? node.textContent : null;
};
