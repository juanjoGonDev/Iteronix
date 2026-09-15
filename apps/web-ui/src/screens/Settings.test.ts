import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ExternalApiKeyRecord,
  ExternalWorkflowCredentialAudit,
  RuntimeProviderRecord,
  SettingsClient,
} from "../shared/settings-client.js";
import type { SettingsSnapshot } from "../shared/settings-storage.js";
import {
  createDefaultSettingsSnapshot,
  DefaultSettingsProfileId,
} from "../shared/settings-storage.js";
import { IdeUserRole } from "../shared/ide-auth-client.js";
import { ProviderKind, ProviderPromptMode } from "./settings-state.js";
import { ExternalApiKeyScopeSelection } from "./settings-api-access-state.js";
import {
  SettingsScreen,
  canManageExternalWorkflowCredentials,
} from "./Settings.js";

type FakeServiceState = {
  settingsSnapshot: () => SettingsSnapshot;
  updateSettings: (snapshot: SettingsSnapshot) => SettingsSnapshot;
  updateSettingsSaved: SettingsSnapshot | null;
  providerSettingsCalls: Array<Record<string, unknown>>;
  loadCalls: number;
  providers: () => ReadonlyArray<RuntimeProviderRecord>;
  credentials: () => ReadonlyArray<ExternalApiKeyRecord>;
  audits: () => ReadonlyArray<ExternalWorkflowCredentialAudit>;
  definitions: () => ReadonlyArray<{ id: string; name: string }>;
  definitionCalls: number;
  credentialListCalls: number;
  createCredential: (input: unknown) => {
    credential: ExternalApiKeyRecord;
    plaintextCredential: string;
  };
  rotateCredential: (input: unknown) => { plaintextCredential: string };
  revokeCredential: (input: unknown) => { credentialId: string };
  createCalls: unknown[];
  rotateCalls: unknown[];
  revokeCalls: unknown[];
};

const fakeServices = vi.hoisted((): { current: FakeServiceState } => ({
  current: {
    settingsSnapshot: () => {
      throw new Error("settingsSnapshot not stubbed");
    },
    updateSettings: (snapshot) => snapshot,
    updateSettingsSaved: null,
    providerSettingsCalls: [],
    loadCalls: 0,
    providers: () => [],
    credentials: () => [],
    audits: () => [],
    definitions: () => [],
    definitionCalls: 0,
    credentialListCalls: 0,
    createCredential: () => {
      throw new Error("createCredential not stubbed");
    },
    rotateCredential: () => {
      throw new Error("rotateCredential not stubbed");
    },
    revokeCredential: () => {
      throw new Error("revokeCredential not stubbed");
    },
    createCalls: [],
    rotateCalls: [],
    revokeCalls: [],
  },
}));

const toastLog = vi.hoisted(
  (): { entries: Array<{ kind: string; message: string }> } => ({
    entries: [],
  }),
);

vi.mock("../shared/settings-client.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../shared/settings-client.js")>();
  const client: SettingsClient = {
    load: async () => {
      fakeServices.current.loadCalls += 1;
      return fakeServices.current.settingsSnapshot();
    },
    update: async (snapshot) => {
      fakeServices.current.updateSettingsSaved = snapshot;
      return fakeServices.current.updateSettings(snapshot);
    },
    listProviders: async () => ({
      providers: fakeServices.current.providers(),
    }),
    updateProviderSettings: async (input) => {
      fakeServices.current.providerSettingsCalls.push({
        profileId: input.profileId,
        providerId: input.providerId,
        config: input.config,
      });
      return {
        profileId: input.profileId,
        providerId: input.providerId,
        config: input.config,
        updatedAt: "2026-01-01T00:00:00.000Z",
      };
    },
    listExternalWorkflowCredentials: async () => {
      fakeServices.current.credentialListCalls += 1;
      return fakeServices.current.credentials();
    },
    createExternalWorkflowCredential: async (input) => {
      fakeServices.current.createCalls.push(input);
      return fakeServices.current.createCredential(input);
    },
    rotateExternalWorkflowCredential: async (input) => {
      fakeServices.current.rotateCalls.push(input);
      return fakeServices.current.rotateCredential(input);
    },
    revokeExternalWorkflowCredential: async (input) => {
      fakeServices.current.revokeCalls.push(input);
      return fakeServices.current.revokeCredential(input);
    },
    listExternalWorkflowCredentialAudits: async () =>
      fakeServices.current.audits(),
  };
  return {
    ...original,
    createSettingsClient: () => client,
  };
});

vi.mock("../shared/workflow-client.js", () => ({
  createWorkflowClient: () => ({
    listDefinitions: async () => {
      fakeServices.current.definitionCalls += 1;
      return fakeServices.current.definitions();
    },
  }),
}));

vi.mock("../components/PageScaffold.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../components/PageScaffold.js")>();
  return {
    ...original,
    showGlobalToast: (kind: string, message: string) => {
      toastLog.entries.push({ kind, message });
    },
  };
});

class FakeTextNode {
  readonly nodeType = 3;
  constructor(public textContent: string) {}
}

type FakeChild = FakeElement | FakeTextNode;

type ListenerRecord = { type: string; listener: (event: Event) => void };

class FakeElement {
  readonly nodeType = 1;
  readonly nodeName: string;
  readonly tagName: string;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  className = "";
  id = "";
  textContent = "";
  innerHTML = "";
  title = "";
  role = "";
  value: unknown = undefined;
  checked: unknown = undefined;
  disabled = false;
  scrollTop = 0;
  scrollLeft = 0;
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners: ListenerRecord[] = [];
  readonly children: FakeChild[] = [];
  parentNode: FakeElement | null = null;

  constructor(readonly tag: string) {
    this.nodeName = tag.toUpperCase();
    this.tagName = tag.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "id") {
      this.id = value;
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.push({ type, listener });
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    const index = this.listeners.findIndex(
      (record) => record.type === type && record.listener === listener,
    );
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  appendChild(child: FakeChild): FakeChild {
    if (child instanceof FakeElement) {
      child.parentNode = this;
    }
    this.children.push(child);
    return child;
  }

  removeChild(child: FakeChild): FakeChild {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
    }
    if (child instanceof FakeElement) {
      child.parentNode = null;
    }
    return child;
  }

  replaceChild(next: FakeChild, previous: FakeChild): FakeChild {
    const index = this.children.indexOf(previous);
    if (index < 0) {
      return previous;
    }
    if (next instanceof FakeElement) {
      next.parentNode = this;
    }
    this.children[index] = next;
    if (previous instanceof FakeElement) {
      previous.parentNode = null;
    }
    return previous;
  }

  contains(candidate: FakeElement): boolean {
    if (candidate === this) {
      return true;
    }
    return this.children.some(
      (child) => child instanceof FakeElement && child.contains(candidate),
    );
  }

  querySelector(): null {
    return null;
  }

  querySelectorAll(): ReadonlyArray<never> {
    return [];
  }

  focus(): void {}

  setSelectionRange(): void {}

  fire(type: string, event: Record<string, unknown> = {}): void {
    for (const record of [...this.listeners]) {
      if (record.type === type) {
        record.listener({ ...event, type } as unknown as Event);
      }
    }
  }
}

class FakeInputElement extends FakeElement {
  override value = "";
  override checked = false;
}

class FakeSelectElement extends FakeElement {
  override value = "";
  selectedOptions: Array<{ value: string }> = [];
}

class FakeSvgElement extends FakeElement {
  override namespaceURI = "http://www.w3.org/2000/svg";
}

class FakeDocument {
  readonly body = new FakeElement("body");
  activeElement: unknown = null;

