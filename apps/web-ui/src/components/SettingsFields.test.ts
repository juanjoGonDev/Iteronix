import { describe, expect, it } from "vitest";
import {
  readJsonContractState,
  readSettingsToggleKnobClassName,
  readSettingsToggleTrackClassName,
  SettingsNumberField,
  SettingsCheckboxGroup,
  SettingsDateTimeField,
  SettingsJsonField,
  SettingsSecretField,
  SettingsSelectField,
  SettingsTextField,
  SettingsToggleField,
} from "./SettingsFields.js";

describe("SettingsFields", () => {
  it("forwards test ids for reusable input-based fields", () => {
    const recorded = renderWithFakeDocument(() => {
      new SettingsTextField({
        label: "Model",
        value: "gpt-4o",
        placeholder: "Enter model",
        testId: "settings-provider-model",
        onChange: () => undefined,
      }).render();

      new SettingsNumberField({
        label: "Maximum loops",
        value: 50,
        testId: "settings-max-loops",
        onChange: () => undefined,
      }).render();

      new SettingsSecretField({
        label: "API key",
        value: "secret",
        placeholder: "Session only in web mode",
        testId: "settings-provider-api-key",
        onChange: () => undefined,
      }).render();
    });

    expect(recorded).toContain("attr:data-testid=settings-provider-model");
    expect(recorded).toContain("attr:data-testid=settings-max-loops");
    expect(recorded).toContain("attr:data-testid=settings-provider-api-key");
    // Text-style controls commit on `input` (live validation, automation-safe
    // fills) and keep `change` as the blur fallback.
    expect(recorded.filter((entry) => entry === "listener:input")).toHaveLength(
      3,
    );
    expect(
      recorded.filter((entry) => entry === "listener:change"),
    ).toHaveLength(3);
  });

  it("keeps JSON contract fields live-validated on input events", () => {
    const recorded = renderWithFakeDocument(() => {
      new SettingsJsonField({
        label: "Input JSON contract",
        value: "{ broken",
        placeholder: '{ "type": "object" }',
        testId: "asset-input-schema",
        hint: null,
        contractState: readJsonContractState("{ broken", { required: false }),
        onChange: () => undefined,
      }).render();
    });

    expect(recorded).toContain("listener:input");
    expect(recorded).toContain("listener:change");
    expect(recorded).toContain("attr:aria-invalid=true");
  });

  it("keeps select and toggle field semantics unchanged", () => {
    const recorded = renderWithFakeDocument(() => {
      new SettingsSelectField({
        label: "Provider",
        value: "openai",
        testId: "settings-provider-kind",
        options: [
          { value: "codex-cli", label: "Codex CLI" },
          { value: "openai", label: "OpenAI" },
        ],
        onChange: () => undefined,
      }).render();

      new SettingsToggleField({
        label: "Completion sound",
        description: "Play a local confirmation tone when a run finishes.",
        checked: true,
        testId: "settings-sound-enabled",
        onChange: () => undefined,
      }).render();
    });

    expect(recorded).toContain("attr:data-testid=settings-provider-kind");
    expect(recorded).toContain("attr:selected=");
    expect(recorded).toContain("listener:change");
    expect(recorded).toContain("attr:data-testid=settings-sound-enabled");
    expect(recorded).toContain("attr:role=switch");
    expect(recorded).toContain("attr:aria-checked=true");
  });

  it("renders a native date-time control instead of asking users for a protocol timestamp", () => {
    const recorded = renderWithFakeDocument(() => {
      new SettingsDateTimeField({
        label: "Expires on",
        value: "2026-08-28T09:30",
        disabled: false,
        testId: "settings-external-credential-expiry",
        onChange: () => undefined,
      }).render();
    });

    expect(recorded).toContain("attr:type=datetime-local");
    expect(recorded).toContain(
      "attr:data-testid=settings-external-credential-expiry",
    );
    expect(recorded).toContain("listener:change");
  });

  it("renders permission choices as labelled native checkboxes with descriptions", () => {
    const recorded = renderWithFakeDocument(() => {
      new SettingsCheckboxGroup({
        label: "Allowed operations",
        description: "Choose only the actions this credential needs.",
        testId: "settings-external-credential-operations",
        values: ["workflow.read"],
        options: [
          {
            value: "workflow.read",
            label: "Read workflows",
            description: "Inspect workflow definitions and metadata.",
          },
        ],
        onChange: () => undefined,
      }).render();
    });

    expect(recorded).toContain("attr:role=group");
    expect(recorded).toContain("attr:type=checkbox");
    expect(recorded).toContain(
      "attr:data-testid=settings-external-credential-operations-workflow-read",
    );
    expect(recorded).toContain(
      "text:Inspect workflow definitions and metadata.",
    );
    expect(recorded).toContain("listener:change");
  });

  it("renders reusable toggles with switch-specific design states", () => {
    expect(readSettingsToggleTrackClassName(true)).toContain("bg-primary");
    expect(readSettingsToggleTrackClassName(false)).toContain("bg-[#2b3644]");
    expect(readSettingsToggleKnobClassName(true)).toContain("translate-x-5");
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
        textContent: value,
      }),
    },
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeHtmlElement,
  });

  try {
    callback();
  } finally {
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }

    if (originalHtmlElement === undefined) {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    } else {
      Object.defineProperty(globalThis, "HTMLElement", {
        configurable: true,
        value: originalHtmlElement,
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
