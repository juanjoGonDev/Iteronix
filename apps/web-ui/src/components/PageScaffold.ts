import { Component, createElement, type ComponentProps } from "../shared/Component.js";

export interface PageFrameProps extends ComponentProps {
  children?: unknown;
  className?: string;
}

export interface PageIntroProps extends ComponentProps {
  title: string;
  description?: string | null;
  actions?: HTMLElement | null;
  className?: string;
}

export interface PageNoticeStackProps extends ComponentProps {
  errorMessage?: string | null;
  noticeMessage?: string | null;
  className?: string;
}

export interface PageTabItem {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

export interface PageTabsProps extends ComponentProps {
  items: ReadonlyArray<PageTabItem>;
  sticky?: boolean;
  className?: string;
}

export class PageFrame extends Component<PageFrameProps> {
  override render(): HTMLElement {
    const { children, className = "" } = this.props;

    return createElement("div", {
      className: readPageFrameClassName(className)
    }, [children]);
  }
}

export class PageIntro extends Component<PageIntroProps> {
  override render(): HTMLElement {
    const { title, description = null, actions = null, className = "" } = this.props;

    return createElement("div", {
      className: readPageIntroClassName(className)
    }, [
      createElement("div", { className: "flex min-w-0 flex-col gap-2" }, [
        createElement("h1", { className: "text-3xl font-semibold tracking-tight text-white" }, [title]),
        description
          ? createElement("p", { className: "max-w-3xl text-sm leading-6 text-text-secondary" }, [description])
          : ""
      ]),
      actions ?? ""
    ]);
  }
}

export class PageNoticeStack extends Component<PageNoticeStackProps> {
  override render(): HTMLElement {
    const {
      errorMessage = null,
      noticeMessage = null,
      className = ""
    } = this.props;

    if (!errorMessage && !noticeMessage) {
      return createElement("div", {});
    }

    return createElement("div", {
      className: joinClasses("flex flex-col gap-3", className)
    }, [
      errorMessage
        ? createElement("div", {
            className: "rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
          }, [errorMessage])
        : "",
      noticeMessage
        ? createElement("div", {
            className: "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
          }, [noticeMessage])
        : ""
    ]);
  }
}

export class PageTabs extends Component<PageTabsProps> {
  override render(): HTMLElement {
    const { items, sticky = false, className = "" } = this.props;

    return createElement("div", {
      className: readPageTabsContainerClassName(sticky, className)
    }, [
      createElement("div", { className: "scrollbar-hide flex gap-8 overflow-x-auto pb-1" }, [
        items.map((item) =>
          createElement("button", {
            type: "button",
            key: item.id,
            className: readPageTabButtonClassName(item.active),
            onClick: item.onClick
          }, [item.label])
        )
      ])
    ]);
  }
}

export const readPageFrameClassName = (className = ""): string =>
  joinClasses("mx-auto flex w-full max-w-[1480px] flex-col gap-6 p-6", className);

export const readPageIntroClassName = (className = ""): string =>
  joinClasses("flex flex-col gap-3 md:flex-row md:items-end md:justify-between", className);

export const readPageTabsContainerClassName = (
  sticky: boolean,
  className = ""
): string =>
  joinClasses(
    sticky
      ? "sticky top-0 z-10 border-b border-border-dark bg-background-dark/95 backdrop-blur"
      : "border-b border-border-dark",
    className
  );

export const readPageTabButtonClassName = (active: boolean): string =>
  active
    ? "border-b-2 border-white px-1 pb-3 pt-1 text-sm font-semibold whitespace-nowrap text-white transition-colors"
    : "border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-semibold whitespace-nowrap text-text-secondary transition-colors hover:text-white";

const joinClasses = (...values: ReadonlyArray<string>): string =>
  values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(" ");
