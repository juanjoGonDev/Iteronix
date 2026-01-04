export type ElementGuard<T extends Element> = (value: Element | null) => value is T;

export const isHTMLElement = (value: Element | null): value is HTMLElement =>
  value instanceof HTMLElement;

export const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
};

export const createSvgElement = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  className?: string
): SVGElementTagNameMap[K] => {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if (className) {
    element.setAttribute("class", className);
  }
  return element;
};

export const clearChildren = (element: HTMLElement): void => {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

export const appendChildren = (parent: HTMLElement, children: HTMLElement[]): void => {
  children.forEach((child) => {
    parent.appendChild(child);
  });
};

export const setText = (element: HTMLElement, text: string): void => {
  element.textContent = text;
};

export const setAttributes = (element: Element, attributes: Record<string, string>): void => {
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
};

export const selectElement = <T extends Element>(
  root: ParentNode,
  selector: string,
  guard: ElementGuard<T>
): T | null => {
  const element = root.querySelector(selector);
  if (guard(element)) {
    return element;
  }
  return null;
};
