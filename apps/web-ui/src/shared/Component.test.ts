import { describe, expect, it } from "vitest";
import { Component } from "./Component.js";
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

  it("passes children into component props when using a component tag", () => {
    const recorded: string[] = [];
    const originalDocument = globalThis.document;

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => createFakeElement(recorded),
        createTextNode: (value: string) => ({
          nodeType: 3,
          textContent: value
        })
      }
    });

    try {
      createElement(TestChildComponent, {}, ["visible child"]);
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

    expect(recorded).toContain("text:visible child");
  });
});

class TestChildComponent extends Component<{ children?: unknown }> {
  override render(): HTMLElement {
    return createElement("div", {}, [this.props.children]);
  }
}

const createFakeElement = (recorded: string[]) => ({
  dataset: {} as Record<string, string>,
  appendChild: (child: unknown) => {
    const textContent = readNodeTextContent(child);
    if (textContent !== null) {
      recorded.push(`text:${textContent}`);
    }
    return undefined;
  },
  addEventListener: (eventName: string, _listener: EventListener) => {
    recorded.push(`listener:${eventName}`);
  },
  setAttribute: (key: string, value: string) => {
    recorded.push(`attr:${key}=${value}`);
  },
  style: {} as CSSStyleDeclaration
});

const readNodeTextContent = (value: unknown): string | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const node = value as { textContent?: unknown };
  return typeof node.textContent === "string" ? node.textContent : null;
};
