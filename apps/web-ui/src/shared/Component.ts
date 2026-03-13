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
      if (this.element?.parentNode) {
        const newElement = this.render();
        this.element.parentNode.replaceChild(newElement, this.element);
        this.element = newElement;
      }
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
    if (this.element?.parentNode) {
      const newElement = this.render();
      this.element.parentNode.replaceChild(newElement, this.element);
      this.element = newElement;
    }
  }
}

// Helper for creating elements with attributes and children
export function createElement<TProps extends ComponentProps = ComponentProps>(
  tag: string | (new (props?: TProps) => Component<TProps, unknown>),
  attributes: TProps = {} as TProps,
  children: unknown[] = []
): HTMLElement {
  let element: HTMLElement;

  if (typeof tag === 'function') {
    // Create component instance
    const component = new tag(attributes);
    const rendered = component.render();
    component.element = rendered;
    return rendered;
  } else if (typeof tag === 'string') {
    element = document.createElement(tag);
  } else {
    throw new Error(`Invalid tag type: ${typeof tag}`);
  }
  
  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value as string;
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
    } else if (key === 'onChange' && typeof value === 'function') {
      element.addEventListener('change', value as EventListener);
    } else if (key === 'onSubmit' && typeof value === 'function') {
      element.addEventListener('submit', value as EventListener);
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
    } else if (child instanceof HTMLElement) {
      element.appendChild(child);
    } else if (Array.isArray(child)) {
      child.forEach(nestedChild => {
        if (typeof nestedChild === 'string' || typeof nestedChild === 'number') {
          element.appendChild(document.createTextNode(String(nestedChild)));
        } else if (nestedChild instanceof HTMLElement) {
          element.appendChild(nestedChild);
        }
      });
    }
  });
  
  return element;
}

// Event handling helper
export function addEventListeners(element: HTMLElement, events: Record<string, EventListener>): void {
  Object.entries(events).forEach(([event, handler]) => {
    element.addEventListener(event, handler);
  });
}