  createElement(tag: string): FakeElement {
    if (tag === "input") {
      return new FakeInputElement(tag);
    }
    if (tag === "select") {
      return new FakeSelectElement(tag);
    }
    return new FakeElement(tag);
  }

  createElementNS(_namespace: string, tag: string): FakeElement {
    return new FakeSvgElement(tag);
  }

  createTextNode(value: string): FakeTextNode {
    return new FakeTextNode(value);
  }

  getElementById(id: string): FakeElement | null {
    return findById(this.body, id);
  }
}

const findById = (root: FakeElement, id: string): FakeElement | null => {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children) {
    if (child instanceof FakeElement) {
      const found = findById(child, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
};

class FakeWindow {
  readonly listeners: ListenerRecord[] = [];
  confirmResult = true;
  readonly historyCalls: Array<{ url: string; mode: string }> = [];
  readonly location = {
    origin: "http://localhost:4000",
    pathname: "/settings",
    search: "",
    hash: "",
  };
  readonly history = {
    pushState: (_data: unknown, _title: string, url: string): void => {
      this.historyCalls.push({ url, mode: "push" });
    },
    replaceState: (_data: unknown, _title: string, url: string): void => {
      this.historyCalls.push({ url, mode: "replace" });
    },
  };

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.push({ type, listener });
  }

  removeEventListener(type: string, listener: (event: Event) => void): void {
    const index = this.listeners.findIndex(
      (record) => record.type === type && record.listener === listener,
    );
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  confirm(_message: string): boolean {
    return this.confirmResult;
  }

  setTimeout(_callback: () => void, _delay: number): number {
    return 0;
  }

  clearTimeout(_id: number): void {}

  fire(type: string): void {
    for (const record of [...this.listeners]) {
      if (record.type === type) {
        record.listener({ type } as unknown as Event);
      }
    }
  }
}

type MountedEnvironment = {
  document: FakeDocument;
  fakeWindow: FakeWindow;
  flushAll: () => Promise<void>;
  flushDom: () => void;
};

const installedGlobals: Array<{
  key: string;
  present: boolean;
  value: unknown;
}> = [];

const overrideGlobal = (key: string, value: unknown): void => {
  installedGlobals.push({
    key,
    present: key in globalThis,
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
    if (!record) {
      return;
    }
    if (record.present) {
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

const installEnvironment = (): MountedEnvironment => {
  const document = new FakeDocument();
  const fakeWindow = new FakeWindow();
  const rafQueue: Array<() => void> = [];

  overrideGlobal("document", document);
  overrideGlobal("window", fakeWindow);
  overrideGlobal("HTMLElement", FakeElement);
  overrideGlobal("SVGElement", FakeSvgElement);
  overrideGlobal("HTMLInputElement", FakeInputElement);
  overrideGlobal("HTMLSelectElement", FakeSelectElement);
  overrideGlobal("requestAnimationFrame", (callback: () => void) => {
    rafQueue.push(callback);
    return rafQueue.length;
  });

  const flushDom = (): void => {
    let guard = 0;
    while (rafQueue.length > 0 && guard < 40) {
      guard += 1;
      const pending = rafQueue.splice(0);
      for (const callback of pending) {
        callback();
      }
    }
  };

  return {
    document,
    fakeWindow,
    flushDom,
    flushAll: async () => {
      for (let round = 0; round < 10; round += 1) {
        await Promise.resolve();
        flushDom();
      }
    },
  };
};

const collectText = (element: FakeElement): string => {
  const pieces: string[] = [];
  const walk = (node: FakeElement | FakeTextNode): void => {
    if (node instanceof FakeTextNode) {
      pieces.push(node.textContent);
      return;
    }
    for (const child of node.children) {
      walk(child);
    }
  };
  walk(element);
  return pieces.join(" ");
};

const findByTestId = (
  root: FakeElement,
  testId: string,
): FakeElement | null => {
  if (root.getAttribute("data-testid") === testId) {
    return root;
  }
  for (const child of root.children) {
    if (child instanceof FakeElement) {
      const found = findByTestId(child, testId);
      if (found) {
        return found;
      }
    }
  }
  return null;
};

const findAll = (
  root: FakeElement,
  matches: (element: FakeElement) => boolean,
): FakeElement[] => {
  const found: FakeElement[] = [];
  const walk = (node: FakeElement): void => {
    if (matches(node)) {
      found.push(node);
    }
    for (const child of node.children) {
      if (child instanceof FakeElement) {
        walk(child);
      }
    }
  };
  walk(root);
  return found;
};

const findButton = (root: FakeElement, text: string): FakeElement => {
  const buttons = findAll(
    root,
    (element) =>
      element.tag === "button" && collectText(element).includes(text),
  );
  const [first] = buttons;
  if (!first) {
    throw new Error(`Button with text "${text}" not found.`);
  }
  return first;
};

const findAllButtons = (root: FakeElement, text: string): FakeElement[] =>
  findAll(
    root,
    (element) =>
      element.tag === "button" && collectText(element).includes(text),
  );

type MountedScreen = {
  screen: SettingsScreen;
  root: FakeElement;
  fakeWindow: FakeWindow;
  document: FakeDocument;
  flushAll: () => Promise<void>;
};

const elementOf = (screen: SettingsScreen): FakeElement => {
  const element = screen.element as unknown as FakeElement | null;
  if (!element) {
    throw new Error("Screen is not rendered.");
  }
  return element;
};

const mountScreen = async (options: {
  role?: string;
  location?: Partial<{ pathname: string; search: string; hash: string }>;
}): Promise<MountedScreen> => {
  const environment = installEnvironment();
  Object.assign(environment.fakeWindow.location, options.location ?? {});
  const props: Record<string, unknown> = {};
  if (options.role !== undefined) {
    props["authenticatedUserRole"] = options.role;
  }
  const screen = new SettingsScreen(props);
  const container = environment.document.createElement("div");
  environment.document.body.appendChild(container);
  screen.mount(container as unknown as HTMLElement);
  await environment.flushAll();
  return {
    screen,
    root: elementOf(screen),
    fakeWindow: environment.fakeWindow,
    document: environment.document,
    flushAll: environment.flushAll,
  };
};

const remount = async (mounted: MountedScreen): Promise<void> => {
  await mounted.flushAll();
  mounted.root = elementOf(mounted.screen);
};

const click = (element: FakeElement): void => {
  element.fire("click");
};

const changeInput = (
  element: FakeElement | null,
  value: string,
  checked = false,
): void => {
  if (!element) {
    throw new Error("Expected an element to change.");
  }
  element.value = value;
  element.checked = checked;
  element.fire("change", { target: element });
};

const toggle = (mounted: MountedScreen, testId: string): void => {
  const element = findByTestId(mounted.root, testId);
  if (!element) {
    throw new Error(`Toggle ${testId} not found.`);
  }
  click(element);
};

const createTestProfile = (
  id: string,
  kind: ProviderKind,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  name: `Profile ${id}`,
  providerKind: kind,
  modelId: "model-1",
  endpointUrl: "https://example.test/v1",
  apiKeyEnvVar: "EXAMPLE_API_KEY",
  command: "codex",
  promptMode: ProviderPromptMode.Stdin,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const createTestCredential = (
  overrides: Partial<ExternalApiKeyRecord> = {},
): ExternalApiKeyRecord => ({
  id: "credential-1",
  name: "Deploy key",
  scope: { kind: "all_workflows" },
  operations: ["workflow.read"],
  rateLimitPerMinute: 120,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const createTestAudit = (
  overrides: Partial<ExternalWorkflowCredentialAudit> = {},
): ExternalWorkflowCredentialAudit => ({
  credentialId: "credential-1",
  eventKind: "create",
  actorKind: "administrator",
  actorId: "admin",
  result: "authorized",
  occurredAt: "2026-02-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  toastLog.entries.length = 0;
  fakeServices.current.settingsSnapshot = createDefaultSettingsSnapshot;
  fakeServices.current.updateSettings = (snapshot) => snapshot;
  fakeServices.current.updateSettingsSaved = null;
  fakeServices.current.providerSettingsCalls = [];
  fakeServices.current.loadCalls = 0;
  fakeServices.current.providers = () => [];
  fakeServices.current.credentials = () => [];
  fakeServices.current.audits = () => [];
  fakeServices.current.definitions = () => [];
  fakeServices.current.definitionCalls = 0;
  fakeServices.current.credentialListCalls = 0;
  fakeServices.current.createCalls = [];
  fakeServices.current.rotateCalls = [];
  fakeServices.current.revokeCalls = [];
  fakeServices.current.createCredential = () => {
    throw new Error("createCredential not stubbed");
  };
  fakeServices.current.rotateCredential = () => {
    throw new Error("rotateCredential not stubbed");
  };
  fakeServices.current.revokeCredential = () => {
    throw new Error("revokeCredential not stubbed");
  };
});

afterEach(() => {
  restoreGlobals();
  vi.unstubAllGlobals();
});

describe("canManageExternalWorkflowCredentials", () => {
  it("is restricted blockchain-less administrators", () => {
    expect(canManageExternalWorkflowCredentials(IdeUserRole.Admin)).toBe(true);
    expect(canManageExternalWorkflowCredentials(IdeUserRole.Member)).toBe(
      false,
    );
  });
});

describe("SettingsScreen tabs", () => {
  it("navigates across all tabs writing URL state and refreshing the api context", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });

    expect(collectText(mounted.root)).toContain("No provider profiles yet.");

    const transitions: Array<[string, string]> = [
      ["General", "Workflow application"],
      ["Workflow Limits", "Guardrails that apply"],
      ["Notifications", "Keep browser-side alert preferences"],
      ["API Access", "External API access"],
    ];
    for (const [label, marker] of transitions) {
      click(findButton(mounted.root, label));
      await remount(mounted);
      expect(collectText(mounted.root)).toContain(marker);
    }
    expect(mounted.fakeWindow.historyCalls.length).toBeGreaterThan(0);
    expect(fakeServices.current.credentialListCalls).toBeGreaterThan(0);

    click(findButton(mounted.root, "General"));
    await remount(mounted);
    expect(mounted.screen.state.activeTab).toBe("general");
  });

  it("starts on the tab persisted in the url even without window state handlers", async () => {
    const mounted = await mountScreen({
      role: IdeUserRole.Admin,
      location: { search: "?tab=notifications&profile=missing-profile" },
    });

    expect(mounted.screen.state.activeTab).toBe("notifications");
    expect(collectText(mounted.root)).toContain(
      "Keep browser-side alert preferences and webhook routing",
    );
    expect(mounted.screen.state.selectedProviderId).toBeNull();
  });

  it("reacts to unmounting by removing the window listeners", async () => {
    const mounted = await mountScreen({});
    const listenerCount = mounted.fakeWindow.listeners.length;
    mounted.screen.unmount();
    expect(mounted.fakeWindow.listeners.length).toBeLessThan(listenerCount);
    expect(
      (mounted.screen.element as unknown as FakeElement | null)?.parentNode ??
        null,
    ).toBeNull();
  });
});

describe("SettingsScreen general tab", () => {
  it("summarizes namespace, runtime totals and notification posture", async () => {
    const profile = createTestProfile("profile-a", ProviderKind.OpenAI);
    const snapshot = {
      ...createDefaultSettingsSnapshot(),
      profileId: "tenant-42",
      providerProfiles: [profile],
      notifications: { soundEnabled: false, webhookUrl: "" },
      workflowLimits: {
        infiniteLoops: true,
        maxLoops: 4,
        externalCalls: false,
      },
    };
    fakeServices.current.settingsSnapshot = () => snapshot;
    fakeServices.current.providers = () => [
      {
        id: "openai",
        displayName: "OpenAI",
        type: "api",
        authType: "token",
        settingsSchema: {},
      },
      {
        id: "ollama",
        displayName: "Ollama",
        type: "local",
        authType: "none",
        settingsSchema: {},
      },
    ];

    const mounted = await mountScreen({
      role: IdeUserRole.Admin,
      location: { search: "?tab=general" },
    });
    const text = collectText(mounted.root);

    expect(text).toContain("Runtime providers");
    expect(text).toContain("tenant-42");
    expect(text).toContain("Disabled");
    expect(text).toContain("Blocked");
  });

  it("falls back to the default namespace and reloads the runtime context", async () => {
    fakeServices.current.settingsSnapshot = () => {
      const snapshot = createDefaultSettingsSnapshot();
      return { ...snapshot, profileId: "" };
    };

    const mounted = await mountScreen({
      role: IdeUserRole.Admin,
      location: { search: "?tab=general" },
    });

    expect(collectText(mounted.root)).toContain(DefaultSettingsProfileId);

    const loadCallsBefore = fakeServices.current.loadCalls;
    click(findButton(mounted.root, "Reload runtime"));
    await remount(mounted);
    expect(fakeServices.current.loadCalls).toBeGreaterThan(loadCallsBefore);
  });

  it("surfaces a toast when the runtime hydration fails", async () => {
    fakeServices.current.settingsSnapshot = () => {
      throw new Error("snapshot offline");
    };

    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    await remount(mounted);

    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "error" && entry.message === "snapshot offline",
      ),
    ).toBe(true);
  });

  it("uses the fallback message when hydration fails with a non-error value", async () => {
    fakeServices.current.settingsSnapshot = () => {
      throw "plain failure";
    };

    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    await remount(mounted);

    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "error" &&
          entry.message === "Could not load runtime providers.",
      ),
    ).toBe(true);
  });
});

describe("SettingsScreen provider tab", () => {
  it("creates profiles from every provider button and re-selects them", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });

    const buttons = findAllButtons(mounted.root, "Add ");
    expect(buttons.length).toBe(5);
    for (const button of buttons.slice()) {
      click(findButton(mounted.root, collectText(button)));
      await remount(mounted);
    }

    expect(mounted.screen.state.providerProfiles.length).toBe(5);
    expect(mounted.screen.state.selectedProviderId).toBe(
      mounted.screen.state.providerProfiles[4]?.id,
    );
    expect(collectText(mounted.root)).toContain("Custom");
    expect(mounted.fakeWindow.historyCalls.length).toBeGreaterThan(0);
  });

  it("edits text fields through the provider editor", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add OpenAI"));
    await remount(mounted);
    const profileId = mounted.screen.state.selectedProviderId;
    if (!profileId) {
      throw new Error("Expected a selected provider.");
    }

    const nameInput = findByTestId(mounted.root, "settings-provider-name");
    changeInput(nameInput, "Renamed profile");
    await remount(mounted);
    expect(mounted.screen.state.providerProfiles[0]?.name).toBe(
      "Renamed profile",
    );

    const modelInput = findByTestId(mounted.root, "settings-provider-model");
    changeInput(modelInput, "gpt-4.1");
    await remount(mounted);
    expect(mounted.screen.state.providerProfiles[0]?.modelId).toBe("gpt-4.1");

    const endpointInput = findByTestId(
      mounted.root,
      "settings-provider-endpoint",
    );
    changeInput(endpointInput, "https://alt.example.test/v1");
    await remount(mounted);
    expect(mounted.screen.state.providerProfiles[0]?.endpointUrl).toBe(
      "https://alt.example.test/v1",
    );

    const envVarInput = findByTestId(
      mounted.root,
      "settings-provider-api-key-env-var",
    );
    changeInput(envVarInput, "ALT_API_KEY");
    await remount(mounted);
    expect(mounted.screen.state.providerProfiles[0]?.apiKeyEnvVar).toBe(
      "ALT_API_KEY",
    );
  });

  it("edits codex cli command and prompt mode selections", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add Codex CLI"));
    await remount(mounted);

    const text = collectText(mounted.root);
    expect(text).toContain("This Codex CLI profile will be pushed");

    const commandInput = findByTestId(
      mounted.root,
      "settings-provider-command",
    );
    changeInput(commandInput, "codex-alt");
    await remount(mounted);
    expect(mounted.screen.state.providerProfiles[0]?.command).toBe("codex-alt");

    const modeSelect = findByTestId(
      mounted.root,
      "settings-provider-prompt-mode",
    );
    changeInput(modeSelect, ProviderPromptMode.Arg);
    await remount(mounted);
    expect(mounted.screen.state.providerProfiles[0]?.promptMode).toBe(
      ProviderPromptMode.Arg,
    );

    changeInput(modeSelect, "not-a-mode");
    await remount(mounted);
    expect(mounted.screen.state.providerProfiles[0]?.promptMode).toBe(
      ProviderPromptMode.Arg,
    );
  });

  it("changes the provider kind and ignores unknown kinds", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add OpenAI"));
    await remount(mounted);

    const kindSelect = findByTestId(mounted.root, "settings-provider-kind");
    changeInput(kindSelect, ProviderKind.Ollama);
    await remount(mounted);
    expect(mounted.screen.state.providerProfiles[0]?.providerKind).toBe(
      ProviderKind.Ollama,
    );
    expect(mounted.screen.state.providerProfiles[0]?.modelId).toBe("");

    changeInput(kindSelect, "not-a-kind");
    await remount(mounted);
    expect(mounted.screen.state.providerProfiles[0]?.providerKind).toBe(
      ProviderKind.Ollama,
    );
  });

  it("updates only the selected profile when several profiles exist", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add Codex CLI"));
    await remount(mounted);
    click(findButton(mounted.root, "Add OpenAI"));
    await remount(mounted);
    const [first, second] = mounted.screen.state.providerProfiles;
    if (!first || !second) {
      throw new Error("Expected two profiles.");
    }
    const selectProfile = (name: string): void => {
      const matches = findAllButtons(mounted.root, name).filter(
        (button) => !collectText(button).includes("Add "),
      );
      const [target] = matches;
      if (!target) {
        throw new Error(`Profile button for ${name} not found.`);
      }
      click(target);
    };

    selectProfile("Codex CLI");
    await remount(mounted);
    changeInput(
      findByTestId(mounted.root, "settings-provider-command"),
      "codex-multi",
    );
    await remount(mounted);
    expect(
      mounted.screen.state.providerProfiles.find((p) => p.id === first.id)
        ?.command,
    ).toBe("codex-multi");
    expect(
      mounted.screen.state.providerProfiles.find((p) => p.id === second.id)
        ?.command,
    ).toBe("");

    changeInput(
      findByTestId(mounted.root, "settings-provider-prompt-mode"),
      ProviderPromptMode.Arg,
    );
    await remount(mounted);
    expect(
      mounted.screen.state.providerProfiles.find((p) => p.id === first.id)
        ?.promptMode,
    ).toBe(ProviderPromptMode.Arg);
    expect(
      mounted.screen.state.providerProfiles.find((p) => p.id === second.id)
        ?.promptMode,
    ).toBe(ProviderPromptMode.Stdin);

    selectProfile("OpenAI");
    await remount(mounted);
    changeInput(
      findByTestId(mounted.root, "settings-provider-kind"),
      ProviderKind.Ollama,
    );
    await remount(mounted);
    expect(
      mounted.screen.state.providerProfiles.find((p) => p.id === second.id)
        ?.providerKind,
    ).toBe(ProviderKind.Ollama);
    expect(
      mounted.screen.state.providerProfiles.find((p) => p.id === first.id)
        ?.providerKind,
    ).toBe(ProviderKind.CodexCli);

    changeInput(
      findByTestId(mounted.root, "settings-provider-endpoint"),
      "https://other.example",
    );
    await remount(mounted);
    expect(
      mounted.screen.state.providerProfiles.filter(
        (profile) => profile.endpointUrl === "https://other.example",
      ).length,
    ).toBe(1);
  });

  it("renders without a selected profile when the id is stale", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add OpenAI"));
    await remount(mounted);

    mounted.screen.setState({ selectedProviderId: "stale-profile-id" });
    await remount(mounted);
    expect(collectText(mounted.root)).toContain(
      "Choose a provider profile from the left column",
    );
  });

  it("shows runtime availability context for api profiles", async () => {
    fakeServices.current.providers = () => [
      {
        id: "openai",
        displayName: "OpenAI",
        type: "api",
        authType: "token",
        settingsSchema: {},
      },
    ];
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add OpenAI"));
    await remount(mounted);

    expect(collectText(mounted.root)).toContain("Runtime available");
    expect(collectText(mounted.root)).toContain(
      "syncs to the backend runtime store on save",
    );

    fakeServices.current.providers = () => [];
    mounted.screen.setState({ runtimeProviders: [] });
    await remount(mounted);
    expect(collectText(mounted.root)).toContain("Server-backed");
  });

  it("selects profiles from the list and removes them", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add OpenAI"));
    await remount(mounted);
    click(findButton(mounted.root, "Add Anthropic"));
    await remount(mounted);

    const [first, second] = mounted.screen.state.providerProfiles;
    if (!first || !second) {
      throw new Error("Expected two profiles.");
    }

    const profileButtons = findAllButtons(mounted.root, "OpenAI").filter(
      (button) => !collectText(button).includes("Add "),
    );
    const [firstProfileButton] = profileButtons;
    if (!firstProfileButton) {
      throw new Error("Expected a profile button.");
    }
    click(firstProfileButton);
    await remount(mounted);
    expect(mounted.screen.state.selectedProviderId).toBe(first.id);

    const removeButtons = findAllButtons(mounted.root, "Remove");
    const [firstRemoveButton] = removeButtons;
    if (!firstRemoveButton) {
      throw new Error("Expected a remove button.");
    }
    click(firstRemoveButton);
    await remount(mounted);
    expect(mounted.screen.state.selectedProviderId).toBe(second.id);
    expect(mounted.screen.state.providerProfiles.length).toBe(1);

    click(findButton(mounted.root, "Remove"));
    await remount(mounted);
    expect(mounted.screen.state.providerProfiles.length).toBe(0);
    expect(mounted.screen.state.selectedProviderId).toBeNull();
    expect(collectText(mounted.root)).toContain("No provider profiles yet.");
  });

  it("removes a non-selected profile without re-selecting", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add OpenAI"));
    await remount(mounted);
    click(findButton(mounted.root, "Add Anthropic"));
    await remount(mounted);
    const [, second] = mounted.screen.state.providerProfiles;
    if (!second) {
      throw new Error("Expected two profiles.");
    }

    const removeButtons = findAllButtons(mounted.root, "Remove");
    const [firstRemoveButton] = removeButtons;
    if (!firstRemoveButton) {
      throw new Error("Expected a remove button.");
    }
    click(firstRemoveButton);
    await remount(mounted);
    expect(mounted.screen.state.selectedProviderId).toBe(second.id);
  });
});

