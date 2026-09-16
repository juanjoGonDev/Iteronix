import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectText,
  findByTestId,
  findButton,
  FakeElement,
  installFakeDom,
  MountedEnvironment,
  requireTestId,
} from "../testing/fake-dom.js";
import type {
  PluginAssetSummary,
  PluginAssetsCatalog,
} from "../shared/plugin-assets-client.js";
import { PluginAssetsScreen } from "./PluginAssets.js";

type FakeCatalogStore = {
  catalog: PluginAssetsCatalog;
  failList: boolean;
  upserts: Array<Record<string, unknown>>;
  deletes: string[];
};

const fakeStore = vi.hoisted((): { current: FakeCatalogStore } => ({
  current: {
    catalog: { plugins: [], trustedKeys: ["reference.echo"] },
    failList: false,
    upserts: [],
    deletes: [],
  },
}));

const summary = (
  overrides: Partial<PluginAssetSummary> = {},
): PluginAssetSummary => ({
  id: "reference.echo",
  name: "Reference echo",
  status: "enabled",
  runtime: "server",
  isolation: "process",
  capabilities: ["tool-calls"],
  permissions: ["tool.invoke"],
  limits: { executions: 1, timeoutMs: 1000 },
  inputSchema: {
    id: "reference.echo.input",
    version: 1,
    schema: { type: "object" },
  },
  outputSchema: {
    id: "reference.echo.output",
    version: 1,
    schema: { type: "object" },
  },
  provenance: {
    source: "ide",
    artifactFingerprint: "reference.echo",
    registeredAt: "2026-07-21T00:00:00.000Z",
  },
  auditEvents: [{ at: "2026-07-21T00:00:00.000Z", action: "registered" }],
  ...overrides,
});

const summaryFromRecord = (
  record: Record<string, unknown>,
): PluginAssetSummary => {
  const previous = fakeStore.current.catalog.plugins.find(
    (plugin) => plugin.id === record["id"],
  );
  return {
    id: String(record["id"]),
    name: String(record["name"]),
    status: record["status"] === "disabled" ? "disabled" : "enabled",
    runtime: "server",
    isolation: "process",
    capabilities: [...((record["capabilities"] as string[]) ?? [])],
    permissions: [...((record["permissions"] as string[]) ?? [])],
    limits: record["limits"] as PluginAssetSummary["limits"],
    inputSchema: record["inputSchema"] as PluginAssetSummary["inputSchema"],
    outputSchema: record["outputSchema"] as PluginAssetSummary["outputSchema"],
    provenance: (record["provenance"] ??
      previous?.provenance ?? {
        source: "ide",
        artifactFingerprint: String(record["id"]),
        registeredAt: "2026-09-16T00:00:00.000Z",
      }) as PluginAssetSummary["provenance"],
    auditEvents: [
      ...(previous?.auditEvents ?? []),
      {
        at: "2026-09-16T00:00:00.000Z",
        action: previous ? "updated" : "registered",
      },
    ],
  };
};

vi.mock("../shared/plugin-assets-client.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../shared/plugin-assets-client.js")>();
  return {
    ...original,
    createPluginAssetsClient: () => ({
      list: async () => {
        const catalog = await Promise.resolve().then(() => {
          if (fakeStore.current.failList)
            throw new Error("plugin registry offline");
          return fakeStore.current.catalog;
        });
        return catalog.plugins;
      },
      listCatalog: async () => {
        if (fakeStore.current.failList)
          throw new Error("plugin registry offline");
        return fakeStore.current.catalog;
      },
      upsert: async (asset: Record<string, unknown>) => {
        fakeStore.current.upserts.push(asset);
        const saved = summaryFromRecord(asset);
        fakeStore.current.catalog = {
          plugins: [
            ...fakeStore.current.catalog.plugins.filter(
              (plugin) => plugin.id !== saved.id,
            ),
            saved,
          ],
          trustedKeys: fakeStore.current.catalog.trustedKeys,
        };
        return saved;
      },
      delete: async (assetId: string) => {
        fakeStore.current.deletes.push(assetId);
        fakeStore.current.catalog = {
          plugins: fakeStore.current.catalog.plugins.filter(
            (plugin) => plugin.id !== assetId,
          ),
          trustedKeys: fakeStore.current.catalog.trustedKeys,
        };
      },
    }),
  };
});

vi.mock("../components/PageScaffold.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../components/PageScaffold.js")>();
  return {
    ...original,
    showGlobalToast: (_kind: string, _message: string) => undefined,
  };
});

