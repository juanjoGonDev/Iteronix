import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AssetConfirmDialog,
  AssetEditorDialog,
  AssetRow,
  AssetRowList,
  AssetStatusBadge,
  readAssetStatusLabel,
} from "../components/AssetWorkbench.js";
import {
  readJsonContractState,
  readSchemaContractError,
} from "../components/SettingsFields.js";
import { EmptyStatePanel } from "../components/EmptyStatePanel.js";
import {
  FakeElement,
  collectText,
  installFakeDom,
  requireTestId,
} from "../testing/fake-dom.js";

const element = (node: unknown): FakeElement => {
  if (node instanceof FakeElement) return node;
  throw new Error("Expected a fake element.");
};

const installedGlobals: Array<{ key: string; had: boolean; value: unknown }> =
  [];

const overrideGlobal = (key: string, value: unknown): void => {
  installedGlobals.push({
    key,
    had: key in globalThis,
    value: Reflect.get(globalThis, key),
  });
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
};

beforeEach(() => {
  installFakeDom({ install: overrideGlobal });
});

afterEach(() => {
  while (installedGlobals.length > 0) {
    const record = installedGlobals.pop();
    if (!record) return;
    if (record.had) {
      Object.defineProperty(globalThis, record.key, {
        configurable: true,
        writable: true,
        value: record.value,
      });
    } else {
      Reflect.deleteProperty(globalThis, record.key);
    }
  }
});

describe("asset workbench primitives", () => {
  it("labels the shared status model", () => {
    expect(readAssetStatusLabel("enabled")).toBe("Enabled");
    expect(readAssetStatusLabel("disabled")).toBe("Disabled");
    expect(readAssetStatusLabel("error")).toBe("Error");
  });

  it("renders a row with identity, badges, chips, and wired actions", () => {
    const calls: string[] = [];
    const row = new AssetRow({
      testId: "row-1",
      icon: "extension",
      title: "Reference echo",
      subtitle: "reference.echo",
      status: "enabled",
      meta: ["server · process-isolated", "Permissions: tool.invoke"],
      chips: ["cap:tool-calls"],
      note: "Last audit: registered @ now",
      actions: [
        {
          label: "Disable",
          icon: "toggle_on",
          testId: "toggle",
          onClick: () => calls.push("toggle"),
        },
      ],
    }).render();
    const text = collectText(element(row));

    expect(row.getAttribute("data-testid")).toBe("row-1");
    expect(text).toContain("Reference echo");
    expect(text).toContain("reference.echo");
    expect(text).toContain("Enabled");
    expect(text).toContain("cap:tool-calls");
    expect(text).toContain("Last audit: registered @ now");
    expect(
      collectText(element(requireTestId(element(row), "toggle"))),
    ).toContain("Disable");
  });

  it("marks dialog save buttons disabled with an explained reason", () => {
    const dialog = new AssetEditorDialog({
      testId: "editor",
      title: "Register plugin",
      children: null,
      save: {
        label: "Register plugin",
        testId: "save",
        disabled: true,
        disabledReason: "Fix the JSON contract first.",
        onClick: () => undefined,
      },
      onClose: () => undefined,
    }).render();
    const save = requireTestId(element(dialog), "save");

    expect(dialog.getAttribute("data-testid")).toBe("editor");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(String(save.getAttribute("title"))).toBe(
      "Fix the JSON contract first.",
    );
  });

  it("renders confirm dialog actions with impact copy", () => {
    const confirm = new AssetConfirmDialog({
      testId: "confirm",
      title: "Delete plugin manifest",
      message: "This cannot be undone.",
      confirmLabel: "Delete manifest",
      confirmTestId: "confirm-yes",
      onConfirm: () => undefined,
      cancelLabel: "Cancel",
      cancelTestId: "confirm-no",
      onCancel: () => undefined,
    }).render();

    expect(element(confirm).getAttribute("role")).toBe("alertdialog");
    expect(collectText(element(confirm))).toContain("This cannot be undone.");
    expect(requireTestId(element(confirm), "confirm-yes")).toBeTruthy();
    expect(requireTestId(element(confirm), "confirm-no")).toBeTruthy();
  });

  it("exposes the list container test hook for browser validation", () => {
    const list = new AssetRowList({
      testId: "rows",
      rows: [new AssetStatusBadge({ status: "error" }).render()],
    }).render();

    expect(list.getAttribute("data-testid")).toBe("rows");
    expect(collectText(element(list))).toContain("Error");
  });

  it("lets empty states carry the primary action", () => {
    const cta = requireTestId(
      element(
        new AssetRowList({
          testId: "unused",
          rows: [
            new AssetRow({
              icon: "add",
              title: "cta",
              actions: [
                {
                  label: "Register plugin",
                  icon: "add",
                  testId: "cta",
                  onClick: () => undefined,
                },
              ],
            }).render(),
          ],
        }).render(),
      ),
      "cta",
    );
    const panel = element(
      new EmptyStatePanel({
        icon: "extension",
        title: "No server plugins yet",
        description: "Register one.",
        action: cta as unknown as HTMLElement,
      }).render(),
    );

    expect(collectText(panel)).toContain("No server plugins yet");
    expect(requireTestId(panel, "cta")).toBeTruthy();
  });
});

describe("json contract field state", () => {
  it("explains parse and shape failures line by line", () => {
    expect(readJsonContractState("", { required: true }).message).toContain(
      "Required",
    );
    expect(readJsonContractState("", { required: false }).valid).toBe(true);
    expect(
      readJsonContractState("{oops", { required: false }).message,
    ).toContain("Invalid JSON");
    expect(readJsonContractState("[1]", { required: false }).message).toBe(
      "Must be a JSON object.",
    );
    expect(
      readJsonContractState('{"type": "object"}', {
        required: false,
        validate: readSchemaContractError,
      }).message,
    ).toBe("Valid JSON object.");
    expect(
      readJsonContractState('{"title": "x"}', {
        required: false,
        validate: readSchemaContractError,
      }).message,
    ).toContain('root "type"');
  });
});
