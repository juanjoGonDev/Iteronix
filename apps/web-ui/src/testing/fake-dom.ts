/**
 * Shared deterministic fake DOM for screen-level unit tests (the pattern that
 * `Settings.test.ts` established). Screens mount against these classes with
 * no browser, which keeps validation suites reproducible in CI and locally.
 */

export class FakeTextNode {
  readonly nodeType = 3;
  constructor(public textContent: string) {}
}

export type FakeChild = FakeElement | FakeTextNode;

export type ListenerRecord = { type: string; listener: (event: Event) => void };

export class FakeElement {
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

  replaceChildren(...nodes: FakeChild[]): void {
    this.children.length = 0;
    for (const node of nodes) this.appendChild(node);
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

export class FakeInputElement extends FakeElement {
  override value = "";
  override checked = false;
}

export class FakeSelectElement extends FakeElement {
  override value = "";
  selectedOptions: Array<{ value: string }> = [];
}

export class FakeTextAreaElement extends FakeElement {
  override value = "";
}

export class FakeSvgElement extends FakeElement {
  override namespaceURI = "http://www.w3.org/2000/svg";
}

export class FakeDocument {
  readonly body = new FakeElement("body");
  activeElement: unknown = null;

  createElement(tag: string): FakeElement {
    if (tag === "input") {
      return new FakeInputElement(tag);
    }
    if (tag === "select") {
      return new FakeSelectElement(tag);
    }
    if (tag === "textarea") {
      return new FakeTextAreaElement(tag);
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

export class FakeWindow {
  readonly listeners: ListenerRecord[] = [];
  readonly historyCalls: Array<{ url: string; mode: string }> = [];
  readonly location: {
    origin: string;
    pathname: string;
    search: string;
    hash: string;
    href: string;
  };
  readonly history = {
    pushState: (_data: unknown, _title: string, url: string): void => {
      this.historyCalls.push({ url, mode: "push" });
      this.applyLocation(url);
    },
    replaceState: (_data: unknown, _title: string, url: string): void => {
      this.historyCalls.push({ url, mode: "replace" });
      this.applyLocation(url);
    },
  };

  constructor(
    initial: { pathname?: string; search?: string } = {},
    readonly origin = "http://localhost:4000",
  ) {
    this.location = {
      origin: this.origin,
      pathname: initial.pathname ?? "/",
      search: initial.search ?? "",
      hash: "",
      href: "",
    };
    this.syncHref();
  }

  firePopstate(): void {
    for (const record of [...this.listeners]) {
      if (record.type === "popstate") {
        record.listener({ type: "popstate" } as unknown as Event);
      }
    }
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

  setTimeout(_callback: () => void, _delay: number): number {
    return 0;
  }

  clearTimeout(_id: number): void {}

  private applyLocation(url: string): void {
    const [rawPath = url, hash = ""] = url.split("#");
    const pathWithSearch = rawPath;
    const [pathname, search = ""] = splitSearch(pathWithSearch);
    this.location.pathname = pathname;
    this.location.search = search.length > 0 ? `?${search}` : "";
    this.location.hash = hash.length > 0 ? `#${hash}` : "";
    this.syncHref();
  }

  private syncHref(): void {
    this.location.href = `${this.location.origin}${this.location.pathname}${this.location.search}${this.location.hash}`;
  }
}

const splitSearch = (value: string): [string, string] => {
  const index = value.indexOf("?");
  return index < 0
    ? [value, ""]
    : [value.slice(0, index), value.slice(index + 1)];
};

export type MountedEnvironment = {
  document: FakeDocument;
  window: FakeWindow;
  flushDom: () => void;
  flushAll: () => Promise<void>;
};

export const installFakeDom = (input: {
  install: (key: string, value: unknown) => void;
  pathname?: string;
  search?: string;
}): MountedEnvironment => {
  const document = new FakeDocument();
  const fakeWindow = new FakeWindow({
    pathname: input.pathname ?? "/",
    search: input.search ?? "",
  });
  const rafQueue: Array<() => void> = [];

  input.install("document", document);
  input.install("window", fakeWindow);
  input.install("HTMLElement", FakeElement);
  input.install("SVGElement", FakeSvgElement);
  input.install("HTMLInputElement", FakeInputElement);
  input.install("HTMLSelectElement", FakeSelectElement);
  input.install("HTMLTextAreaElement", FakeTextAreaElement);
  input.install("Node", FakeElement);
  input.install("requestAnimationFrame", (callback: () => void) => {
    rafQueue.push(callback);
    return rafQueue.length;
  });

  const flushDom = (): void => {
    let guard = 0;
    while (rafQueue.length > 0 && guard < 60) {
      guard += 1;
      const pending = rafQueue.splice(0);
      for (const callback of pending) {
        callback();
      }
    }
  };

  return {
    document,
    window: fakeWindow,
    flushDom,
    flushAll: async () => {
      for (let round = 0; round < 12; round += 1) {
        await Promise.resolve();
        flushDom();
      }
    },
  };
};

export const collectText = (element: FakeElement): string => {
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

export const findByTestId = (
  root: FakeElement,
  testId: string,
): FakeElement | null => {
  if (
    root.dataset["testid"] === testId ||
    root.getAttribute("data-testid") === testId
  ) {
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

export const requireTestId = (
  root: FakeElement,
  testId: string,
): FakeElement => {
  const element = findByTestId(root, testId);
  if (!element) {
    throw new Error(`Element with testid "${testId}" not found.`);
  }
  return element;
};

export const findAll = (
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

export const findButton = (root: FakeElement, text: string): FakeElement => {
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

export const findAllButtons = (
  root: FakeElement,
  text: string,
): FakeElement[] =>
  findAll(
    root,
    (element) =>
      element.tag === "button" && collectText(element).includes(text),
  );
