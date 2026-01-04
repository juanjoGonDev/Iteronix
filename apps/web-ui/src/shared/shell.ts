import { appendChildren, createElement, setAttributes, setText } from "./dom.js";
import { createIcon } from "./icons.js";
import { headerActionItems, navigationItems } from "./navigation.js";
import { createButton, createDisabledNote } from "./primitives.js";

type ShellElements = {
  app: HTMLElement;
  outlet: HTMLElement;
  navLinks: HTMLAnchorElement[];
};

const brandLabel = "Iteronix";
const headerTitle = "Agent Orchestration";
const headerSubtitle = "Unified cockpit for provider workflows";
const navTitle = "Navigation";
const workspaceTitle = "Workspace";
const connectionTitle = "Connection";

export const renderShell = (): ShellElements => {
  const app = createElement("div", "app-shell");
  const header = buildHeader();
  const layout = createElement("div", "layout");
  const sidebar = buildSidebar();
  const main = createElement("main", "main");
  const rightPanel = createElement("aside", "right-panel");
  rightPanel.style.display = "none";
  appendChildren(layout, [sidebar.element, main, rightPanel]);
  appendChildren(app, [header, layout]);
  return { app, outlet: main, navLinks: sidebar.links };
};

const buildHeader = (): HTMLElement => {
  const header = createElement("header", "app-header");
  const brand = createElement("div", "brand");
  const brandMark = createElement("div", "brand-mark");
  const brandText = createElement("div");
  const title = createElement("div");
  const subtitle = createElement("div", "muted");
  setText(title, brandLabel);
  setText(subtitle, headerTitle);
  appendChildren(brandText, [title, subtitle]);
  appendChildren(brand, [brandMark, brandText]);
  const actions = createElement("div", "header-actions");
  appendChildren(actions, buildHeaderActions());
  appendChildren(header, [brand, actions]);
  return header;
};

const buildHeaderActions = (): HTMLElement[] => {
  return headerActionItems.flatMap((item) => {
    const button = createButton(item.label, { variant: "secondary", disabled: true });
    const note = createDisabledNote();
    const wrapper = createElement("div");
    appendChildren(wrapper, [button, note]);
    return [wrapper];
  });
};

type SidebarResult = {
  element: HTMLElement;
  links: HTMLAnchorElement[];
};

const buildSidebar = (): SidebarResult => {
  const sidebar = createElement("aside", "sidebar");
  const navSection = createElement("div", "sidebar-section");
  const title = createElement("div", "sidebar-title");
  setText(title, navTitle);
  const list = createElement("nav", "nav-list");
  const links = navigationItems.map((item) => {
    const link = createElement("a", "nav-link") as HTMLAnchorElement;
    setAttributes(link, { href: item.route, "aria-label": item.label });
    const iconWrapper = createElement("span", "nav-icon");
    iconWrapper.appendChild(createIcon(item.icon));
    const label = createElement("span", "nav-label");
    setText(label, item.label);
    appendChildren(link, [iconWrapper, label]);
    list.appendChild(link);
    return link;
  });
  appendChildren(navSection, [title, list]);
  const statusSection = createElement("div", "sidebar-section");
  const statusTitle = createElement("div", "sidebar-title");
  setText(statusTitle, workspaceTitle);
  const statusCard = createElement("div", "panel");
  const statusHeading = createElement("h3");
  setText(statusHeading, connectionTitle);
  const statusBody = createElement("p", "muted");
  setText(statusBody, headerSubtitle);
  appendChildren(statusCard, [statusHeading, statusBody]);
  appendChildren(statusSection, [statusTitle, statusCard]);
  appendChildren(sidebar, [navSection, statusSection]);
  return { element: sidebar, links };
};
