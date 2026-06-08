import { Button } from "./Button.js";
import { Card } from "./Card.js";
import { Component, createElement, type ComponentProps } from "../shared/Component.js";

const OverviewBadgeTone = {
  Positive: "positive",
  Neutral: "neutral"
} as const;

const OverviewValueTone = {
  Default: "default",
  Mono: "mono"
} as const;

const OverviewPanelTone = {
  Default: "default",
  Terminal: "terminal"
} as const;

export type OverviewAccent = "blue" | "orange" | "purple" | "emerald" | "gray" | "rose";
export type OverviewBadgeTone = typeof OverviewBadgeTone[keyof typeof OverviewBadgeTone];
export type OverviewValueTone = typeof OverviewValueTone[keyof typeof OverviewValueTone];
export type OverviewPanelTone = typeof OverviewPanelTone[keyof typeof OverviewPanelTone];

export interface OverviewMetricCardProps extends ComponentProps {
  icon: string;
  accent: OverviewAccent;
  badgeText: string;
  badgeTone: OverviewBadgeTone;
  label: string;
  value: string;
  valueTone?: OverviewValueTone;
  className?: string;
}

export interface OverviewPanelProps extends ComponentProps {
  title: string;
  icon: string;
  tone?: OverviewPanelTone;
  headerMeta?: unknown;
  children?: unknown;
  className?: string;
  bodyClassName?: string;
}

export interface OverviewLogEntry {
  time: string;
  color: OverviewAccent;
  message: string;
  code?: string;
  details?: string;
  trigger?: string;
  error?: boolean;
  opacity?: string;
}

export interface OverviewActivityPanelProps extends ComponentProps {
  entries: ReadonlyArray<OverviewLogEntry>;
  className?: string;
}

export interface OverviewQuickAction {
  icon: string;
  label: string;
  onClick: () => void;
}

export interface OverviewQuickActionsPanelProps extends ComponentProps {
  actions: ReadonlyArray<OverviewQuickAction>;
  className?: string;
}

export class OverviewMetricCard extends Component<OverviewMetricCardProps> {
  override render(): HTMLElement {
    const {
      icon,
      accent,
      badgeText,
      badgeTone,
      label,
      value,
      valueTone = OverviewValueTone.Default,
      className = ""
    } = this.props;

    return createElement(Card, { hover: true, className: `hover:border-primary/30 ${className}` }, [
      createElement("div", { className: "flex justify-between items-start mb-4" }, [
        createElement("div", {
          className: readMetricIconClassName(accent)
        }, [
          createElement("span", { className: "material-symbols-outlined" }, [icon])
        ]),
        createElement("span", {
          className: readMetricBadgeClassName(badgeTone)
        }, [badgeText])
      ]),
      createElement("div", { className: "flex flex-col gap-1" }, [
        createElement("span", { className: "text-text-secondary text-sm font-medium" }, [label]),
        createElement("span", { className: readMetricValueClassName(valueTone) }, [value])
      ])
    ]);
  }
}

export class OverviewPanel extends Component<OverviewPanelProps> {
  override render(): HTMLElement {
    const {
      title,
      icon,
      tone = OverviewPanelTone.Default,
      headerMeta = null,
      children,
      className = "",
      bodyClassName = ""
    } = this.props;

    return createElement("div", {
      className: `${readOverviewPanelClassName(tone)} ${className}`.trim()
    }, [
      createElement("div", {
        className: readOverviewPanelHeaderClassName(tone)
      }, [
        createElement("div", { className: "flex items-center gap-2 text-sm font-semibold text-white" }, [
          createElement("span", {
            className: "material-symbols-outlined text-text-secondary text-[18px]"
          }, [icon]),
          title
        ]),
        headerMeta ?? ""
      ]),
      createElement("div", {
        className: bodyClassName
      }, [children])
    ]);
  }
}

export class OverviewActivityPanel extends Component<OverviewActivityPanelProps> {
  override render(): HTMLElement {
    const { entries, className = "" } = this.props;

    return createElement(OverviewPanel, {
      title: "Live Logs",
      icon: "terminal",
      tone: OverviewPanelTone.Terminal,
      className,
      bodyClassName: "p-4 font-mono text-xs flex-1 overflow-y-auto space-y-4 max-h-[500px]",
      headerMeta: createElement("div", { className: "flex gap-1.5" }, [
        createElement("div", { className: "size-2.5 rounded-full bg-red-500/20 border border-red-500/50" }),
        createElement("div", { className: "size-2.5 rounded-full bg-amber-500/20 border border-amber-500/50" }),
        createElement("div", { className: "size-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50" })
      ]),
      children: entries.map((entry, index) =>
        createElement("div", {
          key: `log-${index}`,
          className: `flex gap-3${entry.opacity ? ` opacity-${entry.opacity}` : ""}`
        }, [
          createElement("div", { className: "flex flex-col items-center" }, [
            createElement("div", {
              className: readOverviewTimelineDotClassName(entry.color)
            }, []),
            index < entries.length - 1
              ? createElement("div", { className: "w-px h-full bg-border-dark my-1" }, [])
              : ""
          ]),
          createElement("div", { className: "flex flex-col gap-1 pb-2" }, [
            createElement("div", { className: "text-text-secondary" }, [entry.time]),
            createElement("div", { className: "text-white" }, [
              entry.message,
              entry.code
                ? createElement("span", { className: readOverviewCodeClassName(entry.color) }, [entry.code])
                : "",
              entry.trigger
                ? createElement("div", { className: "text-text-secondary" }, [
                    entry.details || "",
                    createElement("span", { className: "text-white" }, [entry.trigger])
                  ])
                : ""
            ]),
            entry.details && !entry.trigger
              ? createElement("div", {
                  className: readOverviewDetailClassName(Boolean(entry.error))
                }, [entry.details])
              : ""
          ])
        ])
      )
    });
  }
}

