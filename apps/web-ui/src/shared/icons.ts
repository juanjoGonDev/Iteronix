import { createSvgElement, setAttributes } from "./dom.js";

export const iconNames = {
  overview: "overview",
  projects: "projects",
  repository: "repository",
  runs: "runs",
  settings: "settings",
  kanban: "kanban"
} as const;

export type IconName = typeof iconNames[keyof typeof iconNames];

type IconDefinition = {
  viewBox: string;
  path: string;
};

const iconSize = "18";
const iconViewBox = "0 0 24 24";

const iconMap: Record<IconName, IconDefinition> = {
  overview: {
    viewBox: iconViewBox,
    path: "M3 12h8V3H3v9zm0 9h8v-7H3v7zm10 0h8v-9h-8v9zm0-18v7h8V3h-8z"
  },
  projects: {
    viewBox: iconViewBox,
    path: "M4 6h6l2 2h8v10H4V6zm0 12h16v2H4v-2z"
  },
  repository: {
    viewBox: iconViewBox,
    path: "M4 4h16v4H4V4zm0 6h10v4H4v-4zm0 6h16v4H4v-4z"
  },
  runs: {
    viewBox: iconViewBox,
    path: "M5 4h4v16H5V4zm10 0h4v16h-4V4z"
  },
  settings: {
    viewBox: iconViewBox,
    path: "M12 8a4 4 0 100 8 4 4 0 000-8zm8.94 4a7.93 7.93 0 00-.6-2.38l2-1.55-2-3.46-2.35 1a8 8 0 00-2.06-1.2l-.35-2.5H10.4l-.35 2.5a8 8 0 00-2.06 1.2l-2.35-1-2 3.46 2 1.55A7.93 7.93 0 003.06 12c0 .82.12 1.62.34 2.38l-2 1.55 2 3.46 2.35-1a8 8 0 002.06 1.2l.35 2.5h4.2l.35-2.5a8 8 0 002.06-1.2l2.35 1 2-3.46-2-1.55c.22-.76.34-1.56.34-2.38z"
  },
  kanban: {
    viewBox: iconViewBox,
    path: "M4 5h4v14H4V5zm6 0h4v10h-4V5zm6 0h4v6h-4V5z"
  }
};

export const createIcon = (name: IconName): SVGSVGElement => {
  const definition = iconMap[name];
  const svg = createSvgElement("svg");
  setAttributes(svg, {
    viewBox: definition.viewBox,
    fill: "currentColor",
    width: iconSize,
    height: iconSize,
    "aria-hidden": "true",
    focusable: "false"
  });
  const path = createSvgElement("path");
  setAttributes(path, { d: definition.path });
  svg.appendChild(path);
  return svg;
};
