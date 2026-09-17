import { Button } from "./Button.js";
import { StatusBadge } from "./Card.js";
import {
  Component,
  createElement,
  type ComponentProps,
} from "../shared/Component.js";

/**
 * Shared chrome for the Assets workbench screens (prompts, skills, memory,
 * MCP, plugins). Screens keep their own fields and payload mapping; layout,
 * rows, badges, and the editor dialog come from here so every asset family
 * behaves and looks the same.
 */

const AssetSummaryStatus = {
  Enabled: "enabled",
  Disabled: "disabled",
  Error: "error",
} as const;

type AssetSummaryStatus =
  (typeof AssetSummaryStatus)[keyof typeof AssetSummaryStatus];

type AssetRowAction = {
  label: string;
  icon: string;
  variant?: "ghost" | "secondary" | "danger";
  testId?: string;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
};

const AssetStatusMeta: Record<
  AssetSummaryStatus,
  { label: string; badge: "success" | "paused" | "error"; icon: string }
> = {
  enabled: { label: "Enabled", badge: "success", icon: "bolt" },
  disabled: { label: "Disabled", badge: "paused", icon: "pause_circle" },
  error: { label: "Error", badge: "error", icon: "error" },
};

export const readAssetStatusLabel = (status: AssetSummaryStatus): string =>
  AssetStatusMeta[status].label;

export class AssetStatusBadge extends Component<{
  status: AssetSummaryStatus;
}> {
  override render(): HTMLElement {
    const meta = AssetStatusMeta[this.props.status];

    return createElement(StatusBadge, { status: meta.badge, icon: meta.icon }, [
      meta.label,
    ]);
  }
}

interface AssetRowProps extends ComponentProps {
  testId?: string;
  icon: string;
  title: string;
  subtitle?: string;
  status?: AssetSummaryStatus;
  meta?: ReadonlyArray<string>;
  /** Compact chips, e.g. usage, limit, or permission summaries. */
  chips?: ReadonlyArray<string>;
  /** Secondary detail line, e.g. the last audit event. */
  note?: string;
  /** Rich content under the metadata, e.g. usage links that must stay clickable. */
  extra?: unknown;
  actions?: ReadonlyArray<AssetRowAction>;
}

