export type ElementGuard<T extends Element> = (value: Element | null) => value is T;

export const isHTMLElement = (value: Element | null): value is HTMLElement =>
  value instanceof HTMLElement;

export const isHTMLInputElement = (value: Element | null): value is HTMLInputElement =>
  value instanceof HTMLInputElement;

export const isHTMLSelectElement = (value: Element | null): value is HTMLSelectElement =>
  value instanceof HTMLSelectElement;

export const isHTMLTextAreaElement = (value: Element | null): value is HTMLTextAreaElement =>
  value instanceof HTMLTextAreaElement;

export const isHTMLButtonElement = (value: Element | null): value is HTMLButtonElement =>
  value instanceof HTMLButtonElement;

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

export const selectElements = <T extends Element>(
  root: ParentNode,
  selector: string,
  guard: ElementGuard<T>
): T[] => Array.from(root.querySelectorAll(selector)).filter((element): element is T => guard(element));

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

export const clearChildren = (element: HTMLElement | null): void => {
  if (!element) {
    return;
  }
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
};

export const setText = (element: HTMLElement | null, text: string): void => {
  if (!element) {
    return;
  }
  element.textContent = text;
};

export const setDisplay = (element: HTMLElement | null, visible: boolean): void => {
  if (!element) {
    return;
  }
  element.style.display = visible ? "" : "none";
};

export const appendChildren = (parent: HTMLElement, children: HTMLElement[]): void => {
  children.forEach((child) => {
    parent.appendChild(child);
  });
};
