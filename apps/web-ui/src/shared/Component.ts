// Component Base Class - All components extend this
export interface ComponentProps {
  [key: string]: unknown;
}

export class Component<TProps extends ComponentProps = ComponentProps, TState = unknown> {
  props: TProps;
  state: TState;
  element: HTMLElement | null = null;
  children: unknown[] = [];

  constructor(props: TProps = {} as TProps, state?: TState) {
    this.props = props;
    this.state = state as TState;
  }

  // Create and return DOM element
  render(): HTMLElement {
    throw new Error('render method must be implemented');
  }

  // State management
  setState(newState: Partial<TState>): void {
    this.state = { ...this.state, ...newState };
    requestAnimationFrame(() => {
      this.replaceRenderedElement();
    });
  }

  // Mount to DOM
  mount(container: HTMLElement): HTMLElement {
    this.element = this.render();
    container.appendChild(this.element);
    this.onMount();
    return this.element;
  }

  // Cleanup when unmounted
  unmount(): void {
    this.onUnmount();
    if (this.element?.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  // Lifecycle hooks
  onMount(): void {}
  onUnmount(): void {}

  // Update props
  updateProps(newProps: ComponentProps): void {
    this.props = { ...this.props, ...newProps };
    this.replaceRenderedElement();
  }

  private replaceRenderedElement(): void {
    if (!this.element?.parentNode) {
      return;
    }

    const preservedState = capturePreservedDomState(this.element);
    const newElement = this.render();
    this.element.parentNode.replaceChild(newElement, this.element);
    this.element = newElement;
    restorePreservedDomState(newElement, preservedState);
  }
}

const SvgNamespace = "http://www.w3.org/2000/svg";
const SvgTagNames = new Set([
  "circle",
  "defs",
  "g",
  "line",
  "marker",
  "path",
  "polygon",
  "polyline",
  "rect",
  "svg",
  "text"
]);

// Helper for creating elements with attributes and children
export function createElement<TProps extends ComponentProps = ComponentProps>(
  tag: string | (new (props?: TProps) => Component<TProps, unknown>),
  attributes: TProps = {} as TProps,
  children: unknown[] = []
): HTMLElement {
  let element: HTMLElement;

  if (typeof tag === 'function') {
    const componentAttributes = { ...attributes } as TProps & { children?: unknown };
    if (componentAttributes.children === undefined && children.length > 0) {
      componentAttributes.children = children.length === 1 ? children[0] : children;
    }
    const component = new tag(componentAttributes);
    const rendered = component.render();
    component.element = rendered;
    return rendered;
  } else if (typeof tag === 'string') {
    element = createDomElement(tag);
  } else {
    throw new Error(`Invalid tag type: ${typeof tag}`);
  }

  let pendingValue: string | null = null;
  
  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (key === 'className') {
      setClassName(element, value);
    } else if (key === 'textContent') {
      element.textContent = value as string;
    } else if (key === 'innerHTML') {
      element.innerHTML = value as string;
    } else if (key === 'dataset') {
      const datasetValue = value as Record<string, string>;
      Object.entries(datasetValue).forEach(([dataKey, dataValue]) => {
        (element as HTMLElement & { dataset: Record<string, string> }).dataset[dataKey] = dataValue;
      });
    } else if (key === 'onClick' && typeof value === 'function') {
      element.addEventListener('click', value as EventListener);
    } else if (key === 'onInput' && typeof value === 'function') {
      element.addEventListener('input', value as EventListener);
    } else if (key === 'onChange' && typeof value === 'function') {
      element.addEventListener('change', value as EventListener);
    } else if (key === 'onBlur' && typeof value === 'function') {
      element.addEventListener('blur', value as EventListener);
    } else if (key === 'onKeyDown' && typeof value === 'function') {
      element.addEventListener('keydown', value as EventListener);
    } else if (key === 'onScroll' && typeof value === 'function') {
      element.addEventListener('scroll', value as EventListener);
    } else if (key === 'onWheel' && typeof value === 'function') {
      element.addEventListener('wheel', value as EventListener, { passive: false });
    } else if (key === 'onMouseDown' && typeof value === 'function') {
      element.addEventListener('mousedown', value as EventListener);
    } else if (key === 'onMouseUp' && typeof value === 'function') {
      element.addEventListener('mouseup', value as EventListener);
    } else if (key === 'onMouseMove' && typeof value === 'function') {
      element.addEventListener('mousemove', value as EventListener);
    } else if (key === 'onPointerDown' && typeof value === 'function') {
      element.addEventListener('pointerdown', value as EventListener);
    } else if (key === 'onPointerUp' && typeof value === 'function') {
      element.addEventListener('pointerup', value as EventListener);
    } else if (key === 'onPointerMove' && typeof value === 'function') {
      element.addEventListener('pointermove', value as EventListener);
    } else if (key === 'onDragstart' && typeof value === 'function') {
      element.addEventListener('dragstart', value as EventListener);
    } else if (key === 'onDragOver' && typeof value === 'function') {
      element.addEventListener('dragover', value as EventListener);
    } else if (key === 'onDrop' && typeof value === 'function') {
      element.addEventListener('drop', value as EventListener);
    } else if (key === 'onMouseEnter' && typeof value === 'function') {
      element.addEventListener('mouseenter', value as EventListener);
    } else if (key === 'onMouseLeave' && typeof value === 'function') {
      element.addEventListener('mouseleave', value as EventListener);
    } else if (key === 'onContextMenu' && typeof value === 'function') {
      element.addEventListener('contextmenu', value as EventListener);
    } else if (key === 'onSubmit' && typeof value === 'function') {
      element.addEventListener('submit', value as EventListener);
    } else if (key === 'value') {
      pendingValue = String(value);
    } else if (key === 'checked') {
      Reflect.set(element, "checked", Boolean(value));
    } else if (typeof value === 'boolean') {
      if (value) {
        element.setAttribute(key, '');
      }
    } else {
      element.setAttribute(key, String(value));
    }
  });
  