describe("SettingsScreen limits tab", () => {
  it("parses maximum loops and ignores unparsable values", async () => {
    const mounted = await mountScreen({
      role: IdeUserRole.Admin,
      location: { search: "?tab=limits" },
    });

    const loopsInput = findByTestId(mounted.root, "settings-max-loops");
    changeInput(loopsInput, "12");
    await remount(mounted);
    expect(mounted.screen.state.workflowLimits.maxLoops).toBe(12);

    changeInput(loopsInput, "not-a-number");
    await remount(mounted);
    expect(mounted.screen.state.workflowLimits.maxLoops).toBe(12);
  });

  it("toggles infinite loops and external calls", async () => {
    const mounted = await mountScreen({
      role: IdeUserRole.Admin,
      location: { search: "?tab=limits" },
    });

    toggle(mounted, "settings-infinite-loops");
    await remount(mounted);
    expect(mounted.screen.state.workflowLimits.infiniteLoops).toBe(true);

    toggle(mounted, "settings-external-calls");
    await remount(mounted);
    expect(mounted.screen.state.workflowLimits.externalCalls).toBe(false);
  });
});

describe("SettingsScreen notifications tab", () => {
  const navigateToNotifications = async (
    mounted: MountedScreen,
  ): Promise<void> => {
    if (mounted.screen.state.activeTab !== "notifications") {
      click(findButton(mounted.root, "Notifications"));
      await remount(mounted);
    }
  };

  it("toggles the completion sound and edits the webhook url", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    await navigateToNotifications(mounted);

    toggle(mounted, "settings-sound-enabled");
    await remount(mounted);
    expect(mounted.screen.state.notifications.soundEnabled).toBe(false);

    const webhookInput = findByTestId(mounted.root, "settings-webhook-url");
    changeInput(webhookInput, "https://hooks.example.test/iteronix");
    await remount(mounted);
    expect(mounted.screen.state.notifications.webhookUrl).toBe(
      "https://hooks.example.test/iteronix",
    );
  });

  it("delivers a webhook test payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200 })),
    );
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    await navigateToNotifications(mounted);

    const testButton = findButton(mounted.root, "Test payload");
    expect(testButton.getAttribute("disabled")).not.toBeNull();

    changeInput(
      findByTestId(mounted.root, "settings-webhook-url"),
      "https://hooks.example.test/iteronix",
    );
    await remount(mounted);

    click(findButton(mounted.root, "Test payload"));
    await remount(mounted);

    expect(vi.mocked(fetch)).toHaveBeenCalled();
    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "success" &&
          entry.message.includes("delivered successfully"),
      ),
    ).toBe(true);
  });

  it("reports webhook failures for non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 })),
    );
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    await navigateToNotifications(mounted);
    changeInput(
      findByTestId(mounted.root, "settings-webhook-url"),
      "https://hooks.example.test/iteronix",
    );
    await remount(mounted);

    click(findButton(mounted.root, "Test payload"));
    await remount(mounted);

    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "error" && entry.message.includes("status 503"),
      ),
    ).toBe(true);
  });

  it("renders the testing state label while a webhook test is in flight", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Notifications"));
    await remount(mounted);

    mounted.screen.setState({ isTestingWebhook: true });
    await remount(mounted);
    expect(collectText(mounted.root)).toContain("Testing");

    mounted.screen.setState({ isTestingWebhook: false });
    await remount(mounted);
    expect(collectText(mounted.root)).toContain("Test payload");
  });

  it("falls back to a default error message for non-error webhook rejections", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw "network down";
      }),
    );
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    await navigateToNotifications(mounted);
    changeInput(
      findByTestId(mounted.root, "settings-webhook-url"),
      "https://hooks.example.test/iteronix",
    );
    await remount(mounted);

    click(findButton(mounted.root, "Test payload"));
    await remount(mounted);

    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "error" && entry.message === "Webhook test failed.",
      ),
    ).toBe(true);
  });
});

