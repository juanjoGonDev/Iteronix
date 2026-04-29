import { describe, expect, it } from "vitest";
import {
  SettingsNumberField,
  SettingsSecretField,
  SettingsSelectField,
  SettingsTextField,
  SettingsToggleField
} from "./SettingsFields.js";

describe("SettingsFields", () => {
  it("forwards test ids for reusable input-based fields", () => {
    const recorded = renderWithFakeDocument(() => {
      new SettingsTextField({
        label: "Model",
        value: "gpt-4o",
        placeholder: "Enter model",
        testId: "settings-provider-model",
        onChange: () => undefined
      }).render();

      new SettingsNumberField({
        label: "Maximum loops",
        value: 50,
        testId: "settings-max-loops",
        onChange: () => undefined
      }).render();

      new SettingsSecretField({
        label: "API key",
        value: "secret",
        placeholder: "Session only in web mode",
        testId: "settings-provider-api-key",
        onChange: () => undefined
      }).render();
    });

    expect(recorded).toContain("attr:data-testid=settings-provider-model");
    expect(recorded).toContain("attr:data-testid=settings-max-loops");
    expect(recorded).toContain("attr:data-testid=settings-provider-api-key");
  });

  it("keeps select and toggle field semantics unchanged", () => {
    const recorded = renderWithFakeDocument(() => {
      new SettingsSelectField({
        label: "Provider",
        value: "openai",
        testId: "settings-provider-kind",
        options: [{ value: "openai", label: "OpenAI" }],
        onChange: () => undefined
      }).render();

      new SettingsToggleField({
        label: "Completion sound",
        description: "Play a local confirmation tone when a run finishes.",
        checked: true,
        testId: "settings-sound-enabled",
        onChange: () => undefined
      }).render();
    });

    expect(recorded).toContain("attr:data-testid=settings-provider-kind");
    expect(recorded).toContain("listener:change");
    expect(recorded).toContain("attr:data-testid=settings-sound-enabled");
    expect(recorded).toContain("attr:checked=");
  });
});

const renderWithFakeDocument = (callback: () => void): string[] => {
  const recorded: string[] = [];
  const originalDocument = globalThis.document;
  const originalHtmlElement = globalThis.HTMLElement;
  class FakeHtmlElement {
    dataset: Record<string, string> = {};
    style = {} as CSSStyleDeclaration;

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
