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
          textContent: value,
        }),
      },
    });

    try {
      createElement("input", {
        onInput: () => {
          recorded.push("handled");
        },
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      }
    }

    expect(recorded).toContain("listener:input");
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
          textContent: value,
        }),
      },
    });

    try {
      createElement("button", {
        title: undefined,
        onClick: undefined,
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      }
    }

    expect(recorded).not.toContain("attr:title=undefined");
    expect(recorded).not.toContain("attr:onClick=undefined");
  });

  it("writes form values to DOM properties instead of inert attributes", () => {
    const recorded: string[] = [];
    const originalDocument = globalThis.document;
    const fakeElement = createFakeElement(recorded);

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => fakeElement,
        createTextNode: (value: string) => ({
          nodeType: 3,
          textContent: value,
        }),
      },
    });

    try {
      createElement("select", {
        value: "planner",
      });
      createElement("input", {
        checked: true,
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      }
    }

    expect(recorded).toContain("property:value=planner");
    expect(recorded).toContain("property:checked=true");
    expect(recorded).not.toContain("attr:value=planner");
    expect(recorded).not.toContain("attr:checked=");
  });

  it("binds onBlur handlers to the native blur event", () => {
    const recorded: string[] = [];
    const originalDocument = globalThis.document;
    const fakeElement = createFakeElement(recorded);

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => fakeElement,
        createTextNode: (value: string) => ({
          nodeType: 3,
          textContent: value,
        }),
      },
    });

    try {
      createElement("input", {
        onBlur: () => {
          recorded.push("handled");
        },
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      }
    }

    expect(recorded).toContain("listener:blur");
  });

  it("binds onKeyDown handlers to the native keydown event", () => {
    const recorded: string[] = [];
    const originalDocument = globalThis.document;
    const fakeElement = createFakeElement(recorded);

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => fakeElement,
        createTextNode: (value: string) => ({
          nodeType: 3,
          textContent: value,
        }),
      },
    });

    try {
      createElement("input", {
        onKeyDown: () => {
          recorded.push("handled");
        },
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      }
    }

    expect(recorded).toContain("listener:keydown");
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
          textContent: value,
        }),
      },
    });

    try {
      createElement("button", {
        onContextMenu: () => {
          recorded.push("handled");
        },
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
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
          textContent: value,
        }),
      },
    });

    try {
      createElement("div", {
        onScroll: () => {
          recorded.push("handled");
        },
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      }
    }

    expect(recorded).toContain("listener:scroll");
  });

  it("binds onPointerDown handlers to the native pointerdown event", () => {
    const recorded: string[] = [];
    const originalDocument = globalThis.document;
    const fakeElement = createFakeElement(recorded);

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => fakeElement,
        createTextNode: (value: string) => ({
          nodeType: 3,
          textContent: value,
        }),
      },
    });

    try {
      createElement("button", {
        onPointerDown: () => {
          recorded.push("handled");
        },
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      }
    }

    expect(recorded).toContain("listener:pointerdown");
  });

  it("creates svg child elements with the svg namespace", () => {
    const recorded: string[] = [];
    const originalDocument = globalThis.document;

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: (tagName: string) =>
          createFakeElement(recorded, `html:${tagName}`),
        createElementNS: (namespace: string, tagName: string) =>
          createFakeElement(recorded, `${namespace}:${tagName}`),
        createTextNode: (value: string) => ({
          nodeType: 3,
          textContent: value,
        }),
      },
    });

    try {
      createElement("path", {
        d: "M 0 0 L 10 10",
      });
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
        });
      }
    }

    expect(recorded).toContain("element:http://www.w3.org/2000/svg:path");
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
          textContent: value,
        }),
      },
    });

    try {
      createElement(TestChildComponent, {}, ["visible child"]);
    } finally {
      if (originalDocument === undefined) {
        Reflect.deleteProperty(globalThis, "document");
      } else {
        Object.defineProperty(globalThis, "document", {
          configurable: true,
          value: originalDocument,
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

const createFakeElement = (
  recorded: string[],
  elementName = "html:element",
) => {
  recorded.push(`element:${elementName}`);
  return {
    set value(value: string) {
      recorded.push(`property:value=${value}`);
    },
    set checked(value: boolean) {
      recorded.push(`property:checked=${String(value)}`);
    },
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
    style: {} as CSSStyleDeclaration,
  };
};

const readNodeTextContent = (value: unknown): string | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const node = value as { textContent?: unknown };
  return typeof node.textContent === "string" ? node.textContent : null;
};