const navigateToTab = async (
  mounted: MountedScreen,
  label: string,
): Promise<void> => {
  click(findButton(mounted.root, label));
  await remount(mounted);
};

describe("SettingsScreen save flows", () => {
  it("persists the snapshot and syncs codex profiles to the runtime", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add Codex CLI"));
    await remount(mounted);

    click(findButton(mounted.root, "Save changes"));
    await remount(mounted);

    expect(fakeServices.current.providerSettingsCalls.length).toBe(1);
    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "success" &&
          entry.message.includes(
            "Settings saved. 1 profile persisted in PostgreSQL, with 1 runtime sync and 0 snapshot-only profiles.",
          ),
      ),
    ).toBe(true);
  });

  it("reports snapshot-only and runtime-synced profile mixtures with plurals", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add OpenAI"));
    await remount(mounted);
    click(findButton(mounted.root, "Add Anthropic"));
    await remount(mounted);

    click(findButton(mounted.root, "Save changes"));
    await remount(mounted);

    expect(fakeServices.current.providerSettingsCalls.length).toBe(1);
    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "success" &&
          entry.message.includes(
            "Settings saved. 2 profiles persisted in PostgreSQL, with 1 runtime sync and 1 snapshot-only profile.",
          ),
      ),
    ).toBe(true);
  });

  it("keeps the persisted provider when the previous selection survived saving", async () => {
    const profile = createTestProfile("profile-kept", ProviderKind.OpenAI);
    const snapshot = {
      ...createDefaultSettingsSnapshot(),
      providerProfiles: [profile],
    };
    fakeServices.current.settingsSnapshot = () => snapshot;
    fakeServices.current.updateSettings = () => snapshot;

    const mounted = await mountScreen({
      role: IdeUserRole.Admin,
      location: { search: "?tab=provider" },
    });
    click(findButton(mounted.root, "Save changes"));
    await remount(mounted);

    expect(mounted.screen.state.selectedProviderId).toBe("profile-kept");
  });

  it("drops the selection when the persisted snapshot removes the selected profile", async () => {
    const profile = createTestProfile("profile-temp", ProviderKind.OpenAI);
    const other = createTestProfile("profile-other", ProviderKind.CodexCli);
    const base = createDefaultSettingsSnapshot();
    fakeServices.current.settingsSnapshot = () => ({
      ...base,
      providerProfiles: [profile],
    });
    fakeServices.current.updateSettings = () => ({
      ...base,
      providerProfiles: [other],
    });

    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Save changes"));
    await remount(mounted);

    expect(mounted.screen.state.selectedProviderId).toBe("profile-other");
    expect(mounted.screen.state.providerProfiles[0]?.id).toBe("profile-other");
    expect(fakeServices.current.providerSettingsCalls.length).toBe(1);
    expect(fakeServices.current.providerSettingsCalls[0]).toMatchObject({
      profileId: "profile-other",
    });
  });

  it("falls back to the default profile id when it was cleared", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    mounted.screen.setState({ profileId: "" });
    await remount(mounted);

    click(findButton(mounted.root, "Save changes"));
    await remount(mounted);

    expect(mounted.screen.state.profileId).toBe(DefaultSettingsProfileId);
    expect(fakeServices.current.updateSettingsSaved?.profileId).toBe(
      DefaultSettingsProfileId,
    );
  });

  it("guards against a double save while the first one is pending", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    let invocationCount = 0;
    fakeServices.current.updateSettings = (next) => {
      invocationCount += 1;
      return next;
    };

    const handleSave = (
      mounted.screen as unknown as { handleSave: () => Promise<void> }
    ).handleSave;

    const firstCall = handleSave.call(mounted.screen);
    const secondCall = handleSave.call(mounted.screen);
    await Promise.all([firstCall, secondCall]);
    await remount(mounted);

    expect(invocationCount).toBe(1);
  });

  it("reports save failures with error details", async () => {
    fakeServices.current.updateSettings = () => {
      throw new Error("disk full");
    };
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Save changes"));
    await remount(mounted);

    expect(
      toastLog.entries.some(
        (entry) => entry.kind === "error" && entry.message === "disk full",
      ),
    ).toBe(true);
    expect(mounted.screen.state.isSaving).toBe(false);
  });

  it("uses the fallback message when saving fails with a non-error value", async () => {
    fakeServices.current.updateSettings = () => {
      throw "write conflict";
    };
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Save changes"));
    await remount(mounted);

    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "error" &&
          entry.message === "Could not save settings.",
      ),
    ).toBe(true);
  });
});

