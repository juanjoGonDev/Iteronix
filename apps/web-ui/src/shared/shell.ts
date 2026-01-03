import {
  clearChildren,
  createElement,
  isHTMLButtonElement,
  isHTMLElement,
  isHTMLInputElement,
  selectElement
} from "./dom.js";
import { headerActionIds, headerActions, navigationItems } from "./ui.js";

type ShellContext = {
  root: ParentNode;
};

type ActionTargets = {
  baseUrlInput: HTMLInputElement | null;
  runStartButton: HTMLButtonElement | null;
};

const scrollBehavior: ScrollBehavior = "smooth";
const scrollBlock: ScrollLogicalPosition = "start";

export const initShell = (context: ShellContext): void => {
  const navList = selectElement(context.root, "[data-nav-list]", isHTMLElement);
  const topActions = selectElement(context.root, "[data-top-actions]", isHTMLElement);
  const baseUrlInput = selectElement(
    context.root,
    "[data-base-url]",
    isHTMLInputElement
  );
  const runStartButton = selectElement(
    context.root,
    "[data-run-start]",
    isHTMLButtonElement
  );
  renderNavigation(navList);
  renderHeaderActions(topActions, context.root, {
    baseUrlInput,
    runStartButton
  });
};

const renderNavigation = (container: HTMLElement | null): void => {
  if (!container) {
    return;
  }
  clearChildren(container);
  navigationItems.forEach((item) => {
    container.appendChild(buildNavItem(item));
  });
};

const renderHeaderActions = (
  container: HTMLElement | null,
  root: ParentNode,
  targets: ActionTargets
): void => {
  if (!container) {
    return;
  }
  clearChildren(container);
  headerActions.forEach((action) => {
    container.appendChild(buildHeaderAction(action, root, targets));
  });
};

const buildNavItem = (item: (typeof navigationItems)[number]): HTMLElement => {
  const link = createElement("a", "nav-link");
  link.href = item.target;
  const label = createElement("span");
  label.textContent = item.label;
  const chip = createElement("span", "chip");
  chip.textContent = item.chip;
  link.appendChild(label);
  link.appendChild(chip);
  return link;
};

const buildHeaderAction = (
  action: (typeof headerActions)[number],
  root: ParentNode,
  targets: ActionTargets
): HTMLElement => {
  const wrapper = createElement("div", "top-action");
  const button = createElement("button", buildActionClass(action.variant));
  button.type = "button";
  button.textContent = action.label;
  button.addEventListener("click", () => {
    handleHeaderAction(action.id, action.target, root, targets);
  });
  wrapper.appendChild(button);
  return wrapper;
};

const buildActionClass = (variant: "primary" | "secondary"): string =>
  variant === "primary" ? "btn primary" : "btn";

const handleHeaderAction = (
  actionId: (typeof headerActions)[number]["id"],
  target: string,
  root: ParentNode,
  targets: ActionTargets
): void => {
  const targetSection = root.querySelector(target);
  if (targetSection instanceof HTMLElement) {
    targetSection.scrollIntoView({ behavior: scrollBehavior, block: scrollBlock });
  }
  if (actionId === headerActionIds.connect && targets.baseUrlInput) {
    targets.baseUrlInput.focus();
  }
  if (actionId === headerActionIds.newRun && targets.runStartButton) {
    targets.runStartButton.focus();
  }
};
