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

export type ToastKind = "success" | "error";

const GlobalToastViewportId = "iteronix-global-toast-viewport";
const GlobalToastDismissMs = 4500;
const activeToastKeys = new Set<string>();

export interface ToastRecord {
  id: string;
  kind: ToastKind;
  message: string;
}

export interface ToastStackProps extends ComponentProps {
  toasts: ReadonlyArray<ToastRecord>;
  onDismiss: (id: string) => void;
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
        createElement("h1", { className: readPageIntroTitleClassName() }, [title]),
        description
          ? createElement("p", { className: readPageIntroDescriptionClassName() }, [description])
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
      noticeMessage = null
    } = this.props;

    if (errorMessage) {
      showGlobalToast("error", errorMessage);
    }

    if (noticeMessage) {
      showGlobalToast("success", noticeMessage);
    }

    return createElement("div", {
      "data-notice-stack": "global-toast-adapter",
      className: "hidden"
    });
  }
}

export class ToastStack extends Component<ToastStackProps> {
  override render(): HTMLElement {
    const { toasts, onDismiss } = this.props;

    return createElement("div", {
      className: "pointer-events-none fixed right-5 top-20 z-50 flex w-[min(420px,calc(100vw-32px))] flex-col gap-3"
    }, [
      toasts.map((toast) =>
        createElement("div", {
          className: readToastClassName(toast.kind),
          "data-testid": `toast-${toast.kind}`
        }, [
          createElement("span", { className: "min-w-0 flex-1" }, [toast.message]),
          createElement("button", {
            type: "button",
            className: "ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-current opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current/30",
            "aria-label": "Dismiss notification",
            onClick: () => onDismiss(toast.id)
          }, [
            createElement("span", { className: "material-symbols-outlined text-[18px]" }, ["close"])
          ])
        ])
      )
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

export const readPageIntroTitleClassName = (): string =>
  "text-3xl font-semibold tracking-tight text-slate-950";

export const readPageIntroDescriptionClassName = (): string =>
  "max-w-3xl text-sm leading-6 text-slate-600";

export const readPageTabsContainerClassName = (
  sticky: boolean,
  className = ""
): string =>
  joinClasses(
    sticky
      ? "sticky top-0 z-10 border-b border-slate-300 bg-background-light"
      : "border-b border-slate-300",
    className
  );

export const readPageTabButtonClassName = (active: boolean): string =>
  active
    ? "border-b-2 border-slate-950 px-1 pb-3 pt-1 text-sm font-semibold whitespace-nowrap text-slate-950 transition-colors"
    : "border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-semibold whitespace-nowrap text-slate-600 transition-colors hover:text-slate-950";

export const readToastClassName = (kind: ToastKind): string =>
  joinClasses(
    "pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-[0_8px_18px_rgba(15,23,42,0.12)]",
    kind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : "border-rose-200 bg-rose-50 text-rose-950"
  );

export const readToastViewportClassName = (): string =>
  "pointer-events-none fixed right-5 top-20 z-50 flex w-[min(420px,calc(100vw-32px))] flex-col gap-3";

export const showGlobalToast = (kind: ToastKind, message: string): void => {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0 || typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const toastKey = `${kind}:${trimmedMessage}`;
  if (activeToastKeys.has(toastKey)) {
    return;
  }

  const viewport = ensureGlobalToastViewport();
  activeToastKeys.add(toastKey);

  let timeoutId: number | undefined;
  const toast = createGlobalToastElement(kind, trimmedMessage, () => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
    removeGlobalToast(toastKey, toast);
  });

  viewport.appendChild(toast);
  timeoutId = window.setTimeout(() => {
    removeGlobalToast(toastKey, toast);
  }, GlobalToastDismissMs);
};

const joinClasses = (...values: ReadonlyArray<string>): string =>
  values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(" ");

const ensureGlobalToastViewport = (): HTMLElement => {
  const existingViewport = document.getElementById(GlobalToastViewportId);
  if (existingViewport instanceof HTMLElement) {
    return existingViewport;
  }

  const viewport = document.createElement("div");
  viewport.id = GlobalToastViewportId;
  viewport.className = readToastViewportClassName();
  document.body.appendChild(viewport);
  return viewport;
};

const createGlobalToastElement = (
  kind: ToastKind,
  message: string,
  onDismiss: () => void
): HTMLElement => {
  const toast = document.createElement("div");
  toast.className = readToastClassName(kind);
  toast.dataset["testid"] = `toast-${kind}`;

  const content = document.createElement("span");
  content.className = "min-w-0 flex-1";
  content.textContent = message;

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.className = "ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-current opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-current/30";
  dismissButton.setAttribute("aria-label", "Dismiss notification");
  dismissButton.addEventListener("click", onDismiss);

  const dismissIcon = document.createElement("span");
  dismissIcon.className = "material-symbols-outlined text-[18px]";
  dismissIcon.textContent = "close";

  dismissButton.appendChild(dismissIcon);
  toast.appendChild(content);
  toast.appendChild(dismissButton);
  return toast;
};

const removeGlobalToast = (toastKey: string, toast: HTMLElement): void => {
  activeToastKeys.delete(toastKey);
  toast.remove();
};