describe("SettingsScreen reset flows", () => {
  it("does nothing when the confirmation is cancelled", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    mounted.fakeWindow.confirmResult = false;
    fakeServices.current.updateSettings = () => {
      throw new Error("update should not run");
    };
    click(findButton(mounted.root, "Reset defaults"));
    await remount(mounted);
    expect(toastLog.entries.every((entry) => entry.kind !== "error")).toBe(
      true,
    );
  });

  it("restores defaults after confirmation", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    click(findButton(mounted.root, "Add OpenAI"));
    await remount(mounted);
    mounted.fakeWindow.confirmResult = true;

    click(findButton(mounted.root, "Reset defaults"));
    await remount(mounted);

    expect(mounted.screen.state.activeTab).toBe("provider");
    expect(mounted.screen.state.providerProfiles.length).toBe(0);
    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "success" &&
          entry.message === "Settings restored to defaults.",
      ),
    ).toBe(true);
  });

  it("reports reset failures", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    mounted.fakeWindow.confirmResult = true;
    fakeServices.current.updateSettings = () => {
      throw "boom";
    };
    click(findButton(mounted.root, "Reset defaults"));
    await remount(mounted);

    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "error" &&
          entry.message === "Could not reset settings.",
      ),
    ).toBe(true);
  });
});

