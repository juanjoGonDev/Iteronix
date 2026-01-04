import { appendChildren, createElement, setAttributes, setText } from "./dom.js";

const notAvailableText = "Not available yet";
const inputTypeText = "text";

export const createButton = (
  label: string,
  options: { variant?: "primary" | "secondary"; disabled?: boolean } = {}
): HTMLButtonElement => {
  const button = createElement("button", buildButtonClass(options.variant));
  button.type = "button";
  button.disabled = options.disabled ?? false;
  setText(button, label);
  return button;
};

export const createInput = (placeholder: string, type = inputTypeText): HTMLInputElement => {
  const input = createElement("input", "input");
  setAttributes(input, { placeholder, type });
  return input;
};

export const createSelect = (options: string[]): HTMLSelectElement => {
  const select = createElement("select", "select");
  options.forEach((optionLabel) => {
    const option = createElement("option");
    setText(option, optionLabel);
    select.appendChild(option);
  });
  return select;
};

export const createCard = (title: string, description: string): HTMLElement => {
  const card = createElement("div", "card");
  const heading = createElement("h3");
  setText(heading, title);
  const body = createElement("p", "muted");
  setText(body, description);
  appendChildren(card, [heading, body]);
  return card;
};

export const createPanel = (title: string, content: string): HTMLElement => {
  const panel = createElement("div", "panel");
  const heading = createElement("h3");
  setText(heading, title);
  const body = createElement("p", "muted");
  setText(body, content);
  appendChildren(panel, [heading, body]);
  return panel;
};

export const createBadge = (label: string): HTMLElement => {
  const badge = createElement("span", "badge");
  setText(badge, label);
  return badge;
};

export const createTabs = (labels: string[], activeIndex: number): HTMLElement => {
  const container = createElement("div", "tabs");
  labels.forEach((label, index) => {
    const tab = createElement("button", index === activeIndex ? "tab active" : "tab");
    tab.type = "button";
    tab.disabled = true;
    setText(tab, label);
    container.appendChild(tab);
  });
  return container;
};

export const createPopover = (content: string): HTMLElement => {
  const popover = createElement("div", "popover");
  setText(popover, content);
  return popover;
};

export const createDisabledNote = (): HTMLElement => {
  const note = createElement("p", "disabled-note");
  setText(note, notAvailableText);
  return note;
};

const buildButtonClass = (variant?: "primary" | "secondary"): string => {
  if (variant === "primary") {
    return "btn primary";
  }
  return "btn";
};
