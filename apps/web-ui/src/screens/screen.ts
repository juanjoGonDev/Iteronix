import { appendChildren, createElement, setText } from "../shared/dom.js";
import {
  createBadge,
  createButton,
  createCard,
  createDisabledNote,
  createPanel
} from "../shared/primitives.js";

type ScreenConfig = {
  title: string;
  description: string;
  badges: string[];
  cards: { title: string; description: string }[];
};

const primaryActionLabel = "Primary action";
const statusTitle = "Status";
const statusBody = "Baseline screen stub for navigation coverage.";

export const createScreen = (config: ScreenConfig): HTMLElement => {
  const section = createElement("section");
  const header = createElement("div", "screen-header");
  const title = createElement("h2", "screen-title");
  setText(title, config.title);
  const badgeRow = createElement("div");
  config.badges.forEach((label) => {
    badgeRow.appendChild(createBadge(label));
  });
  appendChildren(header, [title, badgeRow]);

  const description = createElement("p", "muted");
  setText(description, config.description);

  const actionRow = createElement("div");
  const primaryAction = createButton(primaryActionLabel, { variant: "primary", disabled: true });
  const disabledNote = createDisabledNote();
  appendChildren(actionRow, [primaryAction, disabledNote]);

  const panelGrid = createElement("div", "panel-grid");
  panelGrid.appendChild(createPanel(statusTitle, statusBody));
  config.cards.forEach((card) => {
    panelGrid.appendChild(createCard(card.title, card.description));
  });

  appendChildren(section, [header, description, actionRow, panelGrid]);
  return section;
};