describe("SettingsScreen api tab access", () => {
  it("shows the unavailable panel for members", async () => {
    const mounted = await mountScreen({
      role: IdeUserRole.Member,
      location: { search: "?tab=api" },
    });

    expect(
      findByTestId(mounted.root, "settings-external-api-access-unavailable"),
    ).not.toBeNull();
    expect(fakeServices.current.credentialListCalls).toBe(0);
  });

  it("treats unknown roles as members", async () => {
    const mounted = await mountScreen({
      role: "owner",
      location: { search: "?tab=api" },
    });

    expect(
      findByTestId(mounted.root, "settings-external-api-access-unavailable"),
    ).not.toBeNull();
  });
});

describe("SettingsScreen api tab admin experience", () => {
  const mountAdminApi = async (): Promise<MountedScreen> =>
    mountScreen({ role: IdeUserRole.Admin, location: { search: "?tab=api" } });

  it("renders quickstarts of credentials and audits", async () => {
    fakeServices.current.credentials = () => [
      createTestCredential(),
      createTestCredential({
        id: "credential-2",
        name: "Revoked regional key",
        scope: {
          kind: "selected_workflows",
          workflowIds: ["wf-1", "wf-2"],
        },
        expiresAt: "2027-01-01T00:00:00.000Z",
        lastUsedAt: "2026-02-01T00:00:00.000Z",
        revokedAt: "2026-03-01T00:00:00.000Z",
      }),
    ];
    fakeServices.current.audits = () => [
      createTestAudit({ operation: "workflow.read" }),
      createTestAudit({
        credentialId: "credential-2",
        eventKind: "revoke",
      }),
    ];

    const mounted = await mountAdminApi();
    const text = collectText(mounted.root);

    expect(text).toContain("Deploy key");
    expect(text).toContain("Revoked regional key");
    expect(text).toContain("2 selected workflow(s)");
    expect(text).toContain("expires 2027-01-01T00:00:00.000Z");
    expect(text).toContain("last used 2026-02-01T00:00:00.000Z");
    expect(text).toContain("revoked");
    expect(text).toContain("never expires");
    expect(text).toContain("last used never");
    expect(text).toContain(
      "2026-02-01T00:00:00.000Z · create · authorized · administrator:admin · workflow.read",
    );
    expect(text).toContain("revoke · authorized · administrator:admin");
  });

  it("filters impossible workflow selections while refreshing", async () => {
    fakeServices.current.definitions = () => [{ id: "wf-1", name: "Nightly" }];
    const mounted = await mountAdminApi();

    mounted.screen.setState({
      apiKeyScope: ExternalApiKeyScopeSelection.SelectedWorkflows,
      apiKeyWorkflowIds: ["wf-1", "wf-ghost"],
    });
    await remount(mounted);

    await navigateToTab(mounted, "API Access");

    expect(mounted.screen.state.apiKeyWorkflowIds).toEqual(["wf-1"]);
  });

  it("reports refresh failures", async () => {
    fakeServices.current.credentials = () => {
      throw new Error("credential listing offline");
    };
    await mountAdminApi();

    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "error" &&
          entry.message === "credential listing offline",
      ),
    ).toBe(true);
  });

  it("edits the credential scope selector and resets workflow ids", async () => {
    const mounted = await mountAdminApi();
    const scopeSelect = findByTestId(
      mounted.root,
      "settings-external-api-key-scope",
    );

    changeInput(scopeSelect, ExternalApiKeyScopeSelection.SelectedWorkflows);
    await remount(mounted);
    expect(mounted.screen.state.apiKeyScope).toBe(
      ExternalApiKeyScopeSelection.SelectedWorkflows,
    );

    mounted.screen.setState({
      apiKeyWorkflowIds: ["wf-1"],
    });
    await remount(mounted);

    changeInput(
      findByTestId(mounted.root, "settings-external-api-key-scope"),
      ExternalApiKeyScopeSelection.AllWorkflows,
    );
    await remount(mounted);
    expect(mounted.screen.state.apiKeyWorkflowIds).toEqual([]);
  });

  it("keeps otherwise-unknown scope values on the all-workflows bucket", async () => {
    const mounted = await mountAdminApi();
    const scopeSelect = findByTestId(
      mounted.root,
      "settings-external-api-key-scope",
    );

    changeInput(scopeSelect, "unpublished-scope");
    await remount(mounted);
    expect(mounted.screen.state.apiKeyScope).toBe(
      ExternalApiKeyScopeSelection.AllWorkflows,
    );
  });

  it("selects allowed workflows through the multi select control", async () => {
    fakeServices.current.definitions = () => [
      { id: "wf-1", name: "Nightly" },
      { id: "wf-2", name: "Audit" },
    ];
    const mounted = await mountAdminApi();

    changeInput(
      findByTestId(mounted.root, "settings-external-api-key-scope"),
      ExternalApiKeyScopeSelection.SelectedWorkflows,
    );
    await remount(mounted);

    const workflowSelect = findByTestId(
      mounted.root,
      "settings-external-api-key-workflows",
    );
    expect(workflowSelect).not.toBeNull();
    if (workflowSelect instanceof FakeSelectElement) {
      workflowSelect.selectedOptions = [{ value: "wf-2" }, { value: "wf-1" }];
    }
    workflowSelect?.fire("change", { target: workflowSelect });
    await remount(mounted);
    expect(mounted.screen.state.apiKeyWorkflowIds).toEqual(["wf-2", "wf-1"]);

    workflowSelect?.fire("change", {
      target: mounted.document.createElement("div"),
    });
    await remount(mounted);
    expect(mounted.screen.state.apiKeyWorkflowIds).toEqual(["wf-2", "wf-1"]);
  });

  it("shows the empty-workflows hint when no workflows exist", async () => {
    fakeServices.current.definitions = () => [];
    const mounted = await mountAdminApi();

    changeInput(
      findByTestId(mounted.root, "settings-external-api-key-scope"),
      ExternalApiKeyScopeSelection.SelectedWorkflows,
    );
    await remount(mounted);

    expect(collectText(mounted.root)).toContain(
      "No workflows are available. Create one before making a limited key.",
    );
  });

  it("applies rate limit changes with validation fallbacks", async () => {
    const mounted = await mountAdminApi();
    const rateLimitInput = findByTestId(
      mounted.root,
      "settings-external-credential-rate-limit",
    );

    changeInput(rateLimitInput, "240");
    await remount(mounted);
    expect(mounted.screen.state.apiKeyRateLimitPerMinute).toBe(240);

    changeInput(rateLimitInput, "1.5");
    await remount(mounted);
    expect(mounted.screen.state.apiKeyRateLimitPerMinute).toBe(60);

    changeInput(rateLimitInput, "601");
    await remount(mounted);
    expect(mounted.screen.state.apiKeyRateLimitPerMinute).toBe(60);
  });

  it("toggles operations through the checkbox group and ignores unknown values", async () => {
    const mounted = await mountAdminApi();

    const untoggle = findByTestId(
      mounted.root,
      "settings-external-credential-operations-workflow-read",
    );
    changeInput(untoggle, "workflow.read", false);
    await remount(mounted);
    expect(mounted.screen.state.apiKeyOperations).not.toContain(
      "workflow.read",
    );

    const traceToggle = findByTestId(
      mounted.root,
      "settings-external-credential-operations-run-trace",
    );
    changeInput(traceToggle, "run.trace", true);
    await remount(mounted);
    expect(mounted.screen.state.apiKeyOperations).toContain("run.trace");

    const bogusToggle = findByTestId(
      mounted.root,
      "settings-external-credential-operations-run-trace",
    );
    changeInput(bogusToggle, "run.invent", true);
    await remount(mounted);
    expect(mounted.screen.state.apiKeyOperations).not.toContain("run.invent");
  });

  it("switches between never-expire and explicit expiry management", async () => {
    const mounted = await mountAdminApi();
    const checkbox = findByTestId(
      mounted.root,
      "settings-external-credential-never-expires",
    );

    changeInput(checkbox, "on", false);
    await remount(mounted);
    expect(mounted.screen.state.apiKeyNeverExpires).toBe(false);
    expect(mounted.screen.state.apiKeyExpiresAt).not.toBe("");

    const expiryInput = findByTestId(
      mounted.root,
      "settings-external-credential-expiry",
    );
    changeInput(expiryInput, "2027-05-01T10:30");
    await remount(mounted);
    expect(mounted.screen.state.apiKeyExpiresAt).toBe("2027-05-01T10:30");

    changeInput(
      findByTestId(mounted.root, "settings-external-credential-never-expires"),
      "on",
      false,
    );
    await remount(mounted);
    expect(mounted.screen.state.apiKeyExpiresAt).toBe("2027-05-01T10:30");

    changeInput(
      findByTestId(mounted.root, "settings-external-credential-never-expires"),
      "on",
      true,
    );
    await remount(mounted);
    expect(mounted.screen.state.apiKeyNeverExpires).toBe(true);
    expect(mounted.screen.state.apiKeyExpiresAt).toBe("");

    const freshCheckbox = findByTestId(
      mounted.root,
      "settings-external-credential-never-expires",
    );
    freshCheckbox?.fire("change", {
      target: mounted.document.createElement("div"),
    });
    await remount(mounted);
    expect(mounted.screen.state.apiKeyNeverExpires).toBe(true);
  });

  it("enables the create button only for genuinely valid forms", async () => {
    const mounted = await mountAdminApi();
    const createButton = (): FakeElement => {
      const candidate = findAllButtons(mounted.root, "Creat").find(
        (button) =>
          collectText(button).includes("Create credential") ||
          collectText(button).includes("Creating"),
      );
      if (!candidate) {
        throw new Error("Create button not found.");
      }
      return candidate;
    };

    expect(createButton().getAttribute("disabled")).not.toBeNull();

    const nameInput = findByTestId(
      mounted.root,
      "settings-external-api-key-name",
    );
    changeInput(nameInput, "Deploy bot");
    await remount(mounted);
    expect(createButton().getAttribute("disabled")).toBeNull();

    mounted.screen.setState({
      apiKeyOperations: [],
    });
    await remount(mounted);
    expect(createButton().getAttribute("disabled")).not.toBeNull();

    mounted.screen.setState({
      apiKeyOperations: ["workflow.read"],
      apiKeyNeverExpires: false,
      apiKeyExpiresAt: "",
    });
    await remount(mounted);
    expect(createButton().getAttribute("disabled")).not.toBeNull();

    mounted.screen.setState({
      apiKeyExpiresAt: "2027-05-01T10:30",
      apiKeyScope: ExternalApiKeyScopeSelection.SelectedWorkflows,
    });
    await remount(mounted);
    expect(createButton().getAttribute("disabled")).not.toBeNull();

    mounted.screen.setState({
      apiKeyWorkflowIds: ["wf-1"],
      isManagingExternalApiKeys: true,
    });
    await remount(mounted);
    expect(createButton().getAttribute("disabled")).not.toBeNull();

    mounted.screen.setState({
      isManagingExternalApiKeys: false,
    });
    await remount(mounted);
    expect(createButton().getAttribute("disabled")).toBeNull();
  });

  it("creates credentials and shows the one-time plaintext flow", async () => {
    const credential = createTestCredential({ id: "credential-created" });
    fakeServices.current.createCredential = () => ({
      credential,
      plaintextCredential: "iwk.secret.plaintext",
    });

    const clipboardSpy = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: clipboardSpy } });

    const mounted = await mountAdminApi();
    changeInput(
      findByTestId(mounted.root, "settings-external-api-key-name"),
      "Deploy bot",
    );
    await remount(mounted);

    click(findButton(mounted.root, "Create credential"));
    await remount(mounted);

    expect(fakeServices.current.createCalls.length).toBe(1);
    const secret = findByTestId(mounted.root, "settings-new-external-api-key");
    expect(secret).not.toBeNull();
    expect(collectText(mounted.root)).toContain("Copy this key now.");
    expect(
      mounted.screen.state.externalApiKeys.some(
        (key) => key.id === "credential-created",
      ),
    ).toBe(true);
    expect(mounted.screen.state.apiKeyName).toBe("");

    click(findButton(mounted.root, "Copy key"));
    await remount(mounted);
    expect(vi.mocked(clipboardSpy)).toHaveBeenCalledWith(
      "iwk.secret.plaintext",
    );

    click(findButton(mounted.root, "Dismiss secret"));
    await remount(mounted);
    expect(
      findByTestId(mounted.root, "settings-new-external-api-key"),
    ).toBeNull();
  });

  it("creates expiring scoped credentials with explicit policy payloads", async () => {
    fakeServices.current.createCredential = () => ({
      credential: createTestCredential({ id: "credential-scoped" }),
      plaintextCredential: "plaintext",
    });
    fakeServices.current.definitions = () => [{ id: "wf-1", name: "Nightly" }];

    const mounted = await mountAdminApi();
    changeInput(
      findByTestId(mounted.root, "settings-external-api-key-name"),
      "Scoped key",
    );
    await remount(mounted);
    changeInput(
      findByTestId(mounted.root, "settings-external-api-key-scope"),
      ExternalApiKeyScopeSelection.SelectedWorkflows,
    );
    await remount(mounted);

    const workflowSelect = findByTestId(
      mounted.root,
      "settings-external-api-key-workflows",
    );
    if (workflowSelect instanceof FakeSelectElement) {
      workflowSelect.selectedOptions = [{ value: "wf-1" }];
    }
    workflowSelect?.fire("change", { target: workflowSelect });
    await remount(mounted);

    changeInput(
      findByTestId(mounted.root, "settings-external-credential-never-expires"),
      "on",
      false,
    );
    await remount(mounted);
    changeInput(
      findByTestId(mounted.root, "settings-external-credential-expiry"),
      "2027-06-30T23:59",
    );
    await remount(mounted);
    changeInput(
      findByTestId(mounted.root, "settings-external-credential-rate-limit"),
      "42",
    );
    await remount(mounted);

    click(findButton(mounted.root, "Create credential"));
    await remount(mounted);

    expect(fakeServices.current.createCalls[0]).toEqual({
      name: "Scoped key",
      scope: {
        kind: "selected_workflows",
        workflowIds: ["wf-1"],
      },
      operations: expect.arrayContaining(["workflow.read"]) as unknown,
      expiresAt: expect.stringContaining("2027-06-30T23:59") as unknown,
      rateLimitPerMinute: 42,
    });
  });

  it("reports create failures", async () => {
    fakeServices.current.createCredential = () => {
      throw new Error("quorum denied");
    };
    const mounted = await mountAdminApi();
    changeInput(
      findByTestId(mounted.root, "settings-external-api-key-name"),
      "Deploy bot",
    );
    await remount(mounted);

    click(findButton(mounted.root, "Create credential"));
    await remount(mounted);

    expect(
      toastLog.entries.some(
        (entry) => entry.kind === "error" && entry.message === "quorum denied",
      ),
    ).toBe(true);
    expect(mounted.screen.state.isManagingExternalApiKeys).toBe(false);
  });

  it("rotates credentials and refreshes as an administrator", async () => {
    fakeServices.current.credentials = () => [createTestCredential()];
    fakeServices.current.rotateCredential = () => ({
      plaintextCredential: "iwk.rotated.plaintext",
    });
    const mounted = await mountAdminApi();

    const listCallsBefore = String(fakeServices.current.credentialListCalls);
    void listCallsBefore;
    click(findButton(mounted.root, "Rotate"));
    await remount(mounted);

    expect(fakeServices.current.rotateCalls).toEqual([
      { credentialId: "credential-1" },
    ]);
    expect(
      findByTestId(mounted.root, "settings-new-external-api-key"),
    ).not.toBeNull();
    expect(fakeServices.current.credentialListCalls).toBeGreaterThanOrEqual(2);
  });

  it("rotates credentials without a refresh when the actor loses admin role", async () => {
    fakeServices.current.credentials = () => [createTestCredential()];
    fakeServices.current.rotateCredential = () => ({
      plaintextCredential: "iwk.member-rotation",
    });
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    mounted.screen.updateProps({
      ...mounted.screen.props,
      authenticatedUserRole: IdeUserRole.Member,
    });
    await mounted.flushAll();

    const rotations = (
      mounted.screen as unknown as {
        handleRotateExternalApiKey: (credentialId: string) => Promise<void>;
      }
    ).handleRotateExternalApiKey.bind(mounted.screen);

    const callsBefore = fakeServices.current.credentialListCalls;
    await rotations("credential-1");
    await remount(mounted);

    expect(fakeServices.current.credentialListCalls).toBe(callsBefore);
    expect(
      mounted.screen.state.newExternalApiKey?.plaintextCredential ?? "",
    ).toMatch(/^iwk\./);
  });

  it("reports rotate failures", async () => {
    fakeServices.current.credentials = () => [createTestCredential()];
    fakeServices.current.rotateCredential = () => {
      throw new Error("rotation rejected");
    };
    const mounted = await mountAdminApi();

    click(findButton(mounted.root, "Rotate"));
    await remount(mounted);

    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "error" && entry.message === "rotation rejected",
      ),
    ).toBe(true);
  });

  it("revokes credentials and refreshes the context", async () => {
    fakeServices.current.credentials = () => [createTestCredential()];
    fakeServices.current.revokeCredential = () => ({
      credentialId: "credential-1",
    });
    const mounted = await mountAdminApi();

    click(findButton(mounted.root, "Revoke"));
    await remount(mounted);

    expect(fakeServices.current.revokeCalls).toEqual([
      { credentialId: "credential-1" },
    ]);
    expect(fakeServices.current.credentialListCalls).toBeGreaterThanOrEqual(2);
  });

  it("reports revoke failures", async () => {
    fakeServices.current.credentials = () => [createTestCredential()];
    fakeServices.current.revokeCredential = () => {
      throw "lost connection";
    };
    const mounted = await mountAdminApi();

    click(findButton(mounted.root, "Revoke"));
    await remount(mounted);

    expect(
      toastLog.entries.some(
        (entry) =>
          entry.kind === "error" &&
          entry.message === "Could not revoke external workflow credential.",
      ),
    ).toBe(true);
  });
});