  // Add children
  children.forEach(child => {
    if (typeof child === 'string' || typeof child === 'number') {
      element.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Component) {
      element.appendChild(child.render());
    } else if (isElementNode(child)) {
      element.appendChild(child);
    } else if (Array.isArray(child)) {
      child.forEach(nestedChild => {
        if (typeof nestedChild === 'string' || typeof nestedChild === 'number') {
          element.appendChild(document.createTextNode(String(nestedChild)));
        } else if (isElementNode(nestedChild)) {
          element.appendChild(nestedChild);
        }
      });
    }
  });

  if (pendingValue !== null) {
    Reflect.set(element, "value", pendingValue);
  }
  
  return element;
}

const createDomElement = (tag: string): HTMLElement => {
  if (SvgTagNames.has(tag)) {
    return document.createElementNS(SvgNamespace, tag) as unknown as HTMLElement;
  }

  return document.createElement(tag);
};

const setClassName = (element: HTMLElement, value: unknown): void => {
  if (element.namespaceURI === SvgNamespace) {
    element.setAttribute("class", String(value));
    return;
  }

  element.className = value as string;
};

const isElementNode = (value: unknown): value is HTMLElement => {
  if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) {
    return true;
  }

  return typeof SVGElement !== "undefined" && value instanceof SVGElement;
};

type PreservedDomState = {
  focusTarget: {
    selector: string;
    selectionStart?: number;
    selectionEnd?: number;
  } | null;
  scrollTargets: ReadonlyArray<{
    key: string;
    top: number;
    left: number;
  }>;
};

const PreserveScrollAttribute = "data-preserve-scroll-key";

const capturePreservedDomState = (root: HTMLElement): PreservedDomState => ({
  focusTarget: readFocusTarget(root),
  scrollTargets: readScrollTargets(root)
});

const restorePreservedDomState = (
  root: HTMLElement,
  state: PreservedDomState
): void => {
  state.scrollTargets.forEach((target) => {
    const element = root.querySelector<HTMLElement>(`[${PreserveScrollAttribute}="${target.key}"]`);
    if (!element) {
      return;
    }

    element.scrollTop = target.top;
    element.scrollLeft = target.left;
  });

  if (!state.focusTarget) {
    return;
  }

  const focusedElement = root.querySelector<HTMLElement>(state.focusTarget.selector);
  if (!focusedElement || typeof focusedElement.focus !== "function") {
    return;
  }

  focusedElement.focus();
  if (
    (focusedElement instanceof HTMLInputElement || focusedElement instanceof HTMLTextAreaElement) &&
    state.focusTarget.selectionStart !== undefined &&
    state.focusTarget.selectionEnd !== undefined
  ) {
    focusedElement.setSelectionRange(state.focusTarget.selectionStart, state.focusTarget.selectionEnd);
  }
};

const readFocusTarget = (
  root: HTMLElement
): PreservedDomState["focusTarget"] => {
  if (typeof document === "undefined") {
    return null;
  }

  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || !root.contains(activeElement)) {
    return null;
  }

  const selector = readElementRestoreSelector(activeElement);
  if (!selector) {
    return null;
  }

  if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
    return {
      selector,
      ...(activeElement.selectionStart !== null ? { selectionStart: activeElement.selectionStart } : {}),
      ...(activeElement.selectionEnd !== null ? { selectionEnd: activeElement.selectionEnd } : {})
    };
  }

  return {
    selector
  };
};

const readScrollTargets = (
  root: HTMLElement
): PreservedDomState["scrollTargets"] => {
  const elements = [
    ...(root.hasAttribute(PreserveScrollAttribute) ? [root] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>(`[${PreserveScrollAttribute}]`))
  ];

  return elements.map((element) => ({
    key: element.getAttribute(PreserveScrollAttribute) ?? "",
    top: element.scrollTop,
    left: element.scrollLeft
  })).filter((target) => target.key.length > 0);
};

const readElementRestoreSelector = (
  element: HTMLElement
): string | null => {
  const testId = element.getAttribute("data-testid");
  if (testId) {
    return `[data-testid="${testId}"]`;
  }

  if (element.id) {
    return `#${element.id}`;
  }

  const name = element.getAttribute("name");
  if (name) {
    return `${element.tagName.toLowerCase()}[name="${name}"]`;
  }

  return null;
};

// Event handling helper
export function addEventListeners(element: HTMLElement, events: Record<string, EventListener>): void {
  Object.entries(events).forEach(([event, handler]) => {
    element.addEventListener(event, handler);
  });
}