export class OverviewQuickActionsPanel extends Component<OverviewQuickActionsPanelProps> {
  override render(): HTMLElement {
    const { actions, className = "" } = this.props;

    return createElement(OverviewPanel, {
      title: "Quick Actions",
      icon: "bolt",
      tone: OverviewPanelTone.Default,
      className,
      bodyClassName: "space-y-2",
      children: actions.map((action) =>
        createElement(Button, {
          key: action.label,
          variant: "ghost",
          className: "w-full justify-start text-sm group",
          icon: action.icon,
          onClick: action.onClick,
          children: action.label
        })
      )
    });
  }
}

export const readMetricIconClassName = (accent: OverviewAccent): string =>
  ({
    blue: "p-2 bg-blue-500/10 rounded-lg text-blue-500 group-hover:text-blue-400 group-hover:bg-blue-500/20 transition-colors",
    orange: "p-2 bg-orange-500/10 rounded-lg text-orange-500 group-hover:text-orange-400 group-hover:bg-orange-500/20 transition-colors",
    purple: "p-2 bg-purple-500/10 rounded-lg text-purple-500 group-hover:text-purple-400 group-hover:bg-purple-500/20 transition-colors",
    emerald: "p-2 bg-emerald-500/10 rounded-lg text-emerald-500 group-hover:text-emerald-400 group-hover:bg-emerald-500/20 transition-colors",
    gray: "p-2 bg-gray-500/10 rounded-lg text-gray-400 group-hover:text-gray-300 group-hover:bg-gray-500/20 transition-colors",
    rose: "p-2 bg-rose-500/10 rounded-lg text-rose-500 group-hover:text-rose-400 group-hover:bg-rose-500/20 transition-colors"
  })[accent];

export const readMetricBadgeClassName = (tone: OverviewBadgeTone): string =>
  tone === OverviewBadgeTone.Positive
    ? "text-xs font-medium text-emerald-400"
    : "text-xs font-medium text-text-secondary";

export const readMetricValueClassName = (tone: OverviewValueTone): string =>
  tone === OverviewValueTone.Mono
    ? "text-2xl font-bold text-white font-mono"
    : "text-2xl font-bold text-white";

export const readOverviewPanelClassName = (tone: OverviewPanelTone): string =>
  tone === OverviewPanelTone.Terminal
    ? "bg-[#0d1117] border border-border-dark rounded-xl flex flex-col h-full min-h-[400px]"
    : "bg-gradient-to-br from-surface-dark to-slate-900 border border-border-dark rounded-xl p-5";

export const readOverviewPanelHeaderClassName = (tone: OverviewPanelTone): string =>
  tone === OverviewPanelTone.Terminal
    ? "px-4 py-3 border-b border-border-dark flex items-center justify-between bg-surface-dark rounded-t-xl"
    : "mb-3 flex items-center justify-between";

const readOverviewTimelineDotClassName = (accent: OverviewAccent): string =>
  ({
    blue: "size-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] mt-1.5",
    orange: "size-2 rounded-full bg-orange-500 mt-1.5",
    purple: "size-2 rounded-full bg-purple-500 mt-1.5",
    emerald: "size-2 rounded-full bg-emerald-500 mt-1.5",
    gray: "size-2 rounded-full bg-text-secondary mt-1.5",
    rose: "size-2 rounded-full bg-rose-500 mt-1.5"
  })[accent];

const readOverviewCodeClassName = (accent: OverviewAccent): string =>
  ({
    blue: "text-blue-400",
    orange: "text-orange-400",
    purple: "text-purple-400",
    emerald: "text-emerald-400",
    gray: "text-text-secondary",
    rose: "text-rose-400"
  })[accent];

const readOverviewDetailClassName = (error: boolean): string =>
  error
    ? "bg-surface-dark p-2 rounded border border-rose-900/50 text-rose-300 mt-1 bg-rose-950/20"
    : "bg-surface-dark p-2 rounded border border-border-dark text-text-secondary mt-1";