describe("SettingsScreen browser handlers", () => {
  it("applies url state on popstate events including provider resolution", async () => {
    const profile = createTestProfile("profile-url", ProviderKind.OpenAI);
    const snapshot = {
      ...createDefaultSettingsSnapshot(),
      providerProfiles: [profile],
    };
    fakeServices.current.settingsSnapshot = () => snapshot;
    const mounted = await mountScreen({ role: IdeUserRole.Admin });

    mounted.fakeWindow.location.search = "?tab=limits&profile=profile-url";
    mounted.fakeWindow.fire("popstate");
    await remount(mounted);

    expect(mounted.screen.state.activeTab).toBe("limits");
    expect(mounted.screen.state.selectedProviderId).toBe("profile-url");

    mounted.fakeWindow.location.search = "?tab=general&profile=ghost";
    mounted.fakeWindow.fire("popstate");
    await remount(mounted);
    expect(mounted.screen.state.selectedProviderId).toBe("profile-url");

    mounted.fakeWindow.location.search = "";
    mounted.fakeWindow.fire("popstate");
    await remount(mounted);
    expect(mounted.screen.state.activeTab).toBe("general");
  });

  it("refreshes the credential context on workflow catalogue changes", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Admin });
    const callsBefore = fakeServices.current.definitionCalls;

    mounted.fakeWindow.fire("iteronix:workflows-changed");
    await remount(mounted);

    expect(fakeServices.current.definitionCalls).toBeGreaterThan(callsBefore);
  });

  it("ignores workflow catalogue changes for members", async () => {
    const mounted = await mountScreen({ role: IdeUserRole.Member });
    const callsBefore = fakeServices.current.definitionCalls;

    mounted.fakeWindow.fire("iteronix:workflows-changed");
    await remount(mounted);

    expect(fakeServices.current.definitionCalls).toBe(callsBefore);
  });
});

describe("SettingsScreen without a browser window", () => {
  it("constructs and interacts without touching browser-only APIs", async () => {
    const environment = installEnvironment();
    Reflect.deleteProperty(globalThis, "window");
    const screen = new SettingsScreen();
    expect(screen.state.activeTab).toBe("provider");

    const container = environment.document.createElement("div");
    environment.document.body.appendChild(container);
    screen.mount(container as unknown as HTMLElement);

    click(findButton(elementOf(screen), "General"));

    const saveHandler = (
      screen as unknown as { handleSave: () => Promise<void> }
    ).handleSave;
    await saveHandler.call(screen);
    expect(screen.state.isSaving).toBe(false);
    screen.unmount();
  });
});
