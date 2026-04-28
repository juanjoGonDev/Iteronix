import { describe, expect, it } from "vitest";
import { createElement } from "./Component.js";

describe("createElement", () => {
  it("binds onInput handlers to the native input event", () => {
    const recorded: string[] = [];
    const originalDocument = globalThis.document;
    const fakeElement = createFakeElement(recorded);

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => fakeElement,
        createTextNode: (value: string) => ({
          nodeType: 3,
          textContent: value
        })
      }
    });

    try {
      createElement("input", {
        onInput: () => {
          recorded.push("handled");
        }
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument
        });
      }
    }

    expect(recorded).toEqual(["listener:input"]);
  });

  it("does not write undefined attributes into the element", () => {
    const recorded: string[] = [];
    const originalDocument = globalThis.document;
    const fakeElement = createFakeElement(recorded);

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => fakeElement,
        createTextNode: (value: string) => ({
          nodeType: 3,
          textContent: value
        })
      }
    });

    try {
      createElement("button", {
        title: undefined,
        onClick: undefined
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument
        });
      }
    }

    expect(recorded).not.toContain("attr:title=undefined");
    expect(recorded).not.toContain("attr:onClick=undefined");
  });

  it("binds onContextMenu handlers to the native contextmenu event", () => {
    const recorded: string[] = [];
    const originalDocument = globalThis.document;
    const fakeElement = createFakeElement(recorded);

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => fakeElement,
        createTextNode: (value: string) => ({
          nodeType: 3,
          textContent: value
        })
      }
    });

    try {
      createElement("button", {
        onContextMenu: () => {
          recorded.push("handled");
        }
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument
        });
      }
    }

    expect(recorded).toContain("listener:contextmenu");
  });

  it("binds onScroll handlers to the native scroll event", () => {
    const recorded: string[] = [];
    const originalDocument = globalThis.document;
    const fakeElement = createFakeElement(recorded);

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => fakeElement,
        createTextNode: (value: string) => ({
          nodeType: 3,
          textContent: value
        })
      }
    });

    try {
      createElement("div", {
        onScroll: () => {
          recorded.push("handled");
        }
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument
        });
      }
    }

    expect(recorded).toContain("listener:scroll");
  });
});

const createFakeElement = (recorded: string[]) => ({
  dataset: {} as Record<string, string>,
  appendChild: (_child: unknown) => undefined,
  addEventListener: (eventName: string, _listener: EventListener) => {
    recorded.push(`listener:${eventName}`);
  },
  setAttribute: (key: string, value: string) => {
    recorded.push(`attr:${key}=${value}`);
  },
  style: {} as CSSStyleDeclaration
});
