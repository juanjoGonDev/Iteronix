import { describe, expect, it } from "vitest";
import { Button } from "./Button.js";

describe("Button", () => {
  it("forwards data attributes to the native button element", () => {
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
      const button = new Button({
        children: "Files",
        "data-testid": "explorer-compact-toggle-files"
      });

      button.render();
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

    expect(recorded).toContain("attr:data-testid=explorer-compact-toggle-files");
  });
});

const createFakeElement = (recorded: string[]) => ({
  dataset: {} as Record<string, string>,
  appendChild: (_child: unknown) => undefined,
  addEventListener: (_eventName: string, _listener: EventListener) => undefined,
  setAttribute: (key: string, value: string) => {
    recorded.push(`attr:${key}=${value}`);
  },
  style: {} as CSSStyleDeclaration
});
