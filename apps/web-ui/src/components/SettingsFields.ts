import { StatusBadge } from "./Card.js";
import { Component, createElement, type ComponentProps } from "../shared/Component.js";

interface SettingsFieldProps extends ComponentProps {
  label: string;
  children?: unknown;
  className?: string;
}

interface SettingsTextFieldProps extends ComponentProps {
  label: string;
  value: string;
  placeholder: string;
  testId: string;
  type?: "text" | "password";
  onChange: (value: string) => void;
}

interface SettingsNumberFieldProps extends ComponentProps {
  label: string;
  value: number;
  disabled?: boolean;
  testId: string;
  onChange: (value: string) => void;
}

interface SettingsSelectFieldOption {
  value: string;
  label: string;
}

interface SettingsSelectFieldProps extends ComponentProps {
  label: string;
  value: string;
  testId: string;
  options: ReadonlyArray<SettingsSelectFieldOption>;
  onChange: (value: string) => void;
}

interface SettingsSecretFieldProps extends ComponentProps {
  label: string;
  value: string;
  placeholder: string;
  testId: string;
  onChange: (value: string) => void;
}

interface SettingsToggleFieldProps extends ComponentProps {
  label: string;
  description: string;
  checked: boolean;
  testId: string;
  onChange: (checked: boolean) => void;
}

export class SettingsField extends Component<SettingsFieldProps> {
  override render(): HTMLElement {
    const { label, children, className = "" } = this.props;

    return createElement("label", {
      className: joinClasses("flex flex-col gap-2", className)
    }, [
      createElement("span", { className: "text-[13px] font-medium text-slate-100" }, [label]),
      children
    ]);
  }
}

export class SettingsTextField extends Component<SettingsTextFieldProps> {
  override render(): HTMLElement {
    const { label, value, placeholder, testId, type = "text", onChange } = this.props;

    return createElement(SettingsField, {
      label,
      children: createElement("input", {
        type,
        value,
        placeholder,
        "data-testid": testId,
        className: readSettingsInputClassName(),
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            onChange(target.value);
          }
        }
      })
    });
  }
}

export class SettingsNumberField extends Component<SettingsNumberFieldProps> {
  override render(): HTMLElement {
    const { label, value, disabled = false, testId, onChange } = this.props;

    return createElement(SettingsField, {
      label,
      children: createElement("input", {
        type: "number",
        value: value.toString(),
        disabled,
        "data-testid": testId,
        className: `${readSettingsInputClassName()} disabled:opacity-50`,
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            onChange(target.value);
          }
        }
      })
    });
  }
}

export class SettingsSelectField extends Component<SettingsSelectFieldProps> {
  override render(): HTMLElement {
    const { label, value, testId, options, onChange } = this.props;

    return createElement(SettingsField, {
      label,
      children: createElement("select", {
        value,
        "data-testid": testId,
        className: readSettingsSelectClassName(),
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLSelectElement) {
            onChange(target.value);
          }
        }
      }, options.map((option) =>
        createElement("option", { value: option.value }, [option.label])
      ))
    });
  }
}

export class SettingsSecretField extends Component<SettingsSecretFieldProps> {
  override render(): HTMLElement {
    const { label, value, placeholder, testId, onChange } = this.props;

    return createElement("label", { className: "flex flex-col gap-2" }, [
      createElement("div", { className: "flex items-center justify-between gap-3" }, [
        createElement("span", { className: "text-[13px] font-medium text-slate-100" }, [label]),
        createElement(StatusBadge, { status: "warning" }, ["session only"])
      ]),
      createElement("input", {
        type: "password",
        value,
        placeholder,
        "data-testid": testId,
        className: readSettingsInputClassName(),
        onChange: (event: Event) => {
          const target = event.target;
          if (target instanceof HTMLInputElement) {
            onChange(target.value);
          }
        }
      }),
      createElement("span", { className: "text-xs text-text-secondary" }, [
        "The browser keeps this key only in memory for the current session."
      ])
    ]);
  }
}

export class SettingsToggleField extends Component<SettingsToggleFieldProps> {
  override render(): HTMLElement {
    const { label, description, checked, testId, onChange } = this.props;

    return createElement("div", {
      className: "flex items-center justify-between gap-4 rounded-xl border border-[#2b3644] bg-[#1a2129] px-4 py-4"
    }, [
      createElement("div", { className: "flex min-w-0 flex-col gap-1" }, [
        createElement("span", { className: "text-sm font-medium text-white" }, [label]),
        createElement("span", { className: "text-xs text-text-secondary" }, [description])
      ]),
      createElement("button", {
        type: "button",
        role: "switch",
        "aria-checked": String(checked),
        "data-testid": testId,
        className: readSettingsToggleTrackClassName(checked),
        onClick: () => onChange(!checked)
      }, [
        createElement("span", {
          className: readSettingsToggleKnobClassName(checked)
        })
      ])
    ]);
  }
}

export const readSettingsInputClassName = (): string =>
  "min-h-11 w-full rounded-xl border border-[#2b3644] bg-[#1a2129] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export const readSettingsSelectClassName = (): string =>
  "min-h-11 w-full rounded-xl border border-[#2b3644] bg-[#1a2129] px-3.5 py-2.5 text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export const readSettingsToggleTrackClassName = (checked: boolean): string =>
  joinClasses(
    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40",
    checked
      ? "border-primary bg-primary"
      : "border-[#3a4655] bg-[#2b3644]"
  );

export const readSettingsToggleKnobClassName = (checked: boolean): string =>
  joinClasses(
    "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
    checked ? "translate-x-5" : "translate-x-0.5"
  );

const joinClasses = (...values: ReadonlyArray<string>): string =>
  values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join(" ");