export class AssetRow extends Component<AssetRowProps> {
  override render(): HTMLElement {
    const {
      testId,
      icon,
      title,
      subtitle = null,
      status = null,
      meta = [],
      chips = [],
      note = null,
      extra = null,
      actions = [],
    } = this.props;

    const visibleMeta = meta.filter((line) => line.trim().length > 0);

    return createElement(
      "article",
      {
        className:
          "flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-[#1c242c] sm:flex-row sm:items-center sm:justify-between",
        ...(testId ? { "data-testid": testId } : {}),
      },
      [
        createElement("div", { className: "flex min-w-0 flex-1 gap-3" }, [
          createElement(
            "span",
            {
              className:
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-dark bg-[#1a2129]",
              "aria-hidden": "true",
            },
            [
              createElement(
                "span",
                {
                  className:
                    "material-symbols-outlined text-[18px] text-primary",
                },
                [icon],
              ),
            ],
          ),
          createElement("div", { className: "min-w-0 flex-1" }, [
            createElement(
              "div",
              { className: "flex flex-wrap items-center gap-x-2 gap-y-1" },
              [
                createElement(
                  "p",
                  { className: "truncate text-sm font-semibold text-white" },
                  [title],
                ),
                status === null
                  ? ""
                  : createElement(AssetStatusBadge, { status }),
              ],
            ),
            subtitle
              ? createElement(
                  "p",
                  {
                    className:
                      "mt-0.5 truncate font-mono text-xs text-text-secondary",
                  },
                  [subtitle],
                )
              : "",
            visibleMeta.length === 0
              ? ""
              : createElement(
                  "p",
                  { className: "mt-1 text-xs leading-5 text-text-secondary" },
                  [visibleMeta.join(" · ")],
                ),
            note
              ? createElement(
                  "p",
                  { className: "mt-1 truncate text-xs text-text-secondary" },
                  [note],
                )
              : "",
            chips.length === 0
              ? ""
              : createElement(
                  "div",
                  { className: "mt-2 flex flex-wrap gap-1.5" },
                  chips.map((chip, index) =>
                    createElement(
                      "span",
                      {
                        key: `chip-${index}`,
                        className:
                          "rounded-full border border-border-dark bg-[#1a2129] px-2 py-0.5 font-mono text-[11px] text-text-secondary",
                      },
                      [chip],
                    ),
                  ),
                ),
            extra === null || extra === undefined
              ? ""
              : createElement("div", { className: "mt-1" }, [extra]),
          ]),
        ]),
        actions.length === 0
          ? ""
          : createElement(
              "div",
              {
                className:
                  "flex flex-wrap items-center justify-start gap-2 sm:justify-end",
              },
              actions.map((action, index) =>
                createElement(Button, {
                  key: `action-${index}`,
                  variant: action.variant ?? "ghost",
                  size: "sm",
                  icon: action.icon,
                  children: action.label,
                  disabled: action.disabled ?? false,
                  ...(action.disabled && action.disabledReason
                    ? { title: action.disabledReason }
                    : {}),
                  onClick: () => action.onClick(),
                  ...(action.testId
                    ? { dataset: { testid: action.testId } }
                    : {}),
                }),
              ),
            ),
      ],
    );
  }
}

interface AssetRowListProps extends ComponentProps {
  testId?: string;
  rows: ReadonlyArray<HTMLElement>;
}

export class AssetRowList extends Component<AssetRowListProps> {
  override render(): HTMLElement {
    const { testId, rows } = this.props;

    return createElement(
      "section",
      {
        className:
          "divide-y divide-[#202832] overflow-hidden rounded-2xl border border-[#202832] bg-[#171c22]",
        ...(testId ? { "data-testid": testId } : {}),
      },
      [...rows],
    );
  }
}

interface AssetEditorDialogProps extends ComponentProps {
  testId: string;
  title: string;
  description?: string;
  children: unknown;
  save: {
    label: string;
    testId?: string;
    disabled?: boolean;
    disabledReason?: string;
    onClick: () => void;
  };
  onClose: () => void;
  closeTestId?: string;
  destructive?: {
    label: string;
    testId?: string;
    onClick: () => void;
  } | null;
}

export class AssetEditorDialog extends Component<AssetEditorDialogProps> {
  override render(): HTMLElement {
    const {
      testId,
      title,
      description = null,
      children,
      save,
      onClose,
      closeTestId = null,
      destructive = null,
    } = this.props;
    const titleId = `${testId}-title`;

    return createElement(
      "section",
      {
        className:
          "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
        "data-testid": testId,
      },
      [
        createElement(
          "div",
          {
            className:
              "flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#202832] bg-[#171c22] shadow-2xl",
          },
          [
            createElement(
              "header",
              {
                className:
                  "flex items-start justify-between gap-4 border-b border-border-dark px-5 py-4",
              },
              [
                createElement("div", { className: "min-w-0" }, [
                  createElement(
                    "h2",
                    {
                      id: titleId,
                      className: "text-base font-semibold text-white",
                    },
                    [title],
                  ),
                  description
                    ? createElement(
                        "p",
                        { className: "mt-1 text-sm text-text-secondary" },
                        [description],
                      )
                    : "",
                ]),
                createElement(Button, {
                  variant: "ghost",
                  size: "sm",
                  icon: "close",
                  children: null,
                  "aria-label": "Close editor",
                  ...(closeTestId ? { dataset: { testid: closeTestId } } : {}),
                  onClick: () => onClose(),
                }),
              ],
            ),
            createElement(
              "div",
              { className: "flex-1 overflow-y-auto px-5 py-4" },
              [children],
            ),
            createElement(
              "footer",
              {
                className:
                  "flex flex-col-reverse gap-2 border-t border-border-dark px-5 py-4 sm:flex-row sm:items-center sm:justify-end",
              },
              [
                destructive
                  ? createElement(Button, {
                      variant: "danger",
                      size: "sm",
                      icon: "delete",
                      children: destructive.label,
                      ...(destructive.testId
                        ? { dataset: { testid: destructive.testId } }
                        : {}),
                      onClick: () => destructive.onClick(),
                    })
                  : "",
                createElement("div", { className: "flex justify-end gap-2" }, [
                  createElement(Button, {
                    variant: "ghost",
                    size: "sm",
                    children: "Cancel",
                    onClick: () => onClose(),
                  }),
                  createElement(Button, {
                    variant: "primary",
                    size: "sm",
                    children: save.label,
                    disabled: save.disabled ?? false,
                    ...(save.disabled && save.disabledReason
                      ? { title: save.disabledReason }
                      : {}),
                    ...(save.testId
                      ? { dataset: { testid: save.testId } }
                      : {}),
                    onClick: () => save.onClick(),
                  }),
                ]),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

interface AssetConfirmDialogProps extends ComponentProps {
  testId: string;
  title: string;
  message: string;
  confirmLabel: string;
  confirmTestId?: string;
  onConfirm: () => void;
  cancelLabel: string;
  cancelTestId?: string;
  onCancel: () => void;
  confirmDisabled?: boolean;
  confirmDisabledReason?: string;
  /** Optional detail list rendered between the message and the buttons. */
  children?: unknown;
}

export class AssetConfirmDialog extends Component<AssetConfirmDialogProps> {
  override render(): HTMLElement {
    const {
      testId,
      title,
      message,
      confirmLabel,
      confirmTestId = null,
      onConfirm,
      cancelLabel,
      cancelTestId = null,
      onCancel,
      confirmDisabled = false,
      confirmDisabledReason = null,
      children = null,
    } = this.props;
    const titleId = `${testId}-title`;

    return createElement(
      "section",
      {
        className:
          "fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4",
        role: "alertdialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
        "data-testid": testId,
      },
      [
        createElement(
          "div",
          {
            className:
              "w-full max-w-md rounded-2xl border border-[#202832] bg-[#171c22] p-5 shadow-2xl",
          },
          [
            createElement(
              "h3",
              { id: titleId, className: "text-base font-semibold text-white" },
              [title],
            ),
            createElement(
              "p",
              { className: "mt-2 text-sm leading-6 text-text-secondary" },
              [message],
            ),
            children
              ? createElement("div", { className: "mt-4 grid gap-2" }, [
                  children,
                ])
              : "",
            createElement("div", { className: "mt-5 flex justify-end gap-2" }, [
              createElement(Button, {
                variant: "ghost",
                size: "sm",
                children: cancelLabel,
                ...(cancelTestId ? { dataset: { testid: cancelTestId } } : {}),
                onClick: () => onCancel(),
              }),
              createElement(Button, {
                variant: "danger",
                size: "sm",
                icon: "delete",
                children: confirmLabel,
                disabled: confirmDisabled,
                ...(confirmDisabled && confirmDisabledReason
                  ? { title: confirmDisabledReason }
                  : {}),
                ...(confirmTestId
                  ? { dataset: { testid: confirmTestId } }
                  : {}),
                onClick: () => onConfirm(),
              }),
            ]),
          ],
        ),
      ],
    );
  }
}