type MountedScreen = {
  screen: PluginAssetsScreen;
  environment: MountedEnvironment;
  root: FakeElement;
  restore: () => Promise<void>;
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

const restoreGlobals = (): void => {
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
};

const mountScreen = async (
  location: Partial<{ pathname: string; search: string }> = {},
): Promise<MountedScreen> => {
  const environment = installFakeDom({
    install: overrideGlobal,
    pathname: location.pathname ?? "/assets/plugins",
    search: location.search ?? "",
  });
  const screen = new PluginAssetsScreen({});
  const container = environment.document.createElement("div");
  environment.document.body.appendChild(container);
  screen.mount(container as unknown as HTMLElement);
  await environment.flushAll();
  const root = screen.element as unknown as FakeElement;
  if (!(root instanceof FakeElement))
    throw new Error("Screen is not rendered.");
  return {
    screen,
    environment,
    root,
    restore: async () => {
      await environment.flushAll();
      restoreGlobals();
    },
  };
};

const reroot = async (mounted: MountedScreen): Promise<FakeElement> => {
  await mounted.environment.flushAll();
  return mounted.screen.element as unknown as FakeElement;
};

const click = (element: FakeElement): void => {
  element.fire("click");
};

/**
 * Mirrors what real typing (and Playwright's `fill`) does: the element value
 * changes and only an `input` event fires — `change` waits for blur. JSON
 * contract validation must already react on this event, or the save gate
 * stays frozen one interaction behind the user.
 */
const typeField = (element: FakeElement, value: string): void => {
  element.value = value;
  element.fire("input", { target: element });
};

beforeEach(() => {
  fakeStore.current = {
    catalog: {
      plugins: [
        summary(),
        summary({
          id: "acme.knowledge",
          name: "Acme knowledge",
          status: "disabled",
          capabilities: [],
          permissions: ["tool.invoke", "memory.read"],
          auditEvents: [],
        }),
      ],
      trustedKeys: ["reference.echo", "acme.knowledge"],
    },
    failList: false,
    upserts: [],
    deletes: [],
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("plugin assets screen", () => {
  it("renders the integrated workbench with rows, badges, and audit notes", async () => {
    const mounted = await mountScreen();
    const root = await reroot(mounted);
    try {
      expect(findByTestId(root, "plugin-assets-root")).toBeTruthy();
      expect(findByTestId(root, "plugin-assets-create")).toBeTruthy();
      expect(collectText(root)).toContain("2 registered · 1 enabled");
      const row = requireTestId(root, "plugin-assets-row-reference.echo");
      expect(collectText(row)).toContain("Enabled");
      expect(collectText(row)).toContain("reference");
      expect(collectText(row)).toContain("cap:tool-calls");
      expect(collectText(row)).toContain("Last audit: registered");
      const disabledRow = requireTestId(
        root,
        "plugin-assets-row-acme.knowledge",
      );
      expect(collectText(disabledRow)).toContain("Disabled");
      expect(findButton(disabledRow, "Enable")).toBeTruthy();
      expect(findButton(root, "Register plugin")).toBeTruthy();
    } finally {
      await mounted.restore();
    }
  });

  it("shows an explained error state and recovers through the retry control", async () => {
    fakeStore.current.failList = true;
    const mounted = await mountScreen();
    const root = await reroot(mounted);
    try {
      const banner = requireTestId(root, "plugin-assets-error");
      expect(collectText(banner)).toContain("plugin registry offline");
      expect(findButton(banner, "Retry")).toBeTruthy();

      fakeStore.current.failList = false;
      click(requireTestId(root, "plugin-assets-retry"));
      const recovered = await reroot(mounted);
      expect(findByTestId(recovered, "plugin-assets-error")).toBeNull();
      expect(
        findByTestId(recovered, "plugin-assets-row-reference.echo"),
      ).toBeTruthy();
    } finally {
      await mounted.restore();
    }
  });

  it("opens the create form from the empty state without dead-ending", async () => {
    fakeStore.current.catalog = {
      plugins: [],
      trustedKeys: ["reference.echo"],
    };
    const mounted = await mountScreen();
    const root = await reroot(mounted);
    try {
      expect(collectText(root)).toContain("No server plugins yet");
      click(findButton(root, "Register plugin"));
      const editor = await reroot(mounted);
      expect(findByTestId(editor, "plugin-assets-editor")).toBeTruthy();
      expect(mounted.screen.state.url.mode).toBe("create");
      expect(mounted.screen.state.draft.trustedKey).toBe("reference.echo");
    } finally {
      await mounted.restore();
    }
  });

  it("blocks registration while a JSON contract is invalid and maps it after a fix", async () => {
    const mounted = await mountScreen();
    let root = await reroot(mounted);
    try {
      click(requireTestId(root, "plugin-assets-create"));
      root = await reroot(mounted);
      const editor = requireTestId(root, "plugin-assets-editor");
      const input = requireTestId(editor, "plugin-assets-input-schema");

      typeField(input, "{ not json");
      root = await reroot(mounted);
      const invalidState = requireTestId(
        root,
        "plugin-assets-input-schema-state",
      );
      expect(collectText(invalidState)).toContain("Invalid JSON");
      expect(root instanceof FakeElement).toBe(true);
      expect(mounted.screen.state.draft.inputSchemaJson).toBe("{ not json");
      const disabledSave = requireTestId(root, "plugin-assets-save");
      expect(disabledSave.getAttribute("disabled")).not.toBeNull();
      expect(disabledSave.getAttribute("title") ?? "").not.toHaveLength(0);

      typeField(input, '{ "type": "string" }');
      root = await reroot(mounted);
      const validState = requireTestId(
        root,
        "plugin-assets-input-schema-state",
      );
      expect(collectText(validState)).toContain("Valid JSON object");
      expect(
        requireTestId(root, "plugin-assets-save").getAttribute("disabled"),
      ).toBeNull();
      click(requireTestId(root, "plugin-assets-save"));
      await mounted.environment.flushAll();

      expect(fakeStore.current.upserts).toHaveLength(1);
      expect(fakeStore.current.upserts[0]).toMatchObject({
        id: "reference.echo",
        kind: "plugin",
        status: "enabled",
        inputSchema: {
          id: "reference.echo.input",
          version: 1,
          schema: { type: "string" },
        },
      });
      expect(mounted.screen.state.url.mode).toBe("edit");
    } finally {
      await mounted.restore();
    }
  });

  it("toggles a plugin from the row without opening the editor", async () => {
    const mounted = await mountScreen();
    const root = await reroot(mounted);
    try {
      click(requireTestId(root, "plugin-assets-toggle-reference.echo"));
      await mounted.environment.flushAll();

      expect(fakeStore.current.upserts).toHaveLength(1);
      expect(fakeStore.current.upserts[0]).toMatchObject({
        id: "reference.echo",
        status: "disabled",
        limits: { executions: 1, timeoutMs: 1000 },
      });
      expect(mounted.screen.state.noticeMessage).toContain("disabled");
    } finally {
      await mounted.restore();
    }
  });

  it("requires an explicit confirmation before deleting", async () => {
    const mounted = await mountScreen();
    let root = await reroot(mounted);
    try {
      click(requireTestId(root, "plugin-assets-delete-acme.knowledge"));
      root = await reroot(mounted);
      const dialog = requireTestId(root, "plugin-assets-delete-dialog");
      expect(collectText(dialog)).toContain("Acme knowledge");
      click(requireTestId(dialog, "plugin-assets-delete-cancel"));
      root = await reroot(mounted);
      expect(findByTestId(root, "plugin-assets-delete-dialog")).toBeNull();
      expect(fakeStore.current.deletes).toEqual([]);

      click(requireTestId(root, "plugin-assets-delete-acme.knowledge"));
      root = await reroot(mounted);
      click(
        requireTestId(
          requireTestId(root, "plugin-assets-delete-dialog"),
          "plugin-assets-delete-confirm",
        ),
      );
      await mounted.environment.flushAll();

      expect(fakeStore.current.deletes).toEqual(["acme.knowledge"]);
      expect(
        findByTestId(await reroot(mounted), "plugin-assets-row-acme.knowledge"),
      ).toBeNull();
    } finally {
      await mounted.restore();
    }
  });

  it("explains the blocked state when the server provides no trusted keys", async () => {
    fakeStore.current.catalog = { plugins: [], trustedKeys: [] };
    const mounted = await mountScreen();
    const root = await reroot(mounted);
    try {
      click(findButton(root, "Register plugin"));
      const after = await reroot(mounted);
      const save = requireTestId(after, "plugin-assets-save");
      expect(findByTestId(after, "plugin-assets-editor")).toBeTruthy();
      expect(String(save.getAttribute("title"))).toContain(
        "ITERONIX_TRUSTED_PLUGIN_IDS",
      );
      expect(mounted.screen.state.busy).toBe(false);
    } finally {
      await mounted.restore();
    }
  });

  it("restores the editor draft from a deep link", async () => {
    const mounted = await mountScreen({
      search: "?mode=edit&plugin=reference.echo",
    });
    const root = await reroot(mounted);
    try {
      const editor = requireTestId(root, "plugin-assets-editor");
      const name = requireTestId(editor, "plugin-assets-name");
      expect(name.value).toBe("Reference echo");
      expect(requireTestId(editor, "plugin-assets-trusted-key").tagName).toBe(
        "SELECT",
      );
    } finally {
      await mounted.restore();
    }
  });
});
